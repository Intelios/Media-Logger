import { isTauri } from "@tauri-apps/api/core";

/**
 * The window chrome differs per platform: macOS hides its title bar and hosts
 * the native traffic lights in a band at the top of the sidebar, while Windows
 * keeps its decorations. `isTauri()` keeps the band out of the browser preview.
 */
export const IS_MACOS = isTauri() && /Macintosh|Mac OS X/.test(navigator.userAgent);
