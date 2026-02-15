import { appLocalDataDir } from '@tauri-apps/api/path';

const STORAGE_KEY = 'media-logger-data-directory';
const DISPLAY_NAME_KEY = 'media-logger-display-name';
const NAVIGATION_YEARS_KEY = 'media-logger-navigation-years';

// Default display name for the dashboard greeting
const DEFAULT_DISPLAY_NAME = 'Collector';
const LEGACY_NAVIGATION_YEARS = ['2023', '2024', '2025', '2026'];

function normalizeNavigationYears(values: unknown): string[] {
    if (!Array.isArray(values)) return [];

    const normalized = values
        .map(v => String(v).trim())
        .filter(v => /^\d{4}$/.test(v));

    return Array.from(new Set(normalized)).sort((a, b) => Number(a) - Number(b));
}

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

/**
 * Get user-configured navigation/filter years.
 * Falls back to the legacy hard-coded years for backward compatibility.
 */
export function getNavigationYears(): string[] {
    const raw = localStorage.getItem(NAVIGATION_YEARS_KEY);
    if (!raw) return [...LEGACY_NAVIGATION_YEARS];

    try {
        const parsed = JSON.parse(raw);
        const years = normalizeNavigationYears(parsed);
        return years.length > 0 ? years : [...LEGACY_NAVIGATION_YEARS];
    } catch {
        return [...LEGACY_NAVIGATION_YEARS];
    }
}

/**
 * Persist user-configured navigation/filter years.
 * If an empty list is passed, we clear custom config and fall back to legacy defaults.
 */
export function setNavigationYears(years: string[]): string[] {
    const normalized = normalizeNavigationYears(years);

    if (normalized.length === 0) {
        localStorage.removeItem(NAVIGATION_YEARS_KEY);
        return [...LEGACY_NAVIGATION_YEARS];
    }

    localStorage.setItem(NAVIGATION_YEARS_KEY, JSON.stringify(normalized));
    return normalized;
}
