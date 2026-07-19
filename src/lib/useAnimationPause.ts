import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const PAUSED_CLASS = "animations-paused";

/**
 * Freezes all CSS animations while the window is backgrounded (unfocused or
 * hidden). The infinite decorative animations (dashboard ken-burns, score
 * glows, shimmers) otherwise keep WindowServer/GPU compositing the whole
 * translucent window at full frame rate whenever any part of it is on
 * screen — measured at ~30% WindowServer CPU + ~27% GPU utilization — even
 * when the app is just sitting behind other windows.
 */
export function useAnimationPause() {
  useEffect(() => {
    let focused = true;

    const sync = () => {
      document.documentElement.classList.toggle(PAUSED_CLASS, document.hidden || !focused);
    };

    const handleVisibility = () => sync();
    document.addEventListener("visibilitychange", handleVisibility);

    const appWindow = getCurrentWindow();
    appWindow.isFocused().then((value) => {
      focused = value;
      sync();
    });

    // onFocusChanged resolves its unlisten fn asynchronously; guard with a
    // `cancelled` flag (same pattern as the menu listeners in Layout).
    let cancelled = false;
    let offFocus: (() => void) | undefined;
    appWindow
      .onFocusChanged(({ payload }) => {
        focused = payload;
        sync();
      })
      .then((fn) => {
        if (cancelled) fn();
        else offFocus = fn;
      });

    return () => {
      cancelled = true;
      offFocus?.();
      document.removeEventListener("visibilitychange", handleVisibility);
      document.documentElement.classList.remove(PAUSED_CLASS);
    };
  }, []);
}
