import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
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
    ChevronRight
} from 'lucide-react';
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

type SettingsSection = 'general' | 'appearance' | 'storage';

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

    const navItems: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
        { id: 'general', label: 'General', icon: <User size={18} /> },
        { id: 'appearance', label: 'Appearance', icon: <Palette size={18} /> },
        { id: 'storage', label: 'Storage', icon: <HardDrive size={18} /> },
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
            </main>
        </div>
    );
}
