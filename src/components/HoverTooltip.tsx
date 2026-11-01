import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const TOOLTIP_ID = "media-logger-hover-tooltip";
const TOOLTIP_GAP = 8;
const DEFAULT_TOOLTIP_WIDTH = 210;

// Long enough that sweeping the pointer across the UI doesn't flash labels,
// short enough that a deliberate hover still feels answered. Once one tooltip
// has been open the pointer is "warm", and the next one skips the wait.
const SHOW_DELAY_MS = 380;
const WARM_WINDOW_MS = 800;
const EXIT_MS = 110;

export interface HoverTooltipOptions {
  width?: number | "content";
  className?: string;
  style?: CSSProperties;
}

interface ActiveTooltip {
  anchor: HTMLElement;
  content: ReactNode;
  options: HoverTooltipOptions;
}

interface HoverTooltipController {
  showTooltip: (
    anchor: HTMLElement,
    content: ReactNode,
    options?: HoverTooltipOptions,
    immediate?: boolean
  ) => void;
  hideTooltip: (anchor?: HTMLElement) => void;
}

interface TooltipPosition {
  left: number;
  top: number;
  below: boolean;
}

const HoverTooltipContext = createContext<HoverTooltipController | null>(null);

function TooltipBubble({ active, closing }: { active: ActiveTooltip; closing: boolean }) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const width = active.options.width ?? DEFAULT_TOOLTIP_WIDTH;

  useLayoutEffect(() => {
    setPosition(null);
    const tooltip = tooltipRef.current;
    if (!tooltip || !active.anchor.isConnected) return;

    const anchorRect = active.anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const maxLeft = Math.max(TOOLTIP_GAP, window.innerWidth - tooltipRect.width - TOOLTIP_GAP);
    const centeredLeft = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
    const left = Math.max(TOOLTIP_GAP, Math.min(centeredLeft, maxLeft));
    const placeBelow = anchorRect.top < tooltipRect.height + TOOLTIP_GAP;
    const preferredTop = placeBelow
      ? anchorRect.bottom + TOOLTIP_GAP
      : anchorRect.top - tooltipRect.height - TOOLTIP_GAP;
    const maxTop = Math.max(TOOLTIP_GAP, window.innerHeight - tooltipRect.height - TOOLTIP_GAP);
    const top = Math.max(TOOLTIP_GAP, Math.min(preferredTop, maxTop));

    setPosition({ left, top, below: placeBelow });
  }, [active]);

  return createPortal(
    <div
      id={TOOLTIP_ID}
      ref={tooltipRef}
      role="tooltip"
      className={`hover-tooltip glass-tooltip pointer-events-none fixed z-[9999] ${closing ? "is-closing" : ""} ${active.options.className ?? "rounded-xl px-3 py-2"}`}
      style={
        {
          ...active.options.style,
          left: position?.left ?? 0,
          top: position?.top ?? 0,
          width: width === "content" ? "max-content" : width,
          maxWidth: `calc(100vw - ${TOOLTIP_GAP * 2}px)`,
          visibility: position ? "visible" : "hidden",
          // The bubble rises towards its anchor when it sits below it, and
          // settles down onto it when it sits above.
          "--tooltip-shift": position?.below ? "-4px" : "4px",
          "--tooltip-origin": position?.below ? "50% 0%" : "50% 100%",
        } as CSSProperties
      }
    >
      {active.content}
    </div>,
    document.body
  );
}

