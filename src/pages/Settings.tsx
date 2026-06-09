import { useState, useEffect } from 'react';
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
    ChevronRight
} from 'lucide-react';
import { exportToFile, importFromFile, getDataStats, type ImportResult } from '../lib/csv-logic';
import { DB_FILENAME, dbService } from '../lib/db';
import { ConfirmDialog } from '../components/ConfirmDialog';
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
    setAdultMediaEnabled
} from '../lib/settings';
import { useTheme } from '../lib/ThemeContext';
import type { ColorTheme, GlassStyle } from '../lib/themes';
import { getCurrentYearString, updateNavigationYears } from '../lib/navigation-years';
import changelogData from '../data/changelog.json';
import packageJson from '../../package.json';
import tauriConfig from '../../src-tauri/tauri.conf.json';

type SettingsSection = 'general' | 'appearance' | 'data' | 'changelog' | 'about';
type BackupFormat = 'json' | 'zip';

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
    const [ratingDisplayMode, setRatingDisplayModeState] = useState<'pill' | 'thermometer'>(() => getRatingDisplayMode());

    // Adult Media visibility toggle + its "hide existing entries" confirmation
    const [adultMediaEnabled, setAdultMediaEnabledState] = useState<boolean>(() => isAdultMediaEnabled());
    const [showAdultConfirm, setShowAdultConfirm] = useState(false);
    const [adultCount, setAdultCount] = useState(0);

    const { colorTheme, glassStyle, setColorTheme, setGlassStyle, colorThemes } = useTheme();

    // Data export/import state
    const [dataStats, setDataStats] = useState<{ mediaCount: number; collectionCount: number; awardCount: number } | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showExportFormatModal, setShowExportFormatModal] = useState(false);

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

        // Load data stats
        getDataStats().then(setDataStats).catch(console.error);

        const handleEnvironmentChange = () => setEnvironmentInfo(getEnvironmentInfo());
        handleEnvironmentChange();
        window.addEventListener('resize', handleEnvironmentChange);

        return () => window.removeEventListener('resize', handleEnvironmentChange);
    }, []);

    const showToast = (message: string) => {
        setSuccessMessage(message);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
    };

    const handleBrowse = async () => {
        const selected = await open({
            directory: true,
            multiple: false,
            title: 'Select Data Directory'
        });

        if (selected && typeof selected === 'string') {
            setDataDirectory(selected);
            setCurrentPath(selected);
            setIsCustom(true);
            showToast('Data directory updated');
        }
    };

    const handleReset = async () => {
        clearDataDirectory();
        const appDir = await appLocalDataDir();
        setCurrentPath(appDir);
        setIsCustom(false);
        showToast('Reset to default location');
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

    const handleRatingDisplayChange = (mode: 'pill' | 'thermometer') => {
        if (mode === ratingDisplayMode) return;
        setRatingDisplayMode(mode);
        setRatingDisplayModeState(mode);
        showToast(`Rating display set to ${mode === 'pill' ? 'Pill' : 'Thermometer'}`);
    };

    const applyAdultMedia = (enabled: boolean) => {
        setAdultMediaEnabled(enabled);
        setAdultMediaEnabledState(enabled);
        showToast(enabled ? 'Adult media shown' : 'Adult media hidden');
    };

    const handleAdultMediaToggle = async (enabled: boolean) => {
        if (enabled === adultMediaEnabled) return;
        // Turning off while adult entries exist: confirm they'll be hidden (not deleted).
        if (!enabled) {
            const count = await dbService.countAdultEntries();
            if (count > 0) {
                setAdultCount(count);
                setShowAdultConfirm(true);
                return;
            }
        }
        applyAdultMedia(enabled);
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
                            const { assetsRestored } = await invoke<ExtractBackupAssetsResult>('extract_backup_assets', {
                                filePath,
                                dataDir,
                                overwrite: true
                            });
                            result = { ...result, assetsRestored };
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

    const navItems: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
        { id: 'general', label: 'General', icon: <User size={18} /> },
        { id: 'appearance', label: 'Appearance', icon: <Palette size={18} /> },
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

            {/* Sidebar Navigation */}
            <nav className="settings-sidebar">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveSection(item.id)}
                        className={`settings-nav-item ${activeSection === item.id ? 'active' : ''}`}
                    >
                        <span className="nav-icon">{item.icon}</span>
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>

            {/* Content Area */}
            <main className="settings-content">
                {/* General Section */}
                {activeSection === 'general' && (
                    <div className="settings-section-enter" key="general">
                        <h1 className="settings-section-title">General</h1>

                        <div className="settings-group">
                            <div className="settings-group-label">Personalization</div>

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
                        </div>

                        <div className="settings-group">
                            <div className="settings-group-label">Year Navigation</div>
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
                        </div>

                        <div className="settings-group">
                            <div className="settings-group-label">Content</div>
                            <div className="settings-row">
                                <div>
                                    <div className="settings-row-label">Adult Media</div>
                                    <div className="settings-row-description">
                                        Show JAV, Hentai, and Adult Visual Novel types and entries throughout the app. When off, existing adult entries are hidden everywhere — never deleted — and reappear when turned back on.
                                    </div>
                                </div>
                                <div className="segmented-control">
                                    <button
                                        onClick={() => handleAdultMediaToggle(true)}
                                        className={`segmented-control-item ${adultMediaEnabled ? 'active' : ''}`}
                                    >
                                        On
                                    </button>
                                    <button
                                        onClick={() => handleAdultMediaToggle(false)}
                                        className={`segmented-control-item ${!adultMediaEnabled ? 'active' : ''}`}
                                    >
                                        Off
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Appearance Section */}
                {activeSection === 'appearance' && (
                    <div className="settings-section-enter" key="appearance">
                        <h1 className="settings-section-title">Appearance</h1>

                        <div className="settings-group">
                            <div className="settings-group-label">Accent Color</div>
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
                        </div>

                        <div className="settings-group">
                            <div className="settings-group-label">Window Background</div>
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
                        </div>

                        <div className="settings-group">
                            <div className="settings-group-label">Rating Display</div>
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
                                        onClick={() => handleRatingDisplayChange('thermometer')}
                                        className={`segmented-control-item ${ratingDisplayMode === 'thermometer' ? 'active' : ''}`}
                                    >
                                        Thermometer
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Data Section */}
                {activeSection === 'data' && (
                    <div className="settings-section-enter" key="data">
                        <h1 className="settings-section-title">Data</h1>

                        <div className="settings-group">
                            <div className="settings-group-label">Storage Location</div>

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
                                    >
                                        <FolderOpen size={14} />
                                        Browse...
                                    </button>
                                    {currentPath && (
                                        <button
                                            onClick={() => revealItemInDir(currentPath)}
                                            className="settings-btn settings-btn-secondary"
                                        >
                                            <ExternalLink size={14} />
                                            Open Directory
                                        </button>
                                    )}
                                    {isCustom && (
                                        <button
                                            onClick={handleReset}
                                            className="settings-btn settings-btn-secondary"
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
                        </div>

                        <div className="settings-group">
                            <div className="settings-group-label">File Structure</div>
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
                        </div>

                        <div className="settings-group">
                            <div className="settings-group-label">Overview</div>
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
                        </div>

                        <div className="settings-group">
                            <div className="settings-group-label">Export</div>
                            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                                <div>
                                    <div className="settings-row-label">Export All Data</div>
                                    <div className="settings-row-description">
                                        Save all your entries, collections, awards, and profile image mappings as either a JSON backup or a ZIP backup with bundled local assets
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
                        </div>

                        <div className="settings-group">
                            <div className="settings-group-label">Import</div>
                            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                                <div>
                                    <div className="settings-row-label">Import Data</div>
                                    <div className="settings-row-description">
                                        Restore data from a JSON or ZIP backup file. Duplicate entries will be skipped.
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
                        </div>

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
                        <h1 className="settings-section-title">Changelog</h1>

                        <div className="settings-group">
                            <div className="settings-group-label">Local Release Notes</div>
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
                        </div>

                        {changelog.releases.length > 0 ? (
                            changelog.releases.map((release) => {
                                const isExpanded = expandedReleaseVersion === release.version;

                                return (
                                    <div className="settings-group changelog-release" key={release.version}>
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
                                    </div>
                                );
                            })
                        ) : (
                            <div className="settings-group">
                                <div className="settings-row changelog-empty-state">
                                    <ScrollText size={28} />
                                    <div>
                                        <div className="settings-row-label">No changelog synced yet</div>
                                        <div className="settings-row-description">
                                            Run <code>npm run changelog:sync</code> before building the app to bundle published release notes.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* About Section */}
                {activeSection === 'about' && (
                    <div className="settings-section-enter" key="about">
                        <h1 className="settings-section-title">About</h1>

                        <div className="settings-group">
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
                        </div>

                        <div className="settings-group">
                            <div className="settings-group-label">Application</div>
                            <AboutInfoRow label="App Name" value={appMetadata.appName} />
                            <AboutInfoRow label="App Version" value={appMetadata.appVersion} />
                            <AboutInfoRow label="App Identifier" value={appMetadata.appIdentifier} mono />
                            <AboutInfoRow label="Package Name" value={appMetadata.packageName} mono />
                            <AboutInfoRow label="Package Version" value={appMetadata.packageVersion} />
                            <AboutInfoRow label="Build Mode" value={import.meta.env.MODE} />
                            <AboutInfoRow label="Build Type" value={import.meta.env.DEV ? 'Development' : 'Production'} />
                        </div>

                        <div className="settings-group">
                            <div className="settings-group-label">Runtime</div>
                            <AboutInfoRow label="Tauri API Package" value={appMetadata.tauriApiVersion} mono />
                            <AboutInfoRow label="Tauri CLI Package" value={appMetadata.tauriCliVersion} mono />
                            <AboutInfoRow label="React Package" value={appMetadata.reactVersion} mono />
                        </div>

                        <div className="settings-group">
                            <div className="settings-group-label">Data & Library</div>
                            <AboutInfoRow label="Current Data Directory" value={currentPath || 'Loading...'} mono />
                            <AboutInfoRow label="Default Data Directory" value={defaultPath || 'Loading...'} mono />
                            <AboutInfoRow label="Storage Mode" value={isCustom ? 'Custom data directory' : 'Default app local data directory'} />
                            <AboutInfoRow label="Database File" value={DB_FILENAME} mono />
                            <AboutInfoRow label="Media Entries" value={dataStats?.mediaCount ?? 'Loading...'} />
                            <AboutInfoRow label="Collections" value={dataStats?.collectionCount ?? 'Loading...'} />
                            <AboutInfoRow label="Awards" value={dataStats?.awardCount ?? 'Loading...'} />
                        </div>

                        <div className="settings-group">
                            <div className="settings-group-label">Preferences</div>
                            <AboutInfoRow label="Display Name" value={displayName || 'Collector'} />
                            <AboutInfoRow label="Accent Theme" value={colorTheme.name} />
                            <AboutInfoRow label="Glass Style" value={glassStyle} />
                            <AboutInfoRow label="Navigation Years" value={navigationYears.join(', ')} />
                        </div>

                        <div className="settings-group">
                            <div className="settings-group-label">Environment</div>
                            <AboutInfoRow label="Platform" value={environmentInfo.platform} />
                            <AboutInfoRow label="Language" value={environmentInfo.language} />
                            <AboutInfoRow label="Timezone" value={environmentInfo.timezone} />
                            <AboutInfoRow label="Viewport" value={environmentInfo.viewport} />
                            <AboutInfoRow label="Screen" value={environmentInfo.screen} />
                            <AboutInfoRow label="Device Pixel Ratio" value={environmentInfo.devicePixelRatio} />
                            <AboutInfoRow label="CPU Threads" value={environmentInfo.hardwareConcurrency} />
                            <AboutInfoRow label="WebView User Agent" value={environmentInfo.userAgent} mono />
                        </div>

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
                                            <span>Media entries skipped (duplicates):</span>
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
