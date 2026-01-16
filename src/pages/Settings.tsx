import { useState, useEffect } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { appLocalDataDir } from '@tauri-apps/api/path';
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
    HardDrive,
    ChevronRight,
    Download,
    Upload,
    FileSpreadsheet,
    AlertCircle,
    Loader2
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
    hasCustomDisplayName
} from '../lib/settings';
import { useTheme } from '../lib/ThemeContext';
import type { ColorTheme, ThemeMode } from '../lib/themes';

type SettingsSection = 'general' | 'appearance' | 'storage' | 'data';

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

    const { colorTheme, themeMode, setColorTheme, setThemeMode, colorThemes } = useTheme();

    // Data export/import state
    const [dataStats, setDataStats] = useState<{ mediaCount: number; collectionCount: number; awardCount: number } | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);

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

    const handleColorThemeChange = (theme: ColorTheme) => {
        setColorTheme(theme);
    };

    const handleThemeModeChange = (mode: ThemeMode) => {
        setThemeMode(mode);
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const content = await exportToFile();
            const filePath = await save({
                defaultPath: `media-logger-backup-${new Date().toISOString().split('T')[0]}.json`,
                filters: [{ name: 'JSON', extensions: ['json'] }]
            });
            if (filePath) {
                await writeTextFile(filePath, content);
                showToast('Data exported successfully!');
            }
        } catch (error) {
            console.error('Export error:', error);
            showToast('Export failed: ' + String(error));
        } finally {
            setIsExporting(false);
        }
    };

    const handleImport = async () => {
        try {
            const filePath = await open({
                multiple: false,
                filters: [{ name: 'JSON', extensions: ['json'] }]
            });
            if (filePath && typeof filePath === 'string') {
                setIsImporting(true);
                const content = await readTextFile(filePath);
                const result = await importFromFile(content);
                setImportResult(result);
                setShowImportModal(true);
                // Refresh stats after import
                const newStats = await getDataStats();
                setDataStats(newStats);
            }
        } catch (error) {
            console.error('Import error:', error);
            showToast('Import failed: ' + String(error));
        } finally {
            setIsImporting(false);
        }
    };

    const navItems: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
        { id: 'general', label: 'General', icon: <User size={18} /> },
        { id: 'appearance', label: 'Appearance', icon: <Palette size={18} /> },
        { id: 'storage', label: 'Storage', icon: <HardDrive size={18} /> },
        { id: 'data', label: 'Data', icon: <FileSpreadsheet size={18} /> },
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
                    </div>
                )}

                {/* Storage Section */}
                {activeSection === 'storage' && (
                    <div className="settings-section-enter" key="storage">
                        <h1 className="settings-section-title">Storage</h1>

                        <div className="settings-group">
                            <div className="settings-group-label">Data Location</div>

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

                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '12px 16px',
                            borderRadius: 8,
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.2)',
                            fontSize: 13,
                            color: 'var(--color-text-muted)'
                        }}>
                            <ChevronRight size={16} style={{ color: '#F59E0B' }} />
                            <span>Changes may require app refresh to take effect.</span>
                        </div>
                    </div>
                )}

                {/* Data Section */}
                {activeSection === 'data' && (
                    <div className="settings-section-enter" key="data">
                        <h1 className="settings-section-title">Data</h1>

                        <div className="settings-group">
                            <div className="settings-group-label">Current Data</div>
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
                                        Save all your entries, collections, and awards to a backup file
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
                                        Restore data from a backup file. Duplicate entries will be skipped.
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
                            <span>Export files include all your data in JSON format with embedded CSVs. Images are not included in exports—only references to image paths.</span>
                        </div>
                    </div>
                )}

                {/* Import Result Modal */}
                {showImportModal && importResult && (
                    <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
                            <h2 style={{ marginBottom: 16 }}>
                                {importResult.success ? 'Import Complete' : 'Import Failed'}
                            </h2>
                            {importResult.success ? (
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
                                </div>
                            ) : (
                                <div style={{ color: '#EF4444' }}>
                                    {importResult.errors.join(', ')}
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