export function HoverTooltipProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveTooltip | null>(null);
  const [closing, setClosing] = useState(false);
  const activeRef = useRef<ActiveTooltip | null>(null);
  const showTimer = useRef<number | null>(null);
  const exitTimer = useRef<number | null>(null);
  const lastShownAt = useRef(0);

  const clearShowTimer = useCallback(() => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  }, []);

  const clearExitTimer = useCallback(() => {
    if (exitTimer.current !== null) {
      window.clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
  }, []);

  const showNow = useCallback(
    (tooltip: ActiveTooltip) => {
      clearExitTimer();
      activeRef.current = tooltip;
      lastShownAt.current = Date.now();
      setClosing(false);
      setActive(tooltip);
    },
    [clearExitTimer]
  );

  const dismissNow = useCallback(() => {
    clearShowTimer();
    clearExitTimer();
    activeRef.current = null;
    setClosing(false);
    setActive(null);
  }, [clearExitTimer, clearShowTimer]);

  const showTooltip = useCallback(
    (
      anchor: HTMLElement,
      content: ReactNode,
      options: HoverTooltipOptions = {},
      immediate = false
    ) => {
      if (content === null || content === undefined || content === false) return;
      clearShowTimer();

      const tooltip = { anchor, content, options };
      const warm =
        immediate ||
        activeRef.current !== null ||
        Date.now() - lastShownAt.current < WARM_WINDOW_MS;

      if (warm) {
        showNow(tooltip);
        return;
      }

      showTimer.current = window.setTimeout(() => {
        showTimer.current = null;
        showNow(tooltip);
      }, SHOW_DELAY_MS);
    },
    [clearShowTimer, showNow]
  );

  const hideTooltip = useCallback(
    (anchor?: HTMLElement) => {
      clearShowTimer();

      const current = activeRef.current;
      if (!current || (anchor && current.anchor !== anchor)) return;
      // A detached anchor never animates out — it simply goes.
      if (!current.anchor.isConnected) {
        dismissNow();
        return;
      }

      clearExitTimer();
      setClosing(true);
      exitTimer.current = window.setTimeout(() => {
        exitTimer.current = null;
        activeRef.current = null;
        setClosing(false);
        setActive(null);
      }, EXIT_MS);
    },
    [clearExitTimer, clearShowTimer, dismissNow]
  );

  useEffect(
    () => () => {
      clearShowTimer();
      clearExitTimer();
    },
    [clearShowTimer, clearExitTimer]
  );

  useEffect(() => {
    if (!active) return;

    window.addEventListener("scroll", dismissNow, true);
    window.addEventListener("resize", dismissNow);

    // The anchor can be unmounted while its tooltip is open — stepping to
    // another award year remounts the view the button sits in — and a node
    // that no longer exists never fires pointerleave, which left the bubble
    // stranded until the next scroll. Dismiss it as soon as the anchor goes.
    const observer = new MutationObserver(() => {
      if (!active.anchor.isConnected) dismissNow();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("scroll", dismissNow, true);
      window.removeEventListener("resize", dismissNow);
      observer.disconnect();
    };
  }, [active, dismissNow]);

  const controller = useMemo(
    () => ({ showTooltip, hideTooltip }),
    [showTooltip, hideTooltip]
  );

  return (
    <HoverTooltipContext.Provider value={controller}>
      {children}
      {active && <TooltipBubble active={active} closing={closing} />}
    </HoverTooltipContext.Provider>
  );
}

export function useHoverTooltip() {
  const controller = useContext(HoverTooltipContext);
  if (!controller) {
    throw new Error("useHoverTooltip must be used within HoverTooltipProvider");
  }

  const bindTooltip = useCallback(
    (content: ReactNode, options?: HoverTooltipOptions) => ({
      "aria-describedby": TOOLTIP_ID,
      onPointerEnter: (event: PointerEvent<HTMLElement>) => {
        controller.showTooltip(event.currentTarget, content, options);
      },
      onPointerLeave: (event: PointerEvent<HTMLElement>) => {
        controller.hideTooltip(event.currentTarget);
      },
      onFocus: (event: FocusEvent<HTMLElement>) => {
        // Keyboard focus only: a click that happens to focus a button already
        // showed (or explained) it, and shouldn't pop a label over the control.
        if (!event.currentTarget.matches(":focus-visible")) return;
        controller.showTooltip(event.currentTarget, content, options, true);
      },
      onBlur: (event: FocusEvent<HTMLElement>) => {
        controller.hideTooltip(event.currentTarget);
      },
    }),
    [controller]
  );

  const hideTooltip = useCallback(() => controller.hideTooltip(), [controller]);

  return {
    bindTooltip,
    hideTooltip,
  };
}

export function TooltipTitle({ children }: { children: ReactNode }) {
  return <div className="text-[13px] font-semibold leading-tight text-text">{children}</div>;
}

export function TooltipDetail({ children }: { children: ReactNode }) {
  return <div className="mt-0.5 text-[12px] leading-snug text-text-muted">{children}</div>;
}
