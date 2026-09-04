import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const PAUSED_CLASS = "animations-paused";
const SCROLLING_CLASS = "animations-scrolling";

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
    let focused = document.hasFocus();
    let focusRevision = 0;
    let scrollTimer: number | null = null;

    const sync = () => {
      document.documentElement.classList.toggle(PAUSED_CLASS, document.hidden || !focused);
    };

    const setFocused = (value: boolean) => {
      focusRevision += 1;
      focused = value;
      sync();
    };

    const handleVisibility = () => sync();
    const handleDomFocus = () => setFocused(true);
    const handleDomBlur = () => setFocused(false);
    const handleScroll = () => {
      document.documentElement.classList.add(SCROLLING_CLASS);
      if (scrollTimer != null) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        scrollTimer = null;
        document.documentElement.classList.remove(SCROLLING_CLASS);
      }, 140);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleDomFocus);
    window.addEventListener("blur", handleDomBlur);
    document.addEventListener("scroll", handleScroll, true);
    sync();

    const appWindow = getCurrentWindow();
    const revisionBeforeInitialCheck = focusRevision;
    appWindow.isFocused().then((value) => {
      // The Windows startup focus event can arrive while isFocused() is still
      // pending. Do not let its older result overwrite a newer event.
      if (focusRevision === revisionBeforeInitialCheck) {
        setFocused(value);
      }
    });

    // onFocusChanged resolves its unlisten fn asynchronously; guard with a
    // `cancelled` flag (same pattern as the menu listeners in Layout).
    let cancelled = false;
    let offFocus: (() => void) | undefined;
    appWindow
      .onFocusChanged(({ payload }) => {
        setFocused(payload);
      })
      .then((fn) => {
        if (cancelled) fn();
        else offFocus = fn;
      });

    return () => {
      cancelled = true;
      offFocus?.();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleDomFocus);
      window.removeEventListener("blur", handleDomBlur);
      document.removeEventListener("scroll", handleScroll, true);
      if (scrollTimer != null) window.clearTimeout(scrollTimer);
      document.documentElement.classList.remove(PAUSED_CLASS);
      document.documentElement.classList.remove(SCROLLING_CLASS);
    };
  }, []);
}

/**
 * Read-only view of the same energy-saver signal `useAnimationPause` writes.
 *
 * CSS animations freeze via the `animations-paused` class, but a JS clock
 * (the Review reel's chapter timer) keeps running on requestAnimationFrame
 * when the window is merely unfocused — rAF only throttles once the window is
 * *hidden*. Rather than duplicate the focus/visibility bookkeeping, this
 * observes the class the single writer above already maintains, so a JS timer
 * can never drift out of step with the CSS.
 */
export function useAnimationsPaused(): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const observer = new MutationObserver(onStoreChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const getSnapshot = useCallback(
    () => document.documentElement.classList.contains(PAUSED_CLASS),
    [],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
