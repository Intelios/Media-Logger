import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { appLocalDataDir } from '@tauri-apps/api/path';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import {
    FolderOpen,
    RotateCcw,
    Database,
    Image,
    CheckCircle2,
    Sun,
    Moon,
    User,
    Palette,
    Download,
    Upload,
    AlertCircle,
    Loader2,
    ExternalLink,
    Plus,
    X
} from 'lucide-react';
import { exportToFile, importFromFile, getDataStats, type ImportResult } from '../lib/csv-logic';
import {
    getDataDirectory,
    setDataDirectory,
    clearDataDirectory,
    hasCustomDataDirectory,
    getDisplayName,
    setDisplayName,
    clearDisplayName,
    hasCustomDisplayName,
    getNavigationYears
} from '../lib/settings';
import { useTheme } from '../lib/ThemeContext';
import type { ColorTheme, GlassStyle, ThemeMode } from '../lib/themes';
import { getCurrentYearString, updateNavigationYears } from '../lib/navigation-years';

type SettingsSection = 'general' | 'appearance' | 'data';
type BackupFormat = 'json' | 'zip';

type BackupZipReadResult = {
    backupJson: string;
};

type ExtractBackupAssetsResult = {
    assetsRestored: number;
};

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
    const [currentPath, setCurrentPath] = useState<string>('');
    const [defaultPath, setDefaultPath] = useState<string>('');
    const [isCustom, setIsCustom] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    // Display name state
    const [displayName, setDisplayNameState] = useState<string>('');
    const [isCustomName, setIsCustomName] = useState(false);
    const [navigationYears, setNavigationYearsState] = useState<string[]>(() => getNavigationYears());
    const [yearInput, setYearInput] = useState('');
    const [yearError, setYearError] = useState('');

    const { colorTheme, themeMode, glassStyle, setColorTheme, setThemeMode, setGlassStyle, colorThemes } = useTheme();

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

        // Load data stats
        getDataStats().then(setDataStats).catch(console.error);
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
        setIsCustomName(displayName.trim() !== '' && displayName.trim() !== 'Collector');
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

    const handleThemeModeChange = (mode: ThemeMode) => {
        setThemeMode(mode);
    };

    const handleGlassStyleChange = (style: GlassStyle) => {
        if (style === glassStyle) return;
        setGlassStyle(style);
        showToast(style === 'clear' ? 'Glass style set to Clear' : 'Glass style set to Default');
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

    const navItems: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
        { id: 'general', label: 'General', icon: <User size={18} /> },
        { id: 'appearance', label: 'Appearance', icon: <Palette size={18} /> },
        { id: 'data', label: 'Data', icon: <Database size={18} /> },
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
                    </div>
                )}

                {/* Appearance Section */}
                {activeSection === 'appearance' && (
                    <div className="settings-section-enter" key="appearance">
                        <h1 className="settings-section-title">Appearance</h1>

                        <div className="settings-group">
                            <div className="settings-group-label">Theme Mode</div>
                            <div className="settings-row">
                                <div>
                                    <div className="settings-row-label">Interface Style</div>
                                    <div className="settings-row-description">Choose light or dark mode</div>
                                </div>
                                <div className="segmented-control">
                                    <button
                                        onClick={() => handleThemeModeChange('light')}
                                        className={`segmented-control-item ${themeMode === 'light' ? 'active' : ''}`}
                                    >
                                        <Sun size={16} />
                                        Light
                                    </button>
                                    <button
                                        onClick={() => handleThemeModeChange('dark')}
                                        className={`segmented-control-item ${themeMode === 'dark' ? 'active' : ''}`}
                                    >
                                        <Moon size={16} />
                                        Dark
                                    </button>
                                </div>
                            </div>
                        </div>

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
                            <div className="settings-group-label">Window Glass</div>
                            <div className="settings-row">
                                <div>
                                    <div className="settings-row-label">Glass Style</div>
                                    <div className="settings-row-description">
                                        Default keeps a solid background. Clear enables a liquid glass effect that shows colors and shapes from your desktop behind the app window.
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
                                        <span>jav_log.db</span>
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
            </main>
        </div>
    );
}
