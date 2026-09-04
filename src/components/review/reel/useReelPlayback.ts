import { useCallback, useEffect, useRef, useState } from "react";
import { useAnimationsPaused } from "../../../lib/useAnimationPause";

/**
 * Why playback is paused. The clock only advances when nothing is holding it.
 *
 * "background" mirrors the app-wide energy saver rather than tracking focus
 * separately — requestAnimationFrame keeps firing when a window is merely
 * unfocused, so without this the timer would race ahead of the frozen CSS.
 */
export type PauseReason = "hold" | "sticky" | "background" | "export";

/** Beyond this, a pointer-down is a hold rather than a tap. */
const TAP_MAX_MS = 220;
const TAP_MAX_TRAVEL_PX = 8;

export interface ReelPlayback {
  index: number;
  paused: boolean;
  /** True when the user explicitly paused, as opposed to a transient hold. */
  stickyPaused: boolean;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
  toggleSticky: () => void;
  setPause: (reason: PauseReason, on: boolean) => void;
  /** Attach to the active segment; the clock writes its fill directly. */
  setActiveSegment: (element: HTMLElement | null) => void;
  stageHandlers: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: () => void;
    onLostPointerCapture: () => void;
  };
}

export function useReelPlayback({
  count,
  startIndex = 0,
  durationMs = 6000,
  autoAdvance = true,
  onExit,
}: {
  count: number;
  startIndex?: number;
  durationMs?: number;
  autoAdvance?: boolean;
  onExit: () => void;
}): ReelPlayback {
  const [index, setIndex] = useState(startIndex);
  const [paused, setPausedState] = useState(false);
  const [stickyPaused, setStickyPaused] = useState(!autoAdvance);

  const reasonsRef = useRef<Set<PauseReason>>(new Set(autoAdvance ? [] : ["sticky"]));
  const elapsedRef = useRef(0);
  const segmentRef = useRef<HTMLElement | null>(null);
  const backgrounded = useAnimationsPaused();

  const syncPaused = useCallback(() => {
    setPausedState(reasonsRef.current.size > 0);
  }, []);

  const setPause = useCallback(
    (reason: PauseReason, on: boolean) => {
      if (on) reasonsRef.current.add(reason);
      else reasonsRef.current.delete(reason);
      if (reason === "sticky") setStickyPaused(on);
      syncPaused();
    },
    [syncPaused],
  );

  const toggleSticky = useCallback(() => {
    setPause("sticky", !reasonsRef.current.has("sticky"));
  }, [setPause]);

  const resetSegment = useCallback(() => {
    elapsedRef.current = 0;
    if (segmentRef.current) segmentRef.current.style.transform = "scaleX(0)";
  }, []);

  const goTo = useCallback(
    (next: number) => {
      if (next < 0) return;
      if (next >= count) {
        onExit();
        return;
      }
      setIndex(next);
      resetSegment();
    },
    [count, onExit, resetSegment],
  );

  // The rAF loop reads these through refs so it never has to be torn down and
  // rebuilt on a chapter change.
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  const indexRef = useRef(index);
  indexRef.current = index;

  const next = useCallback(() => goToRef.current(indexRef.current + 1), []);
  const prev = useCallback(() => goToRef.current(indexRef.current - 1), []);

  const setActiveSegment = useCallback((element: HTMLElement | null) => {
    segmentRef.current = element;
    if (element) {
      element.style.transform = `scaleX(${Math.min(elapsedRef.current / durationMs, 1)})`;
    }
  }, [durationMs]);

  // ── The clock ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const delta = now - last;
      last = now;

      if (reasonsRef.current.size === 0) {
        elapsedRef.current += delta;
        const progress = Math.min(elapsedRef.current / durationMs, 1);
        // Written straight to the DOM: re-rendering a full-screen chapter tree
        // at 60fps is exactly what the app's Profiler instrumentation exists
        // to catch.
        if (segmentRef.current) {
          segmentRef.current.style.transform = `scaleX(${progress})`;
        }
        if (progress >= 1) {
          elapsedRef.current = 0;
          goToRef.current(indexRef.current + 1);
        }
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationMs]);

  // ── Energy saver ──────────────────────────────────────────────────────────
  useEffect(() => {
    setPause("background", backgrounded);
  }, [backgrounded, setPause]);

  // The chapter list can shrink underneath playback — a filter change while the
  // reel is open, or an entry mutation invalidating the year. Pull the index
  // back into range rather than rendering an undefined chapter.
  useEffect(() => {
    if (count > 0 && indexRef.current > count - 1) {
      setIndex(count - 1);
      resetSegment();
    }
  }, [count, resetSegment]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // With a real focus trap the segment buttons are reachable, and Space
      // would otherwise both activate the focused button and drive the reel.
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "BUTTON" ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        prev();
      } else if (event.key === " " || event.code === "Space") {
        // Sticky, not "advance": auto-advancing content needs a persistent
        // pause, and a hold is not one.
        event.preventDefault();
        toggleSticky();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [next, prev, toggleSticky]);

  // ── Hold to pause, tap to move ────────────────────────────────────────────
  const pointerRef = useRef<{ time: number; x: number; y: number } | null>(null);

  const releaseHold = useCallback(() => {
    if (!pointerRef.current) return;
    pointerRef.current = null;
    setPause("hold", false);
  }, [setPause]);

  const stageHandlers = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      pointerRef.current = { time: performance.now(), x: event.clientX, y: event.clientY };
      // Without capture, a pointerup released outside the window never lands
      // and the reel stays paused forever.
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* capture is best-effort */
      }
      setPause("hold", true);
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      const down = pointerRef.current;
      const bounds = event.currentTarget.getBoundingClientRect();
      releaseHold();
      if (!down) return;

      const heldFor = performance.now() - down.time;
      const travel = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      if (heldFor > TAP_MAX_MS || travel > TAP_MAX_TRAVEL_PX) return;

      const third = bounds.width / 3;
      const offsetX = event.clientX - bounds.left;
      if (offsetX < third) prev();
      else next();
    },
    onPointerCancel: releaseHold,
    onLostPointerCapture: releaseHold,
  };

  return {
    index,
    paused,
    stickyPaused,
    next,
    prev,
    goTo,
    toggleSticky,
    setPause,
    setActiveSegment,
    stageHandlers,
  };
}
