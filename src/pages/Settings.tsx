import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { appLocalDataDir } from '@tauri-apps/api/path';
import { FolderOpen, RotateCcw, Info, Database, Image, CheckCircle2, Palette, Sun, Moon, Check, User } from 'lucide-react';
import {
    getDataDirectory,
    setDataDirectory,
    clearDataDirectory,
    hasCustomDataDirectory,
    getDisplayName,
    setDisplayName,
    hasCustomDisplayName,
    clearDisplayName
} from '../lib/settings';
import { useTheme } from '../lib/ThemeContext';
import type { ColorTheme, ThemeMode } from '../lib/themes';

export default function Settings() {
    const [currentPath, setCurrentPath] = useState<string>('');
    const [defaultPath, setDefaultPath] = useState<string>('');
    const [isCustom, setIsCustom] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    // Display name state
    const [displayName, setDisplayNameState] = useState<string>('');
    const [isCustomName, setIsCustomName] = useState(false);

    const { colorTheme, themeMode, setColorTheme, setThemeMode, colorThemes } = useTheme();

    useEffect(() => {
        // Load current paths on mount
        const loadPaths = async () => {
            const dataDir = await getDataDirectory();
            const appDir = await appLocalDataDir();
            setCurrentPath(dataDir);
            setDefaultPath(appDir);
            setIsCustom(hasCustomDataDirectory());
        };
        loadPaths();

        // Load display name
        setDisplayNameState(getDisplayName());
        setIsCustomName(hasCustomDisplayName());
    }, []);

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
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        }
    };

    const handleReset = async () => {
        clearDataDirectory();
        const appDir = await appLocalDataDir();
        setCurrentPath(appDir);
        setIsCustom(false);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
    };

    const handleDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDisplayNameState(e.target.value);
    };

    const handleDisplayNameSave = () => {
        setDisplayName(displayName);
        setIsCustomName(displayName.trim() !== '' && displayName.trim() !== 'Collector');
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
    };

    const handleDisplayNameReset = () => {
        clearDisplayName();
        setDisplayNameState('Collector');
        setIsCustomName(false);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
    };

    const handleColorThemeChange = (theme: ColorTheme) => {
        setColorTheme(theme);
    };

    const handleThemeModeChange = (mode: ThemeMode) => {
        setThemeMode(mode);
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
                    Settings
                </h1>
                <p style={{ color: 'var(--color-text-muted)' }} className="mt-2">
                    Configure your Media Logger preferences
                </p>
            </div>

            {/* Success Toast */}
            {showSuccess && (
                <div className="fixed top-6 right-6 flex items-center gap-2 px-4 py-3 bg-green-500/20 border border-green-500/30 rounded-xl text-green-400 animate-in slide-in-from-top-2 duration-300">
                    <CheckCircle2 size={18} />
                    <span>Settings updated! Refresh the app to apply changes.</span>
                </div>
            )}

            {/* Appearance Section */}
            <div style={{ backgroundColor: 'var(--color-surface)', opacity: 0.8 }} className="backdrop-blur-xl rounded-2xl border border-white/5 p-6 space-y-6">
                <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-primary/10">
                        <Palette className="text-primary" size={24} />
                    </div>
                    <div className="flex-1">
                        <h2 style={{ color: 'var(--color-text)' }} className="text-xl font-semibold">Appearance</h2>
                        <p style={{ color: 'var(--color-text-muted)' }} className="text-sm mt-1">
                            Customize the look and feel of Media Logger
                        </p>
                    </div>
                </div>

                {/* Theme Mode Toggle */}
                <div className="space-y-3">
                    <label style={{ color: 'var(--color-text-muted)' }} className="text-sm font-medium">Theme Mode</label>
                    <div className="flex gap-3">
                        <button
                            onClick={() => handleThemeModeChange('light')}
                            className={`flex-1 flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-medium transition-all duration-200 ${themeMode === 'light'
                                ? 'bg-primary/20 border-2 border-primary text-primary'
                                : 'border-2 border-white/10 hover:border-white/20'
                                }`}
                            style={{ color: themeMode !== 'light' ? 'var(--color-text-muted)' : undefined }}
                        >
                            <Sun size={20} />
                            <span>Light</span>
                            {themeMode === 'light' && <Check size={16} className="ml-auto" />}
                        </button>
                        <button
                            onClick={() => handleThemeModeChange('dark')}
                            className={`flex-1 flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-medium transition-all duration-200 ${themeMode === 'dark'
                                ? 'bg-primary/20 border-2 border-primary text-primary'
                                : 'border-2 border-white/10 hover:border-white/20'
                                }`}
                            style={{ color: themeMode !== 'dark' ? 'var(--color-text-muted)' : undefined }}
                        >
                            <Moon size={20} />
                            <span>Dark</span>
                            {themeMode === 'dark' && <Check size={16} className="ml-auto" />}
                        </button>
                    </div>
                </div>

                {/* Color Theme Selector */}
                <div className="space-y-3">
                    <label style={{ color: 'var(--color-text-muted)' }} className="text-sm font-medium">Color Theme</label>
                    <div className="grid grid-cols-3 gap-3">
                        {colorThemes.map((theme) => (
                            <button
                                key={theme.id}
                                onClick={() => handleColorThemeChange(theme)}
                                className={`group relative flex flex-col items-center gap-2 py-4 px-3 rounded-xl transition-all duration-200 ${colorTheme.id === theme.id
                                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-transparent'
                                    : 'hover:scale-[1.02]'
                                    }`}
                                style={{
                                    backgroundColor: 'var(--color-background)',
                                    border: '1px solid var(--color-border)'
                                }}
                            >
                                {/* Color Swatch */}
                                <div
                                    className="w-12 h-12 rounded-full shadow-lg transition-transform group-hover:scale-110"
                                    style={{ background: theme.previewGradient }}
                                />

                                {/* Theme Name */}
                                <span
                                    style={{ color: 'var(--color-text)' }}
                                    className="text-sm font-medium"
                                >
                                    {theme.name}
                                </span>

                                {/* Selected Indicator */}
                                {colorTheme.id === theme.id && (
                                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                        <Check size={12} className="text-white" />
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Preview */}
                <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: 'var(--color-background)' }}>
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${colorTheme.primary}, ${colorTheme.secondary})` }}>
                            <Palette size={20} className="text-white" />
                        </div>
                        <div>
                            <p style={{ color: 'var(--color-text)' }} className="font-semibold">Preview</p>
                            <p style={{ color: 'var(--color-text-muted)' }} className="text-sm">Current theme: {colorTheme.name} ({themeMode})</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button className="px-4 py-2 rounded-lg font-medium text-white" style={{ background: `linear-gradient(135deg, ${colorTheme.primary}, ${colorTheme.secondary})` }}>
                            Primary Button
                        </button>
                        <button
                            className="px-4 py-2 rounded-lg font-medium"
                            style={{
                                backgroundColor: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                border: '1px solid var(--color-border)'
                            }}
                        >
                            Secondary
                        </button>
                    </div>
                </div>
            </div>

            {/* Personalization Section */}
            <div style={{ backgroundColor: 'var(--color-surface)', opacity: 0.8 }} className="backdrop-blur-xl rounded-2xl border border-white/5 p-6 space-y-6">
                <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-secondary/10">
                        <User className="text-secondary" size={24} />
                    </div>
                    <div className="flex-1">
                        <h2 style={{ color: 'var(--color-text)' }} className="text-xl font-semibold">Personalization</h2>
                        <p style={{ color: 'var(--color-text-muted)' }} className="text-sm mt-1">
                            Customize your dashboard experience
                        </p>
                    </div>
                </div>

                {/* Display Name */}
                <div className="space-y-2">
                    <label style={{ color: 'var(--color-text-muted)' }} className="text-sm font-medium">Display Name</label>
                    <p style={{ color: 'var(--color-text-subtle)' }} className="text-xs">
                        This name will be used in the dashboard greeting (e.g., "Good Morning, <strong>{displayName}</strong>")
                    </p>
                    <div className="flex items-center gap-3">
                        <input
                            type="text"
                            value={displayName}
                            onChange={handleDisplayNameChange}
                            placeholder="Collector"
                            className="flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
                            style={{
                                backgroundColor: 'var(--color-background)',
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text)'
                            }}
                        />
                        {isCustomName && (
                            <span className="px-2 py-1 text-xs font-semibold rounded-lg bg-secondary/20 text-secondary whitespace-nowrap">
                                Custom
                            </span>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={handleDisplayNameSave}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold bg-gradient-to-r from-primary to-secondary hover:shadow-lg hover:shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                        <CheckCircle2 size={18} />
                        Save Name
                    </button>
                    {isCustomName && (
                        <button
                            onClick={handleDisplayNameReset}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium hover:bg-white/10 transition-all"
                            style={{
                                backgroundColor: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text)'
                            }}
                        >
                            <RotateCcw size={18} />
                            Reset to Default
                        </button>
                    )}
                </div>
            </div>

            {/* Data Directory Section */}
            <div style={{ backgroundColor: 'var(--color-surface)', opacity: 0.8 }} className="backdrop-blur-xl rounded-2xl border border-white/5 p-6 space-y-6">
                <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-primary/10">
                        <FolderOpen className="text-primary" size={24} />
                    </div>
                    <div className="flex-1">
                        <h2 style={{ color: 'var(--color-text)' }} className="text-xl font-semibold">Data Directory</h2>
                        <p style={{ color: 'var(--color-text-muted)' }} className="text-sm mt-1">
                            Choose a custom location for your database and image assets
                        </p>
                    </div>
                </div>

                {/* Current Path Display */}
                <div className="space-y-2">
                    <label style={{ color: 'var(--color-text-muted)' }} className="text-sm font-medium">Current Location</label>
                    <div className="flex items-center gap-3">
                        <div
                            className="flex-1 px-4 py-3 rounded-xl font-mono text-sm overflow-x-auto"
                            style={{
                                backgroundColor: 'var(--color-background)',
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text-muted)'
                            }}
                        >
                            {currentPath || 'Loading...'}
                        </div>
                        {isCustom && (
                            <span className="px-2 py-1 text-xs font-semibold rounded-lg bg-secondary/20 text-secondary whitespace-nowrap">
                                Custom
                            </span>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={handleBrowse}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold bg-gradient-to-r from-primary to-secondary hover:shadow-lg hover:shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                        <FolderOpen size={18} />
                        Browse...
                    </button>
                    {isCustom && (
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium hover:bg-white/10 transition-all"
                            style={{
                                backgroundColor: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text)'
                            }}
                        >
                            <RotateCcw size={18} />
                            Reset to Default
                        </button>
                    )}
                </div>
            </div>

            {/* Directory Structure Info */}
            <div style={{ backgroundColor: 'var(--color-surface)', opacity: 0.8 }} className="backdrop-blur-xl rounded-2xl border border-white/5 p-6 space-y-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-blue-500/10">
                        <Info className="text-blue-400" size={24} />
                    </div>
                    <div>
                        <h2 style={{ color: 'var(--color-text)' }} className="text-lg font-semibold">Expected Directory Structure</h2>
                        <p style={{ color: 'var(--color-text-muted)' }} className="text-sm mt-1">
                            Your data directory should contain these files and folders:
                        </p>
                    </div>
                </div>

                <div className="rounded-xl p-4 font-mono text-sm" style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border-subtle)' }}>
                    <div className="flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
                        <FolderOpen size={16} className="text-yellow-400" />
                        <span style={{ color: 'var(--color-text)' }}>Your Data Directory</span>
                    </div>
                    <div className="ml-6 mt-2 space-y-1">
                        <div className="flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
                            <Database size={14} className="text-primary" />
                            <span>jav_log.db</span>
                            <span style={{ color: 'var(--color-text-subtle)' }} className="text-xs">— SQLite database</span>
                        </div>
                        <div className="flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
                            <FolderOpen size={14} className="text-yellow-400" />
                            <span>assets/</span>
                        </div>
                        <div className="ml-5 flex items-center gap-2" style={{ color: 'var(--color-text-subtle)' }}>
                            <FolderOpen size={14} className="text-yellow-400/60" />
                            <span>images/</span>
                        </div>
                        <div className="ml-10 flex items-center gap-2" style={{ color: 'var(--color-text-subtle)' }}>
                            <Image size={14} className="text-secondary/60" />
                            <span>{'{uuid}'}.png / .jpg / .webp</span>
                        </div>
                    </div>
                </div>

                <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>
                    <span className="text-amber-400">Note:</span> After changing the data directory, you may need to refresh the app for changes to take effect.
                </p>
            </div>

            {/* Default Path Reference */}
            {defaultPath && (
                <div className="text-sm" style={{ color: 'var(--color-text-subtle)' }}>
                    <span className="font-medium">Default location:</span>{' '}
                    <code className="px-2 py-1 rounded text-xs" style={{ backgroundColor: 'var(--color-surface)' }}>{defaultPath}</code>
                </div>
            )}
        </div>
    );
}

