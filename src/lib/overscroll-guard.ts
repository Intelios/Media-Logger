// macOS WKWebView rubber-bands the root frame and nested scrollers on
// overscroll, which exposes the transparent window backdrop at the edges and
// reads as the whole UI jumping. Windows has no equivalent behavior, so this
// guard is macOS-only and restores that platform's hard-stop feel by clamping
// wheel/keypress scrolls before WebKit can start a bounce.
// `overscroll-behavior: none` in index.css covers the same ground on modern
// WebKit; this guard is the version-proof backstop and also covers keyboard
// scrolling, which ignores overscroll-behavior (WebKit bug 258593).

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac/i.test(navigator.platform) || /mac os/i.test(navigator.userAgent);
}

// Elements WebKit would let the wheel gesture scroll. `overflow: clip` counts
// as scrollable by the engine, so it's included in the axis check.
const SCROLLABLE_OVERFLOW = /^(auto|scroll|clip|overlay)$/;

function isScrollable(el: HTMLElement, axis: "x" | "y"): boolean {
  const style = getComputedStyle(el);
  if (axis === "y") {
    return (
      el.scrollHeight - el.clientHeight > 1 &&
      (SCROLLABLE_OVERFLOW.test(style.overflowY) || SCROLLABLE_OVERFLOW.test(style.overflow))
    );
  }
  return (
    el.scrollWidth - el.clientWidth > 1 &&
    (SCROLLABLE_OVERFLOW.test(style.overflowX) || SCROLLABLE_OVERFLOW.test(style.overflow))
  );
}

function wheelDeltaToPixels(delta: number, mode: number, el: HTMLElement | null, axis: "x" | "y"): number {
  // DOM_DELTA_LINE ≈ 1; DOM_DELTA_PAGE = 2. Trackpads report pixels already.
  if (mode === 1) return delta * 16;
  if (mode === 2) return delta * (el ? (axis === "y" ? el.clientHeight : el.clientWidth) : 800);
  return delta;
}

const KEY_SCROLL: Record<string, { axis: "x" | "y"; dir: 1 | -1 } | { axis: "y"; edge: "top" | "bottom" }> = {
  PageDown: { axis: "y", dir: 1 },
  PageUp: { axis: "y", dir: -1 },
  " ": { axis: "y", dir: 1 },
  ArrowDown: { axis: "y", dir: 1 },
  ArrowUp: { axis: "y", dir: -1 },
  ArrowRight: { axis: "x", dir: 1 },
  ArrowLeft: { axis: "x", dir: -1 },
  Home: { axis: "y", edge: "top" },
  End: { axis: "y", edge: "bottom" },
};

function consumesKeyTarget(el: HTMLElement): boolean {
  return Boolean(
    el.isContentEditable ||
      el.closest("input, textarea, select, button, a[href], summary, [contenteditable='true'], [contenteditable=''], [role='slider'], [role='spinbutton'], [role='textbox'], [role='listbox'], [role='combobox'], [role='tablist']"),
  );
}

function scrollableAncestor(el: HTMLElement | null, axis: "x" | "y"): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node && node !== document.documentElement) {
    if (isScrollable(node, axis)) return node;
    node = node.parentElement;
  }
  return null;
}

function handleWheel(event: WheelEvent): void {
  if (event.ctrlKey) return; // pinch-zoom emulation — never touch it.
  if (!(event.target instanceof Element)) return;

  const path = event.composedPath();
  let el: HTMLElement | null = null;
  for (const node of path) {
    if (node instanceof HTMLElement) {
      el = node;
      break;
    }
  }

  let dy = wheelDeltaToPixels(event.deltaY, event.deltaMode, el, "y");
  let dx = wheelDeltaToPixels(event.deltaX, event.deltaMode, el, "x");
  if (Math.abs(dy) < 0.5 && Math.abs(dx) < 0.5) return;

  // Hand each axis' delta to the nearest ancestors that can scroll it, the way
  // the engine's scroll chaining does — minus the overscroll at the end.
  const moves: Array<{ el: HTMLElement; top?: number; left?: number }> = [];
  for (const node of path) {
    if (!(node instanceof HTMLElement)) continue;

    if (Math.abs(dy) >= 0.5 && isScrollable(node, "y")) {
      const room = dy > 0
        ? node.scrollHeight - node.clientHeight - node.scrollTop
        : -node.scrollTop;
      const consume = Math.abs(dy) <= Math.abs(room) ? dy : room;
      if (Math.abs(consume) >= 0.5) {
        moves.push({ el: node, top: node.scrollTop + consume });
        dy -= consume;
      } else {
        dy = 0;
      }
    }

    if (Math.abs(dx) >= 0.5 && isScrollable(node, "x")) {
      const room = dx > 0
        ? node.scrollWidth - node.clientWidth - node.scrollLeft
        : -node.scrollLeft;
      const consume = Math.abs(dx) <= Math.abs(room) ? dx : room;
      if (Math.abs(consume) >= 0.5) {
        moves.push({ el: node, left: node.scrollLeft + consume });
        dx -= consume;
      } else {
        dx = 0;
      }
    }

    if (Math.abs(dy) < 0.5 && Math.abs(dx) < 0.5) break;
  }

  if (Math.abs(dy) < 0.5 && Math.abs(dx) < 0.5) return; // fully consumed natively

  // Some delta was left over (nothing scrollable, or an edge was reached):
  // apply what fits ourselves so the scroller lands exactly on the boundary,
  // then swallow the event so WebKit can't turn the remainder into a bounce.
  event.preventDefault();
  for (const move of moves) {
    if (move.top !== undefined) move.el.scrollTop = move.top;
    if (move.left !== undefined) move.el.scrollLeft = move.left;
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const spec = KEY_SCROLL[event.key];
  if (!spec) return;
  if (!(event.target instanceof HTMLElement)) return;
  if (consumesKeyTarget(event.target)) return;

  // Match the platform's target: the scrollable ancestor of the focused
  // element, or the document's main scroller when nothing is focused.
  let scroller = scrollableAncestor(
    document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null,
    spec.axis,
  );
  if (!scroller) {
    scroller = document.querySelector("main");
    if (!scroller || !isScrollable(scroller, spec.axis)) scroller = null;
  }

  const size = scroller ? (spec.axis === "y" ? scroller.clientHeight : scroller.clientWidth) : 0;
  const pos = scroller ? (spec.axis === "y" ? scroller.scrollTop : scroller.scrollLeft) : 0;
  const max = scroller ? (spec.axis === "y" ? scroller.scrollHeight - scroller.clientHeight : scroller.scrollWidth - scroller.clientWidth) : 0;

  let target: number;
  if ("edge" in spec) {
    target = spec.edge === "top" ? 0 : max;
  } else {
    const amount = event.key === " " ? size * 0.9 : event.key.startsWith("Page") ? size : 40;
    const signed = event.key === " " && event.shiftKey ? -amount : spec.dir * amount;
    target = pos + signed;
  }

  const clamped = Math.min(Math.max(target, 0), max);
  if (scroller && Math.abs(clamped - target) < 0.5 && Math.abs(clamped - pos) >= 0.5) {
    return; // fits inside the scroller — let WebKit scroll natively
  }

  event.preventDefault();
  if (scroller) {
    if (spec.axis === "y") scroller.scrollTop = clamped;
    else scroller.scrollLeft = clamped;
  }
}

export function installOverscrollGuard(): void {
  if (typeof window === "undefined" || !isMacPlatform()) return;
  window.addEventListener("wheel", handleWheel, { capture: true, passive: false });
  window.addEventListener("keydown", handleKeydown, { capture: true });
}
