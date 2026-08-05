import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { appLocalDataDir } from '@tauri-apps/api/path';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    FolderOpen,
    RotateCcw,
    Database,
    Image,
    CheckCircle2,
    User,
    Palette,
    Download,
    Upload,
    AlertCircle,
    Loader2,
    ExternalLink,
    Plus,
    X,
    Info,
    Copy,
    ScrollText,
    ChevronDown,
    ChevronRight,
    ImageOff,
    Bot,
    ShieldCheck,
    KeyRound,
    Trash2,
    RefreshCw,
    Activity,
    Server
} from 'lucide-react';
import { exportToFile, importFromFile, getDataStats, type ImportResult } from '../lib/csv-logic';
import { DB_FILENAME, dbService } from '../lib/db';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CleanupImagesModal } from '../components/CleanupImagesModal';
import { scanOrphanedImages, type ScanResult } from '../lib/image-cleanup';
import { resetThumbnailImageCache } from '../lib/utils';
import {
    getDataDirectory,
    setDataDirectory,
    clearDataDirectory,
    hasCustomDataDirectory,
    getDisplayName,
    setDisplayName,
    clearDisplayName,
    hasCustomDisplayName,
    getNavigationYears,
    getRatingDisplayMode,
    setRatingDisplayMode,
    isAdultMediaEnabled,
    setAdultMediaEnabled,
    isFeaturedAdultAllowed,
    setFeaturedAdultAllowed
} from '../lib/settings';
import { useTheme } from '../lib/ThemeContext';
import type { ColorTheme, GlassStyle } from '../lib/themes';
import { getCurrentYearString, updateNavigationYears } from '../lib/navigation-years';
import {
    buildCodexMcpConfig,
    buildOpenCodeMcpConfig,
    buildVsCodeMcpConfig,
    chooseNewMcpEndpoint,
    clearMcpAccessLog,
    createMcpCredential,
    getMcpAccessLog,
    getMcpStatus,
    resyncMcpDatabase,
    revokeMcpCredential,
    setMcpAdultOptIn,
    setMcpEnabled,
    setMcpGlobalAdultEnabled,
    suspendMcpRuntime,
    type McpAuditEvent,
    type McpCredentialSecret,
    type McpRuntimeState,
    type McpStatus
} from '../lib/mcp';
import changelogData from '../data/changelog.json';
import packageJson from '../../package.json';
import tauriConfig from '../../src-tauri/tauri.conf.json';

type SettingsSection = 'general' | 'appearance' | 'ai-access' | 'data' | 'changelog' | 'about';
type BackupFormat = 'json' | 'zip';
type ClearThumbnailCacheResult = { filesRemoved: number; bytesRemoved: number };

type ChangelogRelease = {
    version: string;
    title: string;
    date: string;
    body: string;
    prerelease: boolean;
    url?: string;
};

type ChangelogData = {
    generatedAt: string | null;
    source: string;
    repository: string | null;
    releases: ChangelogRelease[];
};

type EnvironmentInfo = {
    platform: string;
    userAgent: string;
    language: string;
    timezone: string;
    viewport: string;
    screen: string;
    devicePixelRatio: string;
    hardwareConcurrency: string;
};

type BackupZipReadResult = {
    backupJson: string;
};

type ExtractBackupAssetsResult = {
    assetsRestored: number;
    cleanupWarnings: string[];
};

const appMetadata = {
    appName: tauriConfig.productName,
    appVersion: tauriConfig.version,
    appIdentifier: tauriConfig.identifier,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    tauriApiVersion: packageJson.dependencies['@tauri-apps/api'] ?? 'Unknown',
    tauriCliVersion: packageJson.devDependencies['@tauri-apps/cli'] ?? 'Unknown',
    reactVersion: packageJson.dependencies.react ?? 'Unknown',
};

const changelog = changelogData as ChangelogData;
const markdownPlugins = [remarkGfm];

function formatReleaseDate(value: string): string {
    const [year, month, day] = value.split('-').map(Number);

    if (!year || !month || !day) {
        return value || 'Unknown date';
    }

    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    }).format(new Date(year, month - 1, day));
}

function formatGeneratedAt(value: string | null): string {
    if (!value) return 'Not synced yet';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(date);
}

function formatMcpTimestamp(value: string | null | undefined): string {
    if (!value) return 'Never';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
}

function getMcpStateLabel(state: McpRuntimeState | null): string {
    switch (state) {
        case 'running':
            return 'Running';
        case 'starting':
            return 'Starting';
        case 'error':
            return 'Error';
        case 'off':
            return 'Off';
        default:
            return 'Loading';
    }
}

function getEnvironmentInfo(): EnvironmentInfo {
    return {
        platform: navigator.platform || 'Unknown',
        userAgent: navigator.userAgent || 'Unknown',
        language: navigator.language || 'Unknown',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
        viewport: `${window.innerWidth} x ${window.innerHeight}`,
        screen: `${window.screen.width} x ${window.screen.height}`,
        devicePixelRatio: String(window.devicePixelRatio || 1),
        hardwareConcurrency: navigator.hardwareConcurrency
            ? `${navigator.hardwareConcurrency} logical processors`
            : 'Unknown',
    };
}

function AboutInfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="settings-row">
            <div className="settings-row-label">{label}</div>
            <div
                className="settings-row-value"
                style={{
                    textAlign: 'right',
                    justifyContent: 'flex-end',
                    fontFamily: mono ? "'SF Mono', 'Menlo', monospace" : undefined,
                    fontSize: mono ? 12 : undefined,
                    maxWidth: '70%',
                    overflowWrap: 'anywhere'
                }}
            >
                {value}
            </div>
        </div>
    );
}

function createFailedImportResult(error: unknown): ImportResult {
    return {
        success: false,
        mediaEntriesImported: 0,
        mediaEntriesSkipped: 0,
        collectionsImported: 0,
        collectionsSkipped: 0,
        awardTemplatesImported: 0,
        awardCategoriesImported: 0,
        awardWinnersImported: 0,
        profilesImported: 0,
        assetsRestored: 0,
        errors: [String(error)],
    };
}

