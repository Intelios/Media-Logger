import { STORAGE_KEYS } from "./themes";

export const IS_PERFORMANCE_BUILD = import.meta.env.MODE === "performance";

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
