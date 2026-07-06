import { appLocalDataDir } from '@tauri-apps/api/path';

const STORAGE_KEY = 'media-logger-data-directory';
const DISPLAY_NAME_KEY = 'media-logger-display-name';
const NAVIGATION_YEARS_KEY = 'media-logger-navigation-years';
const RATING_DISPLAY_MODE_KEY = 'media-logger-rating-display-mode';
const ADULT_MEDIA_ENABLED_KEY = 'media-logger-adult-media-enabled';
const FEATURED_ADULT_ALLOWED_KEY = 'media-logger-featured-adult-allowed';

/**
 * Window event fired when the Adult Media visibility setting changes, so any
 * mounted views can refresh without an app restart. Mirrors the existing
 * navigation-years / entry-added event pattern.
 */
export const ADULT_MEDIA_VISIBILITY_CHANGED_EVENT = 'adult-media-visibility-changed';

/**
 * Window event fired when the Featured-Entry adult filter changes, so the
 * Dashboard can re-fetch its featured entry without an app restart.
 */
export const FEATURED_ADULT_VISIBILITY_CHANGED_EVENT = 'featured-adult-visibility-changed';

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
 * Set a custom display name. Saving the default name (or an empty value)
 * clears the override so hasCustomDisplayName() stays accurate.
 */
export function setDisplayName(name: string): void {
    const trimmed = name.trim();
    if (trimmed && trimmed !== DEFAULT_DISPLAY_NAME) {
        localStorage.setItem(DISPLAY_NAME_KEY, trimmed);
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

/**
 * Get the configured rating display mode.
 * Defaults to 'pill' for backward compatibility.
 */
export function getRatingDisplayMode(): 'pill' | 'vertical-pill' | 'thermometer' {
    const mode = localStorage.getItem(RATING_DISPLAY_MODE_KEY);
    if (mode === 'thermometer' || mode === 'vertical-pill') return mode;
    return 'pill';
}

/**
 * Set the rating display mode.
 */
export function setRatingDisplayMode(mode: 'pill' | 'vertical-pill' | 'thermometer'): void {
    localStorage.setItem(RATING_DISPLAY_MODE_KEY, mode);
}

/**
 * Whether adult media types (JAV, Hentai, Adult Visual Novel) are shown across
 * the app. Defaults to true so existing users and fresh installs behave exactly
 * as before; only an explicit 'false' disables it.
 */
export function isAdultMediaEnabled(): boolean {
    return localStorage.getItem(ADULT_MEDIA_ENABLED_KEY) !== 'false';
}

/**
 * Show or hide adult media types and entries everywhere. Data is never deleted;
 * disabling simply hides it. Dispatches an event so mounted views refresh live.
 */
export function setAdultMediaEnabled(enabled: boolean): void {
    localStorage.setItem(ADULT_MEDIA_ENABLED_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent(ADULT_MEDIA_VISIBILITY_CHANGED_EVENT));
}

/**
 * Whether adult entries are eligible to appear as the Dashboard's featured
 * entry. Independent of the global Adult Media setting: when this is false
 * (and adult media is enabled), adult entries remain visible elsewhere but
 * are excluded from the featured pool. Defaults to true for backward
 * compatibility so existing users see no behavior change.
 */
export function isFeaturedAdultAllowed(): boolean {
    return localStorage.getItem(FEATURED_ADULT_ALLOWED_KEY) !== 'false';
}

/**
 * Show or hide adult entries from the Dashboard featured spot. Dispatches an
 * event so the Dashboard re-fetches its featured entry without a restart.
 */
export function setFeaturedAdultAllowed(allowed: boolean): void {
    localStorage.setItem(FEATURED_ADULT_ALLOWED_KEY, allowed ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent(FEATURED_ADULT_VISIBILITY_CHANGED_EVENT));
}
