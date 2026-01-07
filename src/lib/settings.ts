import { appLocalDataDir } from '@tauri-apps/api/path';

const STORAGE_KEY = 'media-logger-data-directory';
const DISPLAY_NAME_KEY = 'media-logger-display-name';

// Default display name for the dashboard greeting
const DEFAULT_DISPLAY_NAME = 'Collector';

/**
 * Get the configured display name, or fall back to the default.
 */
export function getDisplayName(): string {
    return localStorage.getItem(DISPLAY_NAME_KEY) || DEFAULT_DISPLAY_NAME;
}

/**
 * Set a custom display name.
 */
export function setDisplayName(name: string): void {
    if (name.trim()) {
        localStorage.setItem(DISPLAY_NAME_KEY, name.trim());
    } else {
        localStorage.removeItem(DISPLAY_NAME_KEY);
    }
}

/**
 * Clear the custom display name and revert to default.
 */
export function clearDisplayName(): void {
    localStorage.removeItem(DISPLAY_NAME_KEY);
}

/**
 * Check if a custom display name is set.
 */
export function hasCustomDisplayName(): boolean {
    return localStorage.getItem(DISPLAY_NAME_KEY) !== null;
}

/**
 * Get the configured data directory, or fall back to the default app data directory.
 */
export async function getDataDirectory(): Promise<string> {
    const customDir = localStorage.getItem(STORAGE_KEY);
    if (customDir) {
        return customDir;
    }
    // Fall back to default Tauri app local data directory
    return await appLocalDataDir();
}

/**
 * Set a custom data directory path.
 */
export function setDataDirectory(path: string): void {
    localStorage.setItem(STORAGE_KEY, path);
}

/**
 * Clear the custom data directory and revert to default.
 */
export function clearDataDirectory(): void {
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * Check if a custom data directory is set.
 */
export function hasCustomDataDirectory(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Get the raw custom path without fallback (returns null if not set).
 */
export function getCustomDataDirectory(): string | null {
    return localStorage.getItem(STORAGE_KEY);
}
