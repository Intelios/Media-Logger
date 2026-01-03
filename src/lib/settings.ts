import { appLocalDataDir } from '@tauri-apps/api/path';

const STORAGE_KEY = 'media-logger-data-directory';

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
