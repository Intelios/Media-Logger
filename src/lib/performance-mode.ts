import { STORAGE_KEYS } from "./themes";

export const IS_PERFORMANCE_BUILD = import.meta.env.MODE === "performance";
/**
 * Debug and Performance Lab builds only. Keyed off the Vite *mode* (not
 * `import.meta.env.PROD`, which follows the command — `vite build --mode
 * performance` would otherwise look like a release): mode is `development`
 * (`npm run tauri dev`), `performance` (Perf Lab dev or build), and
 * `production` (`npm run tauri build`).
 *
 * Rollup only folds the literal when it appears at the gating site, so
 * App.tsx inlines `import.meta.env.MODE !== "production"` at the dynamic-import
 * site; that keeps the Performance page chunk out of release bundles entirely.
 */
export const IS_DEV_OR_PERFORMANCE_BUILD = import.meta.env.MODE !== "production";

const CUSTOM_DATA_DIRECTORY_KEY = "media-logger-data-directory";

/**
 * Runs before providers mount so the performance app cannot inherit or retain
 * a path to a real library and is visually obvious from its first frame.
 */
export function preparePerformanceBuildEnvironment(): void {
  if (!IS_PERFORMANCE_BUILD) return;

  localStorage.removeItem(CUSTOM_DATA_DIRECTORY_KEY);
  localStorage.setItem(STORAGE_KEYS.colorTheme, "sunset");
  document.documentElement.setAttribute("data-performance-build", "true");
}
