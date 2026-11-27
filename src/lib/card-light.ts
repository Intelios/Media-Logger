import { createContext } from "react";

// Light a 10/10 card casts onto the cards around it.
//
// VirtualizedCardGrid knows the column layout, so it works out which of an
// item's neighbours are light sources and hands the item a bitmask through
// CardLightContext; the card paints a green rim and spill on those sides.
// Every glow layer (the 10/10's own and the light it casts) syncs to one
// shared clock, so the spill breathes in step with the glow it comes from
// even when the two cards mounted at different times (virtual rows do).

/** Directions light arrives from: the side or corner a lit neighbour sits on. */
export const LIGHT_FROM = {
  left: 1,
  right: 2,
  top: 4,
  bottom: 8,
  topLeft: 16,
  topRight: 32,
  bottomLeft: 64,
  bottomRight: 128,
} as const;

/** Bitmask of LIGHT_FROM directions; 0 means no lit neighbours. */
export const CardLightContext = createContext(0);

/** Which neighbours of `index` in a row-major grid of `columns` are light sources. */
export function incomingLight(sources: readonly boolean[], index: number, columns: number): number {
  const lit = (i: number) => i >= 0 && i < sources.length && sources[i];
  const col = index % columns;
  const hasLeft = col > 0;
  const hasRight = col < columns - 1;
  let mask = 0;
  if (hasLeft && lit(index - 1)) mask |= LIGHT_FROM.left;
  if (hasRight && lit(index + 1)) mask |= LIGHT_FROM.right;
  if (lit(index - columns)) mask |= LIGHT_FROM.top;
  if (lit(index + columns)) mask |= LIGHT_FROM.bottom;
  if (hasLeft && lit(index - columns - 1)) mask |= LIGHT_FROM.topLeft;
  if (hasRight && lit(index - columns + 1)) mask |= LIGHT_FROM.topRight;
  if (hasLeft && lit(index + columns - 1)) mask |= LIGHT_FROM.bottomLeft;
  if (hasRight && lit(index + columns + 1)) mask |= LIGHT_FROM.bottomRight;
  return mask;
}

// The shared clock is itself a CSS animation on a hidden element, listed with
// the glows in index.css's energy-saver rules, so it pauses and resumes with
// them: a layer that mounts mid-pause still lands on the paused phase. It
// exists only while some glow layer is mounted.

/** 3s breathe and 10s swell both divide it, so one phase serves both. */
const CYCLE_MS = 30_000;

let clock: HTMLElement | null = null;
let syncedLayers = 0;

function readPhase(): number {
  if (!clock) {
    clock = document.createElement("div");
    clock.className = "glow-clock";
    clock.setAttribute("aria-hidden", "true");
    document.body.appendChild(clock);
  }
  // Reduced motion removes the animation; the phase is moot then.
  const time = clock.getAnimations()[0]?.currentTime;
  return typeof time === "number" ? time % CYCLE_MS : 0;
}

/**
 * Ref callback for an animated glow layer: offsets its animation (via
 * `--glow-sync`, which index.css adds to its animation-delay) to the shared
 * clock's phase at the moment it mounts.
 */
export function syncGlowPhase(element: HTMLElement | null) {
  if (!element) return;
  syncedLayers += 1;
  element.style.setProperty("--glow-sync", `${-readPhase()}ms`);
  return () => {
    syncedLayers -= 1;
    if (syncedLayers === 0) {
      clock?.remove();
      clock = null;
    }
  };
}
