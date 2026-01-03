import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { appLocalDataDir } from '@tauri-apps/api/path';
import { FolderOpen, RotateCcw, Info, Database, Image, CheckCircle2 } from 'lucide-react';
import {
    getDataDirectory,
    setDataDirectory,
    clearDataDirectory,
    hasCustomDataDirectory
} from '../lib/settings';

export default function Settings() {
    const [currentPath, setCurrentPath] = useState<string>('');
    const [defaultPath, setDefaultPath] = useState<string>('');
    const [isCustom, setIsCustom] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

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

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
                    Settings
                </h1>
                <p className="text-gray-400 mt-2">
                    Configure where Media Logger stores and retrieves your data
                </p>
            </div>

            {/* Success Toast */}
            {showSuccess && (
                <div className="fixed top-6 right-6 flex items-center gap-2 px-4 py-3 bg-green-500/20 border border-green-500/30 rounded-xl text-green-400 animate-in slide-in-from-top-2 duration-300">
                    <CheckCircle2 size={18} />
                    <span>Settings updated! Refresh the app to apply changes.</span>
                </div>
            )}

            {/* Data Directory Section */}
            <div className="bg-[#1E1E1E]/50 backdrop-blur-xl rounded-2xl border border-white/5 p-6 space-y-6">
                <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-primary/10">
                        <FolderOpen className="text-primary" size={24} />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-xl font-semibold text-white">Data Directory</h2>
                        <p className="text-gray-400 text-sm mt-1">
                            Choose a custom location for your database and image assets
                        </p>
                    </div>
                </div>

                {/* Current Path Display */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Current Location</label>
                    <div className="flex items-center gap-3">
                        <div className="flex-1 px-4 py-3 bg-[#121212] rounded-xl border border-white/10 font-mono text-sm text-gray-300 overflow-x-auto">
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
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                        >
                            <RotateCcw size={18} />
                            Reset to Default
                        </button>
                    )}
                </div>
            </div>

            {/* Directory Structure Info */}
            <div className="bg-[#1E1E1E]/50 backdrop-blur-xl rounded-2xl border border-white/5 p-6 space-y-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-blue-500/10">
                        <Info className="text-blue-400" size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Expected Directory Structure</h2>
                        <p className="text-gray-400 text-sm mt-1">
                            Your data directory should contain these files and folders:
                        </p>
                    </div>
                </div>

                <div className="bg-[#121212] rounded-xl border border-white/5 p-4 font-mono text-sm">
                    <div className="flex items-center gap-2 text-gray-300">
                        <FolderOpen size={16} className="text-yellow-400" />
                        <span className="text-white">Your Data Directory</span>
                    </div>
                    <div className="ml-6 mt-2 space-y-1">
                        <div className="flex items-center gap-2 text-gray-400">
                            <Database size={14} className="text-primary" />
                            <span>jav_log.db</span>
                            <span className="text-xs text-gray-600">— SQLite database</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-400">
                            <FolderOpen size={14} className="text-yellow-400" />
                            <span>assets/</span>
                        </div>
                        <div className="ml-5 flex items-center gap-2 text-gray-500">
                            <FolderOpen size={14} className="text-yellow-400/60" />
                            <span>images/</span>
                        </div>
                        <div className="ml-10 flex items-center gap-2 text-gray-500">
                            <Image size={14} className="text-secondary/60" />
                            <span>{'{uuid}'}.png / .jpg / .webp</span>
                        </div>
                    </div>
                </div>

                <p className="text-xs text-gray-500">
                    <span className="text-amber-400">Note:</span> After changing the data directory, you may need to refresh the app for changes to take effect.
                </p>
            </div>

            {/* Default Path Reference */}
            {defaultPath && (
                <div className="text-sm text-gray-500">
                    <span className="font-medium">Default location:</span>{' '}
                    <code className="px-2 py-1 bg-[#1E1E1E] rounded text-xs">{defaultPath}</code>
                </div>
            )}
        </div>
    );
}