export default function Settings() {
    const [activeSection, setActiveSection] = useState<SettingsSection>('general');
    const [expandedReleaseVersion, setExpandedReleaseVersion] = useState<string | null>(() => changelog.releases[0]?.version ?? null);
    const [currentPath, setCurrentPath] = useState<string>('');
    const [defaultPath, setDefaultPath] = useState<string>('');
    const [isCustom, setIsCustom] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [environmentInfo, setEnvironmentInfo] = useState<EnvironmentInfo>(() => getEnvironmentInfo());

    // Display name state
    const [displayName, setDisplayNameState] = useState<string>('');
    const [isCustomName, setIsCustomName] = useState(false);
    const [navigationYears, setNavigationYearsState] = useState<string[]>(() => getNavigationYears());
    const [yearInput, setYearInput] = useState('');
    const [yearError, setYearError] = useState('');
    const [ratingDisplayMode, setRatingDisplayModeState] = useState<'pill' | 'vertical-pill' | 'thermometer'>(() => getRatingDisplayMode());

    // Adult Media visibility toggle + its "hide existing entries" confirmation
    const [adultMediaEnabled, setAdultMediaEnabledState] = useState<boolean>(() => isAdultMediaEnabled());
    const [showAdultConfirm, setShowAdultConfirm] = useState(false);
    const [adultCount, setAdultCount] = useState(0);
    const [isAdultPolicyBusy, setIsAdultPolicyBusy] = useState(false);
    const adultPolicyBusyRef = useRef(false);

    // Featured entry adult filter (independent of the global Adult Media toggle)
    const [featuredAdultAllowed, setFeaturedAdultAllowedState] = useState<boolean>(() => isFeaturedAdultAllowed());

    const { colorTheme, glassStyle, setColorTheme, setGlassStyle, colorThemes } = useTheme();

    // Data export/import state
    const [dataStats, setDataStats] = useState<{ mediaCount: number; collectionCount: number; awardCount: number } | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showExportFormatModal, setShowExportFormatModal] = useState(false);

    // Unused-image cleanup state
    const [isScanning, setIsScanning] = useState(false);
    const [isClearingThumbnailCache, setIsClearingThumbnailCache] = useState(false);
    const [cleanupScan, setCleanupScan] = useState<ScanResult | null>(null);
    const [showCleanupModal, setShowCleanupModal] = useState(false);

    // Local MCP / AI Access state
    const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null);
    const [mcpAccessLog, setMcpAccessLog] = useState<McpAuditEvent[]>([]);
    const [mcpLoadError, setMcpLoadError] = useState<string | null>(null);
    const [mcpBusyAction, setMcpBusyAction] = useState<string | null>(null);
    const [connectionLabel, setConnectionLabel] = useState('');
    const [connectionError, setConnectionError] = useState('');
    const [newCredential, setNewCredential] = useState<McpCredentialSecret | null>(null);
    const [showEndpointConfirm, setShowEndpointConfirm] = useState(false);

    useEffect(() => {
        const loadPaths = async () => {
            const dataDir = await getDataDirectory();
            const appDir = await appLocalDataDir();
            setCurrentPath(dataDir);
            setDefaultPath(appDir);
            setIsCustom(hasCustomDataDirectory());
        };
        loadPaths();

        setDisplayNameState(getDisplayName());
        setIsCustomName(hasCustomDisplayName());
        setNavigationYearsState(getNavigationYears());
        setRatingDisplayModeState(getRatingDisplayMode());
        setAdultMediaEnabledState(isAdultMediaEnabled());
        setFeaturedAdultAllowedState(isFeaturedAdultAllowed());

        // Load data stats
        getDataStats().then(setDataStats).catch(console.error);

        const handleEnvironmentChange = () => setEnvironmentInfo(getEnvironmentInfo());
        handleEnvironmentChange();
        window.addEventListener('resize', handleEnvironmentChange);

        return () => window.removeEventListener('resize', handleEnvironmentChange);
    }, []);

    useEffect(() => {
        let cancelled = false;

        const refresh = async () => {
            try {
                const [status, accessLog] = await Promise.all([
                    getMcpStatus(),
                    getMcpAccessLog(),
                ]);
                if (!cancelled) {
                    setMcpStatus(status);
                    setMcpAccessLog(accessLog);
                    setMcpLoadError(null);
                }
            } catch (error) {
                if (!cancelled) {
                    setMcpLoadError(String(error));
                }
            }
        };

        void refresh();
        if (activeSection !== 'ai-access') {
            return () => {
                cancelled = true;
            };
        }

        const refreshTimer = window.setInterval(() => void refresh(), 5000);
        return () => {
            cancelled = true;
            window.clearInterval(refreshTimer);
        };
    }, [activeSection]);

    const toastTimeoutRef = useRef<number | null>(null);

    const showToast = (message: string) => {
        setSuccessMessage(message);
        setShowSuccess(true);
        if (toastTimeoutRef.current !== null) {
            window.clearTimeout(toastTimeoutRef.current);
        }
        toastTimeoutRef.current = window.setTimeout(() => setShowSuccess(false), 3000);
    };

    useEffect(() => {
        return () => {
            if (toastTimeoutRef.current !== null) {
                window.clearTimeout(toastTimeoutRef.current);
            }
        };
    }, []);

    const refreshMcpData = async () => {
        const [status, accessLog] = await Promise.all([
            getMcpStatus(),
            getMcpAccessLog(),
        ]);
        setMcpStatus(status);
        setMcpAccessLog(accessLog);
        setMcpLoadError(null);
    };

    const syncMcpForDataDirectory = async (): Promise<boolean> => {
        try {
            const status = await resyncMcpDatabase();
            setMcpStatus(status);
            setMcpLoadError(null);
            return true;
        } catch (error) {
            console.error('AI Access database resync failed:', error);
            setMcpLoadError(String(error));
            return false;
        }
    };

    const handleCleanupScan = async () => {
        if (isScanning) return;
        setIsScanning(true);
        try {
            const result = await scanOrphanedImages();
            if (result.orphans.length === 0) {
                showToast('No unused images found');
            } else {
                setCleanupScan(result);
                setShowCleanupModal(true);
            }
        } catch (error) {
            showToast('Scan failed: ' + String(error));
        } finally {
            setIsScanning(false);
        }
    };

    const handleClearThumbnailCache = async () => {
        if (isClearingThumbnailCache) return;
        setIsClearingThumbnailCache(true);
        try {
            const result = await invoke<ClearThumbnailCacheResult>('clear_thumbnail_cache');
            resetThumbnailImageCache();
            const sizeMb = result.bytesRemoved / (1024 * 1024);
            showToast(result.filesRemoved === 0
                ? 'Thumbnail cache is already empty'
                : `Cleared ${result.filesRemoved} thumbnails (${sizeMb.toFixed(1)} MB)`);
        } catch (error) {
            console.error('Clear thumbnail cache failed:', error);
            showToast('Unable to clear thumbnail cache');
        } finally {
            setIsClearingThumbnailCache(false);
        }
    };

    const handleBrowse = async () => {
        if (mcpBusyAction) return;

        const selected = await open({
            directory: true,
            multiple: false,
            title: 'Select Data Directory'
        });

        if (selected && typeof selected === 'string') {
            setMcpBusyAction('data-directory');
            try {
                const suspendedStatus = await suspendMcpRuntime();
                setMcpStatus(suspendedStatus);
                setDataDirectory(selected);
                setCurrentPath(selected);
                setIsCustom(true);
                const mcpSynced = await syncMcpForDataDirectory();
                showToast(mcpSynced
                    ? 'Data directory updated'
                    : 'Data directory updated; AI Access remains unavailable');
            } catch (error) {
                console.error('Unable to safely change the data directory:', error);
                setMcpLoadError(String(error));
                showToast('Data directory was not changed because AI Access could not be suspended');
            } finally {
                setMcpBusyAction(null);
            }
        }
    };

    const handleReset = async () => {
        if (mcpBusyAction) return;

        setMcpBusyAction('data-directory');
        try {
            const appDir = await appLocalDataDir();
            const suspendedStatus = await suspendMcpRuntime();
            setMcpStatus(suspendedStatus);
            clearDataDirectory();
            setCurrentPath(appDir);
            setIsCustom(false);
            const mcpSynced = await syncMcpForDataDirectory();
            showToast(mcpSynced
                ? 'Reset to default location'
                : 'Default restored; AI Access remains unavailable');
        } catch (error) {
            console.error('Unable to safely reset the data directory:', error);
            setMcpLoadError(String(error));
            showToast('Data directory was not reset because AI Access could not be suspended');
        } finally {
            setMcpBusyAction(null);
        }
    };

    const handleDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDisplayNameState(e.target.value);
    };

    const handleDisplayNameSave = () => {
        setDisplayName(displayName);
        setIsCustomName(hasCustomDisplayName());
        showToast('Display name saved');
    };

    const handleDisplayNameReset = () => {
        clearDisplayName();
        setDisplayNameState('Collector');
        setIsCustomName(false);
        showToast('Display name reset');
    };

    const saveNavigationYears = (years: string[]) => {
        const saved = updateNavigationYears(years);
        setNavigationYearsState(saved);
    };

    const handleAddYear = () => {
        const trimmed = yearInput.trim();
        if (!/^\d{4}$/.test(trimmed)) {
            setYearError('Enter a 4-digit year (e.g. 2027)');
            return;
        }
        if (navigationYears.includes(trimmed)) {
            setYearError('That year is already in your list');
            return;
        }

        saveNavigationYears([...navigationYears, trimmed]);
        setYearInput('');
        setYearError('');
        showToast(`Added ${trimmed} to navigation years`);
    };

    const handleRemoveYear = (year: string) => {
        const next = navigationYears.filter(y => y !== year);
        if (next.length === 0) {
            setYearError('Keep at least one year configured');
            return;
        }

        saveNavigationYears(next);
        setYearError('');
        showToast(`Removed ${year} from navigation years`);
    };

    const handleResetYears = () => {
        const currentYear = getCurrentYearString();
        saveNavigationYears([currentYear]);
        setYearError('');
        showToast('Year list reset to current year');
    };

    const handleColorThemeChange = (theme: ColorTheme) => {
        setColorTheme(theme);
    };

    const handleGlassStyleChange = (style: GlassStyle) => {
        if (style === glassStyle) return;
        setGlassStyle(style);
        showToast(style === 'clear' ? 'Backdrop style set to Clear' : 'Backdrop style set to Default');
    };

    const handleRatingDisplayChange = (mode: 'pill' | 'vertical-pill' | 'thermometer') => {
        if (mode === ratingDisplayMode) return;
        setRatingDisplayMode(mode);
        setRatingDisplayModeState(mode);
        showToast(`Rating display set to ${mode === 'pill' ? 'Pill' : mode === 'vertical-pill' ? 'Vertical Pill' : 'Thermometer'}`);
    };

    const applyAdultMedia = async (enabled: boolean) => {
        if (adultPolicyBusyRef.current) return;
        adultPolicyBusyRef.current = true;
        setIsAdultPolicyBusy(true);

        try {
            if (!enabled) {
                const status = await setMcpGlobalAdultEnabled(false);
                setMcpStatus(status);
                setMcpLoadError(null);

                setAdultMediaEnabled(false);
                setAdultMediaEnabledState(false);
                showToast('Adult media hidden');
                return;
            }

            // Enabling the app-wide preference first is safe because MCP remains
            // fail-closed until its native policy update succeeds.
            setAdultMediaEnabled(true);
            setAdultMediaEnabledState(true);
            try {
                const status = await setMcpGlobalAdultEnabled(true);
                setMcpStatus(status);
                setMcpLoadError(null);
                showToast('Adult media shown');
            } catch (error) {
                console.error('Unable to update AI Access adult policy:', error);
                setMcpLoadError(String(error));
                showToast('Adult media shown; AI Access remains filtered');
            }
        } catch (error) {
            console.error('Unable to update AI Access adult policy:', error);
            setMcpLoadError(String(error));
            showToast('Adult media was not hidden because AI Access could not be secured');
            throw error;
        } finally {
            adultPolicyBusyRef.current = false;
            setIsAdultPolicyBusy(false);
        }
    };

    const handleAdultMediaToggle = async (enabled: boolean) => {
        if (enabled === adultMediaEnabled || adultPolicyBusyRef.current) return;
        // Turning off while adult entries exist: confirm they'll be hidden (not deleted).
        if (!enabled) {
            adultPolicyBusyRef.current = true;
            setIsAdultPolicyBusy(true);
            try {
                const count = await dbService.countAdultEntries();
                if (count > 0) {
                    setAdultCount(count);
                    setShowAdultConfirm(true);
                    return;
                }
            } finally {
                adultPolicyBusyRef.current = false;
                setIsAdultPolicyBusy(false);
            }
        }
        try {
            await applyAdultMedia(enabled);
        } catch {
            // applyAdultMedia reports the fail-closed error to the user.
        }
    };

    const handleFeaturedAdultToggle = (allowed: boolean) => {
        if (allowed === featuredAdultAllowed) return;
        setFeaturedAdultAllowed(allowed);
        setFeaturedAdultAllowedState(allowed);
        showToast(allowed ? 'Adult entries eligible for featured' : 'Adult entries hidden from featured');
    };

    const handleMcpEnabledToggle = async (enabled: boolean) => {
        if (!mcpStatus || mcpStatus.enabled === enabled || mcpBusyAction) return;

        setMcpBusyAction('enabled');
        try {
            const status = await setMcpEnabled(enabled);
            setMcpStatus(status);
            setMcpLoadError(null);
            showToast(enabled ? 'AI Access enabled' : 'AI Access disabled');
        } catch (error) {
            console.error('Unable to update AI Access:', error);
            setMcpLoadError(String(error));
            showToast('Unable to update AI Access');
        } finally {
            setMcpBusyAction(null);
        }
    };

    const handleMcpAdultToggle = async (enabled: boolean) => {
        if (!mcpStatus || !adultMediaEnabled || mcpStatus.adultOptIn === enabled || mcpBusyAction) return;

        setMcpBusyAction('adult');
        try {
            const status = await setMcpAdultOptIn(enabled);
            setMcpStatus(status);
            setMcpLoadError(null);
            showToast(enabled ? 'Adult media allowed for AI Access' : 'Adult media blocked from AI Access');
        } catch (error) {
            console.error('Unable to update AI Access adult opt-in:', error);
            setMcpLoadError(String(error));
            showToast('Unable to update the AI Access adult setting');
        } finally {
            setMcpBusyAction(null);
        }
    };

    const handleCreateMcpCredential = async () => {
        const label = connectionLabel.trim();
        if (!label) {
            setConnectionError('Enter a name so you can identify and revoke this connection later.');
            return;
        }
        if (!mcpStatus?.endpoint || mcpBusyAction) return;

        setMcpBusyAction('create-credential');
        setConnectionError('');
        try {
            const secret = await createMcpCredential(label);
            setNewCredential(secret);
            setConnectionLabel('');
            await refreshMcpData();
        } catch (error) {
            console.error('Unable to create AI Access connection:', error);
            setConnectionError(String(error));
        } finally {
            setMcpBusyAction(null);
        }
    };

    const handleRevokeMcpCredential = async (credentialId: string, label: string) => {
        if (mcpBusyAction) return;

        setMcpBusyAction(`revoke-${credentialId}`);
        try {
            const status = await revokeMcpCredential(credentialId);
            setMcpStatus(status);
            setMcpLoadError(null);
            showToast(`${label} access revoked`);
        } catch (error) {
            console.error('Unable to revoke AI Access connection:', error);
            setMcpLoadError(String(error));
            showToast('Unable to revoke that connection');
        } finally {
            setMcpBusyAction(null);
        }
    };

    const handleClearMcpAccessLog = async () => {
        if (mcpBusyAction) return;

        setMcpBusyAction('clear-log');
        try {
            await clearMcpAccessLog();
            setMcpAccessLog([]);
            showToast('Recent AI access cleared');
        } catch (error) {
            console.error('Unable to clear AI access activity:', error);
            setMcpLoadError(String(error));
            showToast('Unable to clear recent activity');
        } finally {
            setMcpBusyAction(null);
        }
    };

    const handleRefreshMcpData = async () => {
        if (mcpBusyAction) return;

        setMcpBusyAction('refresh');
        try {
            await refreshMcpData();
        } catch (error) {
            console.error('Unable to refresh AI Access:', error);
            setMcpLoadError(String(error));
            showToast('Unable to refresh AI Access');
        } finally {
            setMcpBusyAction(null);
        }
    };

    const handleChooseNewMcpEndpoint = async () => {
        if (mcpBusyAction) return;

        setMcpBusyAction('endpoint');
        try {
            const status = await chooseNewMcpEndpoint();
            setMcpStatus(status);
            setMcpLoadError(null);
            showToast('New local endpoint selected');
        } catch (error) {
            console.error('Unable to choose a new MCP endpoint:', error);
            setMcpLoadError(String(error));
            showToast('Unable to choose a new endpoint');
            throw error;
        } finally {
            setMcpBusyAction(null);
        }
    };

    const handleCopyMcpValue = async (value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value);
            showToast(`${label} copied`);
        } catch (error) {
            console.error(`Unable to copy ${label.toLowerCase()}:`, error);
            showToast(`Unable to copy ${label.toLowerCase()}`);
        }
    };

    const exportJsonBackup = async () => {
        const content = await exportToFile();
        const filePath = await save({
            defaultPath: `media-logger-backup-${new Date().toISOString().split('T')[0]}.json`,
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });

        if (!filePath) {
            return;
        }

        await writeTextFile(filePath, content);
        showToast('JSON backup exported successfully!');
    };

    const exportZipBackup = async () => {
        const content = await exportToFile();
        const filePath = await save({
            defaultPath: `media-logger-backup-${new Date().toISOString().split('T')[0]}.zip`,
            filters: [{ name: 'ZIP', extensions: ['zip'] }]
        });

        if (!filePath) {
            return;
        }

        const dataDir = await getDataDirectory();
        await invoke('create_backup_zip', {
            outputPath: filePath,
            backupJson: content,
            dataDir
        });
        showToast('ZIP backup exported successfully!');
    };

    const handleExportChoice = async (format: BackupFormat) => {
        setIsExporting(true);
        setShowExportFormatModal(false);
        try {
            if (format === 'zip') {
                await exportZipBackup();
            } else {
                await exportJsonBackup();
            }
        } catch (error) {
            console.error('Export error:', error);
            showToast('Export failed: ' + String(error));
        } finally {
            setIsExporting(false);
        }
    };

    const handleExport = () => {
        if (!isExporting) {
            setShowExportFormatModal(true);
        }
    };

    const handleImport = async () => {
        try {
            const filePath = await open({
                multiple: false,
                filters: [{ name: 'Backup Files', extensions: ['json', 'zip'] }]
            });
            if (filePath && typeof filePath === 'string') {
                setIsImporting(true);
                let result: ImportResult;

                if (filePath.toLowerCase().endsWith('.zip')) {
                    const { backupJson } = await invoke<BackupZipReadResult>('read_backup_zip', { filePath });
                    result = await importFromFile(backupJson);

                    if (result.success) {
                        try {
                            const dataDir = await getDataDirectory();
                            const { assetsRestored, cleanupWarnings } = await invoke<ExtractBackupAssetsResult>('extract_backup_assets', {
                                filePath,
                                dataDir
                            });
                            result = {
                                ...result,
                                assetsRestored,
                                errors: [...result.errors, ...cleanupWarnings]
                            };
                        } catch (assetError) {
                            result = {
                                ...result,
                                errors: [...result.errors, `Assets could not be fully restored: ${String(assetError)}`]
                            };
                        }
                    }
                } else {
                    const content = await readTextFile(filePath);
                    result = await importFromFile(content);
                }

                setImportResult(result);
                setShowImportModal(true);

                // Imported entries may introduce new years — refresh the
                // sidebar year list (Layout/Stats listen for this).
                if (result.mediaEntriesImported > 0) {
                    window.dispatchEvent(new CustomEvent('entry-added'));
                }

                // Refresh stats after import
                const newStats = await getDataStats();
                setDataStats(newStats);
            }
        } catch (error) {
            console.error('Import error:', error);
            setImportResult(createFailedImportResult(error));
            setShowImportModal(true);
        } finally {
            setIsImporting(false);
        }
    };

    const buildDebugInfo = () => JSON.stringify({
        application: {
            appName: appMetadata.appName,
            appVersion: appMetadata.appVersion,
            appIdentifier: appMetadata.appIdentifier,
            packageName: appMetadata.packageName,
            packageVersion: appMetadata.packageVersion,
            tauriApiVersion: appMetadata.tauriApiVersion,
            tauriCliVersion: appMetadata.tauriCliVersion,
            reactVersion: appMetadata.reactVersion,
            viteMode: import.meta.env.MODE,
            buildType: import.meta.env.DEV ? 'development' : 'production',
        },
        data: {
            currentDataDirectory: currentPath || 'Loading',
            defaultDataDirectory: defaultPath || 'Loading',
            storageMode: isCustom ? 'custom' : 'default',
            databaseFile: DB_FILENAME,
        },
        library: {
            mediaEntries: dataStats?.mediaCount ?? null,
            collections: dataStats?.collectionCount ?? null,
            awards: dataStats?.awardCount ?? null,
        },
        preferences: {
            displayName,
            colorTheme: colorTheme.name,
            glassStyle,
            navigationYears,
        },
        environment: environmentInfo,
    }, null, 2);

    const handleCopyDebugInfo = async () => {
        try {
            await navigator.clipboard.writeText(buildDebugInfo());
            showToast('Debug info copied to clipboard');
        } catch (error) {
            console.error('Copy debug info error:', error);
            showToast('Unable to copy debug info');
        }
    };

    const latestRelease = changelog.releases[0];
    const mcpRuntimeState = mcpStatus?.runtimeState ?? (mcpLoadError ? 'error' : null);
    const mcpError = mcpStatus?.error ?? mcpLoadError;
    const codexMcpConfig = newCredential ? buildCodexMcpConfig(newCredential) : '';
    const openCodeMcpConfig = newCredential ? buildOpenCodeMcpConfig(newCredential) : '';
    const vsCodeMcpConfig = newCredential ? buildVsCodeMcpConfig(newCredential) : '';

    const navItems: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
        { id: 'general', label: 'General', icon: <User size={18} /> },
        { id: 'appearance', label: 'Appearance', icon: <Palette size={18} /> },
        { id: 'ai-access', label: 'AI Access', icon: <Bot size={18} /> },
        { id: 'data', label: 'Data', icon: <Database size={18} /> },
        { id: 'changelog', label: 'Changelog', icon: <ScrollText size={18} /> },
        { id: 'about', label: 'About', icon: <Info size={18} /> },
    ];

    return (
        <div className="settings-layout">
            {/* Success Toast */}
            {showSuccess && (
                <div className="settings-toast">
                    <CheckCircle2 size={18} className="settings-toast-icon" />
                    <span className="settings-toast-text">{successMessage}</span>
                </div>
            )}

            {/* Horizontal Navigation Bar */}
            <nav className="settings-top-bar" aria-label="Settings sections">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveSection(item.id)}
                        className={`settings-tab ${activeSection === item.id ? 'active' : ''}`}
                        aria-current={activeSection === item.id ? 'page' : undefined}
                    >
                        <span className="settings-tab-icon">{item.icon}</span>
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>

            {/* Content Area */}
            <main className="settings-content">
                {/* General Section */}
                {activeSection === 'general' && (
                    <div className="settings-section-enter" key="general">
                        <section className="settings-card">
                            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                                <div>
                                    <div className="settings-row-label">Display Name</div>
                                    <div className="settings-row-description">
                                        Shown in the dashboard greeting (e.g., "Good Morning, {displayName}")
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        value={displayName}
                                        onChange={handleDisplayNameChange}
                                        placeholder="Collector"
                                        className="settings-input"
                                        style={{ flex: 1 }}
                                    />
                                    {isCustomName && (
                                        <span className="settings-badge">Custom</span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <button
                                        onClick={handleDisplayNameSave}
                                        className="settings-btn settings-btn-primary"
                                    >
                                        <CheckCircle2 size={14} />
                                        Save
                                    </button>
                                    {isCustomName && (
                                        <button
                                            onClick={handleDisplayNameReset}
                                            className="settings-btn settings-btn-secondary"
                                        >
                                            <RotateCcw size={14} />
                                            Reset
                                        </button>
                                    )}
                                </div>
                            </div>
                        </section>

                        <section className="settings-card">
                            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                                <div>
                                    <div className="settings-row-label">Available Years</div>
                                    <div className="settings-row-description">
                                        Used by the sidebar and stats filters. Years found in your entries are added automatically.
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 10 }}>
                                    <input
                                        type="text"
                                        value={yearInput}
                                        onChange={(e) => {
                                            setYearInput(e.target.value);
                                            if (yearError) setYearError('');
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleAddYear();
                                            }
                                        }}
                                        placeholder="e.g. 2027"
                                        className="settings-input"
                                        style={{ width: 160 }}
                                    />
                                    <button
                                        onClick={handleAddYear}
                                        className="settings-btn settings-btn-primary"
                                    >
                                        <Plus size={14} />
                                        Add Year
                                    </button>
                                    <button
                                        onClick={handleResetYears}
                                        className="settings-btn settings-btn-secondary"
                                    >
                                        <RotateCcw size={14} />
                                        Reset
                                    </button>
                                </div>

                                {yearError && (
                                    <div style={{ color: '#EF4444', fontSize: 12 }}>{yearError}</div>
                                )}

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {navigationYears.map((year) => (
                                        <span
                                            key={year}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                borderRadius: 999,
                                                padding: '6px 10px',
                                                background: 'var(--color-surface)',
                                                border: '1px solid var(--color-border)',
                                                fontSize: 12,
                                                color: 'var(--color-text)'
                                            }}
                                        >
                                            {year}
                                            <button
                                                onClick={() => handleRemoveYear(year)}
                                                style={{
                                                    border: 'none',
                                                    background: 'transparent',
                                                    color: 'var(--color-text-muted)',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    padding: 0
                                                }}
                                                aria-label={`Remove ${year}`}
                                            >
                                                <X size={12} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <section className="settings-card">
                            <div className="settings-row">
                                <div>
                                    <div className="settings-row-label">Adult Media</div>
                                    <div className="settings-row-description">
                                        Show JAV, Hentai, and Adult Visual Novel types and entries throughout the app. When off, existing adult entries are hidden everywhere — never deleted — and reappear when turned back on.
                                    </div>
                                </div>
                                <div className={`segmented-control ${isAdultPolicyBusy ? 'segmented-control-disabled' : ''}`}>
                                    <button
                                        onClick={() => handleAdultMediaToggle(true)}
                                        disabled={isAdultPolicyBusy}
                                        className={`segmented-control-item ${adultMediaEnabled ? 'active' : ''}`}
                                    >
                                        On
                                    </button>
                                    <button
                                        onClick={() => handleAdultMediaToggle(false)}
                                        disabled={isAdultPolicyBusy}
                                        className={`segmented-control-item ${!adultMediaEnabled ? 'active' : ''}`}
                                    >
                                        Off
                                    </button>
                                </div>
                            </div>
                        </section>

                        <section className="settings-card">
                            <div className="settings-row">
                                <div>
                                    <div className="settings-row-label">Adult Entries in Featured</div>
                                    <div className="settings-row-description">
                                        {adultMediaEnabled
                                            ? "Controls whether adult entries can appear as the Dashboard's featured entry. When off, adult entries are still logged and visible elsewhere — just never featured on the home screen."
                                            : "Enable Adult Media above to manage this. When adult media is hidden, adult entries are already excluded from the featured entry."}
                                    </div>
                                </div>
                                <div className={`segmented-control ${!adultMediaEnabled ? 'segmented-control-disabled' : ''}`}>
                                    <button
                                        onClick={() => adultMediaEnabled && handleFeaturedAdultToggle(true)}
                                        disabled={!adultMediaEnabled}
                                        className={`segmented-control-item ${featuredAdultAllowed && adultMediaEnabled ? 'active' : ''}`}
                                    >
                                        On
                                    </button>
                                    <button
                                        onClick={() => adultMediaEnabled && handleFeaturedAdultToggle(false)}
                                        disabled={!adultMediaEnabled}
                                        className={`segmented-control-item ${!featuredAdultAllowed && adultMediaEnabled ? 'active' : ''}`}
                                    >
                                        Off
                                    </button>
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                {/* Appearance Section */}
                {activeSection === 'appearance' && (
                    <div className="settings-section-enter" key="appearance">
                        <section className="settings-card">
                            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 16 }}>
                                <div>
                                    <div className="settings-row-label">Color Theme</div>
                                    <div className="settings-row-description">Choose your preferred accent color</div>
                                </div>
                                <div className="color-swatches">
                                    {colorThemes.map((theme) => (
                                        <button
                                            key={theme.id}
                                            onClick={() => handleColorThemeChange(theme)}
                                            className={`color-swatch ${colorTheme.id === theme.id ? 'selected' : ''}`}
                                            style={{ background: theme.previewGradient }}
                                            title={theme.name}
                                            aria-label={`Select ${theme.name} theme`}
                                        />
                                    ))}
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                                    Selected: <strong style={{ color: 'var(--color-text)' }}>{colorTheme.name}</strong>
                                </div>
                            </div>
                        </section>

                        <section className="settings-card">
                            <div className="settings-row">
                                <div>
                                    <div className="settings-row-label">Native Backdrop</div>
                                    <div className="settings-row-description">
                                        Default keeps the main content solid. Clear lets more of the native desktop backdrop show through, using Liquid Glass or vibrancy on macOS and Mica on Windows.
                                    </div>
                                </div>
                                <div className="segmented-control">
                                    <button
                                        onClick={() => handleGlassStyleChange('default')}
                                        className={`segmented-control-item ${glassStyle === 'default' ? 'active' : ''}`}
                                    >
                                        Default
                                    </button>
                                    <button
                                        onClick={() => handleGlassStyleChange('clear')}
                                        className={`segmented-control-item ${glassStyle === 'clear' ? 'active' : ''}`}
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>
                        </section>

                        <section className="settings-card">
                            <div className="settings-row">
                                <div>
                                    <div className="settings-row-label">Card Rating Style</div>
                                    <div className="settings-row-description">How ratings appear on entry cards</div>
                                </div>
                                <div className="segmented-control">
                                    <button
                                        onClick={() => handleRatingDisplayChange('pill')}
                                        className={`segmented-control-item ${ratingDisplayMode === 'pill' ? 'active' : ''}`}
                                    >
                                        Pill
                                    </button>
                                    <button
                                        onClick={() => handleRatingDisplayChange('vertical-pill')}
                                        className={`segmented-control-item ${ratingDisplayMode === 'vertical-pill' ? 'active' : ''}`}
                                    >
                                        Vertical Pill
                                    </button>
                                    <button
                                        onClick={() => handleRatingDisplayChange('thermometer')}
                                        className={`segmented-control-item ${ratingDisplayMode === 'thermometer' ? 'active' : ''}`}
                                    >
                                        Thermometer
                                    </button>
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                {/* AI Access Section */}
                {activeSection === 'ai-access' && (
                    <div className="settings-section-enter ai-access-grid" key="ai-access">
                        <section className="settings-card ai-access-wide ai-access-hero-card">
                            <div className="ai-access-hero">
                                <div className="ai-access-hero-heading">
                                    <div className="ai-access-hero-icon">
                                        <Server size={24} />
                                    </div>
                                    <div>
                                        <div className="ai-access-title-row">
                                            <span className="settings-row-label">Local MCP Server</span>
                                            <span className={`mcp-status-badge mcp-status-${mcpRuntimeState ?? 'loading'}`}>
                                                <span className="mcp-status-dot" />
                                                {getMcpStateLabel(mcpRuntimeState)}
                                            </span>
                                        </div>
                                        <div className="settings-row-description ai-access-description">
                                            Let approved AI assistants read recommendation-safe library and backlog data while Media Logger is open.
                                        </div>
                                    </div>
                                </div>

                                <div className={`segmented-control ${!mcpStatus || mcpBusyAction === 'enabled' ? 'segmented-control-disabled' : ''}`}>
                                    <button
                                        type="button"
                                        onClick={() => void handleMcpEnabledToggle(true)}
                                        disabled={!mcpStatus || mcpBusyAction === 'enabled'}
                                        className={`segmented-control-item ${mcpStatus?.enabled ? 'active' : ''}`}
                                    >
                                        {mcpBusyAction === 'enabled' && !mcpStatus?.enabled && <Loader2 size={13} className="spin" />}
                                        On
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleMcpEnabledToggle(false)}
                                        disabled={!mcpStatus || mcpBusyAction === 'enabled'}
                                        className={`segmented-control-item ${mcpStatus && !mcpStatus.enabled ? 'active' : ''}`}
                                    >
                                        {mcpBusyAction === 'enabled' && mcpStatus?.enabled && <Loader2 size={13} className="spin" />}
                                        Off
                                    </button>
                                </div>
                            </div>

                            <div className="ai-access-endpoint-row">
                                <div>
                                    <div className="settings-row-label">Endpoint</div>
                                    <div className="settings-row-description">
                                        Bound to this computer only. It is unreachable when the app or AI Access is off.
                                    </div>
                                </div>
                                <code className="ai-access-endpoint">
                                    {mcpStatus?.endpoint ?? 'Created the first time AI Access is enabled'}
                                </code>
                            </div>

                            {mcpError && (
                                <div className="ai-access-error" role="alert">
                                    <AlertCircle size={16} />
                                    <span>{mcpError}</span>
                                </div>
                            )}

                            <div className="ai-access-toolbar">
                                <span>
                                    Last activity: <strong>{formatMcpTimestamp(mcpStatus?.lastActivity)}</strong>
                                </span>
                                <button
                                    type="button"
                                    className="settings-btn settings-btn-secondary"
                                    onClick={() => void handleRefreshMcpData()}
                                    disabled={Boolean(mcpBusyAction)}
                                >
                                    {mcpBusyAction === 'refresh'
                                        ? <Loader2 size={14} className="spin" />
                                        : <RefreshCw size={14} />}
                                    Refresh
                                </button>
                            </div>
                        </section>

                        <section className="settings-card">
                            <div className="settings-card-header">Privacy Boundary</div>
                            <div className="ai-access-privacy">
                                <div className="ai-access-privacy-icon">
                                    <ShieldCheck size={22} />
                                </div>
                                <div>
                                    <div className="settings-row-label">Read-only and deliberately limited</div>
                                    <ul className="ai-access-privacy-list">
                                        <li>Only library and backlog recommendation fields are available.</li>
                                        <li>Personal notes, image paths, ownership, and subtitle flags are never queried.</li>
                                        <li>No assistant can add, edit, delete, or run arbitrary SQL.</li>
                                    </ul>
                                </div>
                            </div>
                            <div className="ai-access-provider-warning">
                                <AlertCircle size={16} />
                                <span>
                                    The server is local, but anything an assistant reads may be handled under that AI provider&apos;s privacy policy. Only create connections for assistants you trust.
                                </span>
                            </div>
                        </section>

                        <section className="settings-card">
                            <div className="settings-card-header">Sensitive Content</div>
                            <div className="settings-row ai-access-adult-row">
                                <div>
                                    <div className="settings-row-label">Adult Media for AI Access</div>
                                    <div className="settings-row-description">
                                        {adultMediaEnabled
                                            ? 'Requires this separate opt-in. Turning it off never changes or deletes your library.'
                                            : 'The app-wide Adult Media setting is off, so adult entries are always excluded from AI Access.'}
                                    </div>
                                </div>
                                <div className={`segmented-control ${!adultMediaEnabled || !mcpStatus || Boolean(mcpBusyAction) ? 'segmented-control-disabled' : ''}`}>
                                    <button
                                        type="button"
                                        onClick={() => void handleMcpAdultToggle(true)}
                                        disabled={!adultMediaEnabled || !mcpStatus || Boolean(mcpBusyAction)}
                                        className={`segmented-control-item ${adultMediaEnabled && mcpStatus?.adultOptIn ? 'active' : ''}`}
                                    >
                                        On
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleMcpAdultToggle(false)}
                                        disabled={!adultMediaEnabled || !mcpStatus || Boolean(mcpBusyAction)}
                                        className={`segmented-control-item ${!adultMediaEnabled || (mcpStatus && !mcpStatus.adultOptIn) ? 'active' : ''}`}
                                    >
                                        Off
                                    </button>
                                </div>
                            </div>
                            <div className="ai-access-policy-state">
                                <span className={`mcp-policy-indicator ${mcpStatus?.adultMediaIncluded ? 'included' : ''}`} />
                                Adult entries are currently <strong>{mcpStatus?.adultMediaIncluded ? 'included' : 'excluded'}</strong> from every MCP tool.
                            </div>
                        </section>

                        <section className="settings-card ai-access-wide">
                            <div className="settings-card-header">Approved Connections</div>
                            <div className="ai-access-connection-create">
                                <div>
                                    <div className="settings-row-label">Create a connection</div>
                                    <div className="settings-row-description">
                                        Give each AI client its own credential so access can be revoked independently.
                                    </div>
                                </div>
                                <div className="ai-access-create-controls">
                                    <input
                                        type="text"
                                        className="settings-input"
                                        value={connectionLabel}
                                        onChange={(event) => {
                                            setConnectionLabel(event.target.value);
                                            if (connectionError) setConnectionError('');
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                event.preventDefault();
                                                void handleCreateMcpCredential();
                                            }
                                        }}
                                        placeholder="e.g. Codex on this Mac"
                                        maxLength={80}
                                        disabled={!mcpStatus?.endpoint || Boolean(mcpBusyAction)}
                                    />
                                    <button
                                        type="button"
                                        className="settings-btn settings-btn-primary"
                                        onClick={() => void handleCreateMcpCredential()}
                                        disabled={!mcpStatus?.endpoint || Boolean(mcpBusyAction)}
                                    >
                                        {mcpBusyAction === 'create-credential'
                                            ? <Loader2 size={14} className="spin" />
                                            : <KeyRound size={14} />}
                                        Create Connection
                                    </button>
                                </div>
                                {!mcpStatus?.endpoint && (
                                    <div className="settings-row-description">Enable AI Access once before creating a connection.</div>
                                )}
                                {connectionError && <div className="ai-access-inline-error">{connectionError}</div>}
                            </div>

                            <div className="ai-access-connections-list">
                                {mcpStatus?.credentials.length ? (
                                    mcpStatus.credentials.map((credential) => (
                                        <div className="ai-access-connection" key={credential.id}>
                                            <div className="ai-access-connection-icon">
                                                <KeyRound size={16} />
                                            </div>
                                            <div className="ai-access-connection-details">
                                                <strong>{credential.label}</strong>
                                                <span>
                                                    Created {formatMcpTimestamp(credential.createdAt)} · Last used {formatMcpTimestamp(credential.lastUsedAt)}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                className="settings-btn settings-btn-danger"
                                                onClick={() => void handleRevokeMcpCredential(credential.id, credential.label)}
                                                disabled={Boolean(mcpBusyAction)}
                                            >
                                                {mcpBusyAction === `revoke-${credential.id}`
                                                    ? <Loader2 size={14} className="spin" />
                                                    : <Trash2 size={14} />}
                                                Revoke
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="ai-access-empty-state">
                                        <KeyRound size={22} />
                                        <span>No AI clients have access.</span>
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="settings-card ai-access-wide">
                            <div className="settings-card-header ai-access-log-header">
                                <span>Recent Access</span>
                                <div className="ai-access-log-actions">
                                    <button
                                        type="button"
                                        className="settings-btn settings-btn-secondary"
                                        onClick={() => void handleRefreshMcpData()}
                                        disabled={Boolean(mcpBusyAction)}
                                    >
                                        <RefreshCw size={13} />
                                        Refresh
                                    </button>
                                    <button
                                        type="button"
                                        className="settings-btn settings-btn-secondary"
                                        onClick={() => void handleClearMcpAccessLog()}
                                        disabled={mcpAccessLog.length === 0 || Boolean(mcpBusyAction)}
                                    >
                                        <Trash2 size={13} />
                                        Clear
                                    </button>
                                </div>
                            </div>
                            <div className="ai-access-log-list">
                                {mcpAccessLog.length > 0 ? (
                                    mcpAccessLog.map((event, index) => (
                                        <div className="ai-access-log-entry" key={`${event.timestamp}-${event.connectionLabel}-${event.toolName}-${index}`}>
                                            <div className={`ai-access-log-icon ${event.outcome.toLowerCase() === 'success' ? 'success' : 'error'}`}>
                                                <Activity size={14} />
                                            </div>
                                            <div className="ai-access-log-details">
                                                <div>
                                                    <strong>{event.connectionLabel}</strong>
                                                    <span className="ai-access-tool-name">{event.toolName}</span>
                                                </div>
                                                <span>
                                                    {formatMcpTimestamp(event.timestamp)} · {event.outcome}
                                                    {event.returnedCount !== null ? ` · ${event.returnedCount} returned` : ''}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="ai-access-empty-state">
                                        <Activity size={22} />
                                        <span>No authenticated tool activity this session.</span>
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="settings-card ai-access-wide">
                            <div className="settings-row ai-access-repair-row">
                                <div>
                                    <div className="settings-row-label">Endpoint Repair</div>
                                    <div className="settings-row-description">
                                        Choose a new local port only if another app is using the saved endpoint. Existing client configurations must then be updated.
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="settings-btn settings-btn-secondary"
                                    onClick={() => setShowEndpointConfirm(true)}
                                    disabled={!mcpStatus || Boolean(mcpBusyAction)}
                                >
                                    <RefreshCw size={14} />
                                    Choose New Endpoint
                                </button>
                            </div>
                        </section>
                    </div>
                )}

                {/* Data Section */}
                {activeSection === 'data' && (
                    <div className="settings-section-enter" key="data">
                        <section className="settings-card">
                            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div className="settings-row-label">Data Directory</div>
                                        <div className="settings-row-description">
                                            Where your database and images are stored
                                        </div>
                                    </div>
                                    {isCustom && (
                                        <span className="settings-badge">Custom</span>
                                    )}
                                </div>
                                <div className="path-display">
                                    {currentPath || 'Loading...'}
                                </div>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <button
                                        onClick={handleBrowse}
                                        className="settings-btn settings-btn-primary"
                                        disabled={mcpBusyAction === 'data-directory'}
                                    >
                                        <FolderOpen size={14} />
                                        Browse...
                                    </button>
                                    {currentPath && (
                                        <button
                                            onClick={() => revealItemInDir(currentPath)}
                                            className="settings-btn settings-btn-secondary"
                                            disabled={mcpBusyAction === 'data-directory'}
                                        >
                                            <ExternalLink size={14} />
                                            Open Directory
                                        </button>
                                    )}
                                    {isCustom && (
                                        <button
                                            onClick={handleReset}
                                            className="settings-btn settings-btn-secondary"
                                            disabled={mcpBusyAction === 'data-directory'}
                                        >
                                            <RotateCcw size={14} />
                                            Reset
                                        </button>
                                    )}
                                </div>
                            </div>

                            {defaultPath && (
                                <div className="settings-row">
                                    <div>
                                        <div className="settings-row-label" style={{ fontSize: 13 }}>Default Location</div>
                                    </div>
                                    <div className="settings-row-value" style={{ fontSize: 12, fontFamily: "'SF Mono', 'Menlo', monospace" }}>
                                        {defaultPath}
                                    </div>
                                </div>
                            )}
                        </section>

                        <section className="settings-card">
                            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                                <div>
                                    <div className="settings-row-label">Expected Directory Layout</div>
                                    <div className="settings-row-description">
                                        Your data directory should contain these files
                                    </div>
                                </div>
                                <div className="directory-tree">
                                    <div className="tree-item">
                                        <FolderOpen size={14} style={{ color: '#F59E0B' }} />
                                        <span className="tree-item-name">Your Data Directory</span>
                                    </div>
                                    <div className="tree-item tree-indent-1">
                                        <Database size={14} style={{ color: 'var(--color-primary)' }} />
                                        <span>{DB_FILENAME}</span>
                                        <span className="tree-item-desc">— SQLite database</span>
                                    </div>
                                    <div className="tree-item tree-indent-1">
                                        <FolderOpen size={14} style={{ color: '#F59E0B' }} />
                                        <span>assets/</span>
                                    </div>
                                    <div className="tree-item tree-indent-2">
                                        <FolderOpen size={14} style={{ color: '#F59E0B', opacity: 0.7 }} />
                                        <span>images/</span>
                                    </div>
                                    <div className="tree-item tree-indent-3">
                                        <Image size={14} style={{ color: 'var(--color-secondary)', opacity: 0.7 }} />
                                        <span style={{ opacity: 0.7 }}>{'*.png / *.jpg / *.webp'}</span>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="settings-card">
                            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(3, 1fr)',
                                    gap: 12
                                }}>
                                    <div style={{
                                        padding: '16px',
                                        borderRadius: 10,
                                        background: 'var(--color-surface)',
                                        border: '1px solid var(--color-border)',
                                        textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-primary)' }}>
                                            {dataStats?.mediaCount ?? '...'}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                                            Media Entries
                                        </div>
                                    </div>
                                    <div style={{
                                        padding: '16px',
                                        borderRadius: 10,
                                        background: 'var(--color-surface)',
                                        border: '1px solid var(--color-border)',
                                        textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-secondary)' }}>
                                            {dataStats?.collectionCount ?? '...'}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                                            Collections
                                        </div>
                                    </div>
                                    <div style={{
                                        padding: '16px',
                                        borderRadius: 10,
                                        background: 'var(--color-surface)',
                                        border: '1px solid var(--color-border)',
                                        textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: 28, fontWeight: 600, color: '#F59E0B' }}>
                                            {dataStats?.awardCount ?? '...'}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                                            Awards
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="settings-card">
                            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                                <div>
                                    <div className="settings-row-label">Export All Data</div>
                                    <div className="settings-row-description">
                                        Save all your entries, collections, awards, backlog, and profile data (images, AVG rating history) as either a JSON backup or a ZIP backup with bundled local assets
                                    </div>
                                </div>
                                <button
                                    onClick={handleExport}
                                    disabled={isExporting}
                                    className="settings-btn settings-btn-primary"
                                    style={{ alignSelf: 'flex-start' }}
                                >
                                    {isExporting ? (
                                        <><Loader2 size={14} className="spin" /> Exporting...</>
                                    ) : (
                                        <><Download size={14} /> Export to File</>
                                    )}
                                </button>
                            </div>
                        </section>

                        <section className="settings-card">
                            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                                <div>
                                    <div className="settings-row-label">Import Data</div>
                                    <div className="settings-row-description">
                                        Restore data from a JSON or ZIP backup file. Existing entries are skipped only when all exported fields match.
                                    </div>
                                </div>
                                <button
                                    onClick={handleImport}
                                    disabled={isImporting}
                                    className="settings-btn settings-btn-secondary"
                                    style={{ alignSelf: 'flex-start' }}
                                >
                                    {isImporting ? (
                                        <><Loader2 size={14} className="spin" /> Importing...</>
                                    ) : (
                                        <><Upload size={14} /> Import from File</>
                                    )}
                                </button>
                            </div>
                        </section>

                        <section className="settings-card">
                            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                                <div>
                                    <div className="settings-row-label">Cover Thumbnail Cache</div>
                                    <div className="settings-row-description">
                                        Media Logger creates optimized local thumbnails as covers enter view. Clearing them is safe; originals are untouched and thumbnails regenerate automatically.
                                    </div>
                                </div>
                                <button
                                    onClick={handleClearThumbnailCache}
                                    disabled={isClearingThumbnailCache}
                                    className="settings-btn settings-btn-secondary"
                                    style={{ alignSelf: 'flex-start' }}
                                >
                                    {isClearingThumbnailCache ? (
                                        <><Loader2 size={14} className="spin" /> Clearing...</>
                                    ) : (
                                        <><Trash2 size={14} /> Clear Thumbnail Cache</>
                                    )}
                                </button>
                            </div>
                        </section>

                        <section className="settings-card">
                            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                                <div>
                                    <div className="settings-row-label">Clean Up Unused Images</div>
                                    <div className="settings-row-description">
                                        Find images in your assets folder that are no longer used by any entry, backlog item, or profile. Deleted files are moved to the system Trash and can be restored.
                                    </div>
                                </div>
                                <button
                                    onClick={handleCleanupScan}
                                    disabled={isScanning}
                                    className="settings-btn settings-btn-secondary"
                                    style={{ alignSelf: 'flex-start' }}
                                >
                                    {isScanning ? (
                                        <><Loader2 size={14} className="spin" /> Scanning...</>
                                    ) : (
                                        <><ImageOff size={14} /> Scan for Unused Images</>
                                    )}
                                </button>
                            </div>
                        </section>

                        <div style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            padding: '12px 16px',
                            borderRadius: 8,
                            background: 'rgba(59, 130, 246, 0.1)',
                            border: '1px solid rgba(59, 130, 246, 0.2)',
                            fontSize: 13,
                            color: 'var(--color-text-muted)'
                        }}>
                            <AlertCircle size={16} style={{ color: '#3B82F6', flexShrink: 0, marginTop: 2 }} />
                            <span>JSON backups include all database data in JSON format with embedded CSVs but do not bundle local assets. ZIP backups include the same backup JSON plus the current <strong style={{ color: 'var(--color-text)' }}>assets/</strong> folder from your data directory.</span>
                        </div>
                    </div>
                )}

                {/* Changelog Section */}
                {activeSection === 'changelog' && (
                    <div className="settings-section-enter" key="changelog">
                        <section className="settings-card changelog-summary">
                            <div className="settings-row changelog-summary-row">
                                <div className="changelog-summary-header">
                                    <div className="changelog-summary-icon">
                                        <ScrollText size={24} />
                                    </div>
                                    <div>
                                        <div className="settings-row-label">Published GitHub Releases</div>
                                        <div className="settings-row-description">
                                            Release notes are synced during development and bundled into the app for offline viewing.
                                        </div>
                                    </div>
                                </div>

                                <div className="changelog-summary-grid">
                                    <div className="changelog-summary-card">
                                        <span className="changelog-summary-value">{appMetadata.appVersion}</span>
                                        <span className="changelog-summary-label">Current Version</span>
                                    </div>
                                    <div className="changelog-summary-card">
                                        <span className="changelog-summary-value">{changelog.releases.length}</span>
                                        <span className="changelog-summary-label">Releases</span>
                                    </div>
                                    <div className="changelog-summary-card">
                                        <span className="changelog-summary-value">{latestRelease?.version ?? 'None'}</span>
                                        <span className="changelog-summary-label">Latest Synced</span>
                                    </div>
                                    <div className="changelog-summary-card">
                                        <span className="changelog-summary-value changelog-summary-date">{formatGeneratedAt(changelog.generatedAt)}</span>
                                        <span className="changelog-summary-label">Last Updated</span>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {changelog.releases.length > 0 ? (
                            changelog.releases.map((release) => {
                                const isExpanded = expandedReleaseVersion === release.version;

                                return (
                                    <section className="settings-card changelog-release" key={release.version}>
                                        <button
                                            type="button"
                                            className="changelog-release-header"
                                            onClick={() => setExpandedReleaseVersion(isExpanded ? null : release.version)}
                                            aria-expanded={isExpanded}
                                        >
                                            <div className="changelog-release-heading">
                                                <div className="changelog-release-meta">
                                                    <span className="changelog-version-badge">{release.version}</span>
                                                    {release.prerelease && (
                                                        <span className="changelog-prerelease-badge">Prerelease</span>
                                                    )}
                                                </div>
                                                <div className="changelog-release-title">{release.title}</div>
                                                <div className="settings-row-description">{formatReleaseDate(release.date)}</div>
                                            </div>
                                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                        </button>

                                        {isExpanded && (
                                            <div className="changelog-release-body">
                                                {release.body ? (
                                                    <div className="changelog-markdown">
                                                        <ReactMarkdown remarkPlugins={markdownPlugins}>
                                                            {release.body}
                                                        </ReactMarkdown>
                                                    </div>
                                                ) : (
                                                    <p className="changelog-empty-note">No release notes were provided for this release.</p>
                                                )}
                                            </div>
                                        )}
                                    </section>
                                );
                            })
                        ) : (
                            <section className="settings-card">
                                <div className="settings-row changelog-empty-state">
                                    <ScrollText size={28} />
                                    <div>
                                        <div className="settings-row-label">No changelog synced yet</div>
                                        <div className="settings-row-description">
                                            Run <code>npm run changelog:sync</code> before building the app to bundle published release notes.
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>
                )}

                {/* About Section */}
                {activeSection === 'about' && (
                    <div className="settings-section-enter" key="about">
                        <section className="settings-card">
                            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 16 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                    <div style={{
                                        width: 52,
                                        height: 52,
                                        borderRadius: 14,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                                        color: 'white',
                                        flexShrink: 0
                                    }}>
                                        <Info size={26} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)' }}>
                                            {appMetadata.appName}
                                        </div>
                                        <div className="settings-row-description" style={{ fontSize: 13, marginTop: 4 }}>
                                            A local-first desktop media journal for tracking completed media, collections, awards, profiles, and stats.
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={handleCopyDebugInfo}
                                    className="settings-btn settings-btn-primary"
                                    style={{ alignSelf: 'flex-start' }}
                                >
                                    <Copy size={14} />
                                    Copy Debug Info
                                </button>
                            </div>
                        </section>

                        <section className="settings-card">
                            <div className="settings-card-header">Application</div>
                            <AboutInfoRow label="App Name" value={appMetadata.appName} />
                            <AboutInfoRow label="App Version" value={appMetadata.appVersion} />
                            <AboutInfoRow label="App Identifier" value={appMetadata.appIdentifier} mono />
                            <AboutInfoRow label="Package Name" value={appMetadata.packageName} mono />
                            <AboutInfoRow label="Package Version" value={appMetadata.packageVersion} />
                            <AboutInfoRow label="Build Mode" value={import.meta.env.MODE} />
                            <AboutInfoRow label="Build Type" value={import.meta.env.DEV ? 'Development' : 'Production'} />
                        </section>

                        <section className="settings-card">
                            <div className="settings-card-header">Runtime</div>
                            <AboutInfoRow label="Tauri API Package" value={appMetadata.tauriApiVersion} mono />
                            <AboutInfoRow label="Tauri CLI Package" value={appMetadata.tauriCliVersion} mono />
                            <AboutInfoRow label="React Package" value={appMetadata.reactVersion} mono />
                        </section>

                        <section className="settings-card">
                            <div className="settings-card-header">Data & Library</div>
                            <AboutInfoRow label="Current Data Directory" value={currentPath || 'Loading...'} mono />
                            <AboutInfoRow label="Default Data Directory" value={defaultPath || 'Loading...'} mono />
                            <AboutInfoRow label="Storage Mode" value={isCustom ? 'Custom data directory' : 'Default app local data directory'} />
                            <AboutInfoRow label="Database File" value={DB_FILENAME} mono />
                            <AboutInfoRow label="Media Entries" value={dataStats?.mediaCount ?? 'Loading...'} />
                            <AboutInfoRow label="Collections" value={dataStats?.collectionCount ?? 'Loading...'} />
                            <AboutInfoRow label="Awards" value={dataStats?.awardCount ?? 'Loading...'} />
                        </section>

                        <section className="settings-card">
                            <div className="settings-card-header">Preferences</div>
                            <AboutInfoRow label="Display Name" value={displayName || 'Collector'} />
                            <AboutInfoRow label="Accent Theme" value={colorTheme.name} />
                            <AboutInfoRow label="Glass Style" value={glassStyle} />
                            <AboutInfoRow label="Navigation Years" value={navigationYears.join(', ')} />
                        </section>

                        <section className="settings-card">
                            <div className="settings-card-header">Environment</div>
                            <AboutInfoRow label="Platform" value={environmentInfo.platform} />
                            <AboutInfoRow label="Language" value={environmentInfo.language} />
                            <AboutInfoRow label="Timezone" value={environmentInfo.timezone} />
                            <AboutInfoRow label="Viewport" value={environmentInfo.viewport} />
                            <AboutInfoRow label="Screen" value={environmentInfo.screen} />
                            <AboutInfoRow label="Device Pixel Ratio" value={environmentInfo.devicePixelRatio} />
                            <AboutInfoRow label="CPU Threads" value={environmentInfo.hardwareConcurrency} />
                            <AboutInfoRow label="WebView User Agent" value={environmentInfo.userAgent} mono />
                        </section>

                        <div style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            padding: '12px 16px',
                            borderRadius: 8,
                            background: 'rgba(59, 130, 246, 0.1)',
                            border: '1px solid rgba(59, 130, 246, 0.2)',
                            fontSize: 13,
                            color: 'var(--color-text-muted)'
                        }}>
                            <AlertCircle size={16} style={{ color: '#3B82F6', flexShrink: 0, marginTop: 2 }} />
                            <span>Copied debug info includes filesystem paths to help diagnose storage issues. It does not include media titles, notes, descriptions, or other entry-level content.</span>
                        </div>
                    </div>
                )}

                {/* Export Format Modal */}
                {showExportFormatModal && (
                    <div className="modal-overlay" onClick={() => setShowExportFormatModal(false)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                            <h2 style={{ marginBottom: 12 }}>Choose Export Format</h2>
                            <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                                JSON is smaller and faster to save. ZIP includes the same backup JSON plus your local assets folder so covers and profile art survive a restore on a fresh machine.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
                                <button
                                    onClick={() => handleExportChoice('json')}
                                    className="settings-btn settings-btn-secondary"
                                    style={{ width: '100%', justifyContent: 'space-between' }}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Download size={14} />
                                        JSON only
                                    </span>
                                    <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>Data only</span>
                                </button>

                                <button
                                    onClick={() => handleExportChoice('zip')}
                                    className="settings-btn settings-btn-primary"
                                    style={{ width: '100%', justifyContent: 'space-between' }}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Download size={14} />
                                        ZIP with assets
                                    </span>
                                    <span style={{ color: 'inherit', fontSize: 12 }}>Data + local art</span>
                                </button>
                            </div>

                            <button
                                onClick={() => setShowExportFormatModal(false)}
                                className="settings-btn settings-btn-secondary"
                                style={{ marginTop: 20, width: '100%' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Import Result Modal */}
                {showImportModal && importResult && (
                    <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
                            <h2 style={{ marginBottom: 16 }}>
                                {importResult.success
                                    ? importResult.errors.length > 0
                                        ? 'Import Complete With Warnings'
                                        : 'Import Complete'
                                    : 'Import Failed'}
                            </h2>
                            {importResult.success ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Media entries imported:</span>
                                            <strong style={{ color: 'var(--color-primary)' }}>{importResult.mediaEntriesImported}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Media entries already present (exact matches):</span>
                                            <strong>{importResult.mediaEntriesSkipped}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Collections imported:</span>
                                            <strong style={{ color: 'var(--color-secondary)' }}>{importResult.collectionsImported}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Collections skipped:</span>
                                            <strong>{importResult.collectionsSkipped}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Award templates imported:</span>
                                            <strong>{importResult.awardTemplatesImported}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Award categories imported:</span>
                                            <strong>{importResult.awardCategoriesImported}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Award winners imported:</span>
                                            <strong>{importResult.awardWinnersImported}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Profile mappings imported:</span>
                                            <strong>{importResult.profilesImported}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Assets restored:</span>
                                            <strong>{importResult.assetsRestored}</strong>
                                        </div>
                                    </div>

                                    {importResult.errors.length > 0 && (
                                        <div
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 8,
                                                padding: '12px 14px',
                                                borderRadius: 8,
                                                background: 'rgba(245, 158, 11, 0.08)',
                                                border: '1px solid rgba(245, 158, 11, 0.2)'
                                            }}
                                        >
                                            <strong style={{ color: '#D97706' }}>Warnings</strong>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--color-text-muted)', fontSize: 13 }}>
                                                {importResult.errors.map((error, index) => (
                                                    <span key={`${error}-${index}`}>{error}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, color: '#EF4444' }}>
                                    {importResult.errors.map((error, index) => (
                                        <span key={`${error}-${index}`}>{error}</span>
                                    ))}
                                </div>
                            )}
                            <button
                                onClick={() => setShowImportModal(false)}
                                className="settings-btn settings-btn-primary"
                                style={{ marginTop: 20, width: '100%' }}
                            >
                                <CheckCircle2 size={14} /> Done
                            </button>
                        </div>
                    </div>
                )}

                {/* One-time MCP credential setup */}
                {newCredential && (
                    <div className="modal-overlay">
                        <div className="modal-content mcp-credential-modal" role="dialog" aria-modal="true" aria-labelledby="mcp-credential-title">
                            <div className="mcp-credential-modal-header">
                                <div className="ai-access-hero-icon">
                                    <KeyRound size={22} />
                                </div>
                                <div>
                                    <h2 id="mcp-credential-title">Connect {newCredential.credential.label}</h2>
                                    <p>This bearer token is shown once. Copy it before closing this window.</p>
                                </div>
                            </div>

                            <div className="ai-access-token-warning">
                                <ShieldCheck size={16} />
                                <span>Media Logger stores only a one-way hash. It cannot recover this token later.</span>
                            </div>

                            <div className="mcp-setup-field">
                                <div className="mcp-setup-field-heading">
                                    <label>Bearer token</label>
                                    <button
                                        type="button"
                                        className="settings-btn settings-btn-secondary"
                                        onClick={() => void handleCopyMcpValue(newCredential.token, 'Token')}
                                    >
                                        <Copy size={13} />
                                        Copy
                                    </button>
                                </div>
                                <code className="mcp-secret-value">{newCredential.token}</code>
                            </div>

                            <div className="mcp-setup-field">
                                <div className="mcp-setup-field-heading">
                                    <div>
                                        <label>Codex config.toml</label>
                                        <span>Use this option for Codex only.</span>
                                    </div>
                                    <button
                                        type="button"
                                        className="settings-btn settings-btn-secondary"
                                        onClick={() => void handleCopyMcpValue(codexMcpConfig, 'Codex configuration')}
                                    >
                                        <Copy size={13} />
                                        Copy
                                    </button>
                                </div>
                                <pre className="mcp-config-code"><code>{codexMcpConfig}</code></pre>
                            </div>

                            <div className="mcp-setup-field">
                                <div className="mcp-setup-field-heading">
                                    <div>
                                        <label>VS Code user mcp.json</label>
                                        <span>Use this instead for VS Code; the password-style input prompts for the token.</span>
                                    </div>
                                    <button
                                        type="button"
                                        className="settings-btn settings-btn-secondary"
                                        onClick={() => void handleCopyMcpValue(vsCodeMcpConfig, 'VS Code configuration')}
                                    >
                                        <Copy size={13} />
                                        Copy
                                    </button>
                                </div>
                                <pre className="mcp-config-code"><code>{vsCodeMcpConfig}</code></pre>
                            </div>

                            <div className="mcp-setup-field">
                                <div className="mcp-setup-field-heading">
                                    <div>
                                        <label>OpenCode global opencode.json</label>
                                        <span>Merge this into ~/.config/opencode/opencode.json without replacing unrelated settings.</span>
                                    </div>
                                    <button
                                        type="button"
                                        className="settings-btn settings-btn-secondary"
                                        onClick={() => void handleCopyMcpValue(openCodeMcpConfig, 'OpenCode configuration')}
                                    >
                                        <Copy size={13} />
                                        Copy
                                    </button>
                                </div>
                                <pre className="mcp-config-code"><code>{openCodeMcpConfig}</code></pre>
                            </div>

                            <div className="ai-access-provider-warning">
                                <AlertCircle size={16} />
                                <span>Use this credential with one client only. Create a separate connection for every additional client so each can be revoked independently.</span>
                            </div>

                            <button
                                type="button"
                                className="settings-btn settings-btn-primary mcp-credential-done"
                                onClick={() => setNewCredential(null)}
                            >
                                <CheckCircle2 size={14} />
                                I&apos;ve Saved the Token
                            </button>
                        </div>
                    </div>
                )}

                <CleanupImagesModal
                    isOpen={showCleanupModal}
                    orphans={cleanupScan?.orphans ?? []}
                    dataDir={cleanupScan?.dataDir ?? ''}
                    onClose={() => setShowCleanupModal(false)}
                    onTrashed={(trashedNames) => {
                        const trashed = new Set(trashedNames);
                        setCleanupScan((previous) =>
                            previous
                                ? { ...previous, orphans: previous.orphans.filter((orphan) => !trashed.has(orphan.name)) }
                                : previous
                        );
                    }}
                    showToast={showToast}
                />

                <ConfirmDialog
                    isOpen={showEndpointConfirm}
                    tone="default"
                    title="Choose a New MCP Endpoint?"
                    subtitle="Existing AI clients will need updated configuration"
                    confirmLabel="Choose New Endpoint"
                    onClose={() => setShowEndpointConfirm(false)}
                    onConfirm={handleChooseNewMcpEndpoint}
                >
                    Media Logger will select and save a new local port. Existing credentials remain valid, but every connected AI client must be updated with the new endpoint.
                </ConfirmDialog>

                <ConfirmDialog
                    isOpen={showAdultConfirm}
                    tone="default"
                    title="Hide Adult Media?"
                    subtitle="Nothing is deleted — this can be undone"
                    confirmLabel="Hide"
                    onClose={() => setShowAdultConfirm(false)}
                    onConfirm={() => applyAdultMedia(false)}
                >
                    {adultCount} existing adult {adultCount === 1 ? 'entry' : 'entries'} will be hidden everywhere
                    (collection, stats, search, backlog, random pick, and review). Nothing is deleted — turn this
                    back on anytime to restore them.
                </ConfirmDialog>
            </main>
        </div>
    );
}
