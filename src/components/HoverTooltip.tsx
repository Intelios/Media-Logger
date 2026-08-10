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
  showTooltip: (anchor: HTMLElement, content: ReactNode, options?: HoverTooltipOptions) => void;
  hideTooltip: (anchor?: HTMLElement) => void;
}

interface TooltipPosition {
  left: number;
  top: number;
}

const HoverTooltipContext = createContext<HoverTooltipController | null>(null);

function TooltipBubble({ active }: { active: ActiveTooltip }) {
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

    setPosition({ left, top });
  }, [active]);

  return createPortal(
    <div
      id={TOOLTIP_ID}
      ref={tooltipRef}
      role="tooltip"
      className={`glass-tooltip pointer-events-none fixed z-[9999] ${active.options.className ?? "rounded-xl px-3 py-2"}`}
      style={{
        ...active.options.style,
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        width: width === "content" ? "max-content" : width,
        maxWidth: `calc(100vw - ${TOOLTIP_GAP * 2}px)`,
        visibility: position ? "visible" : "hidden",
      }}
    >
      {active.content}
    </div>,
    document.body
  );
}

export function HoverTooltipProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveTooltip | null>(null);

  const showTooltip = useCallback((anchor: HTMLElement, content: ReactNode, options: HoverTooltipOptions = {}) => {
    if (content === null || content === undefined || content === false) return;
    setActive({ anchor, content, options });
  }, []);

  const hideTooltip = useCallback((anchor?: HTMLElement) => {
    setActive((current) => {
      if (!current || (anchor && current.anchor !== anchor)) return current;
      return null;
    });
  }, []);

  useEffect(() => {
    if (!active) return;

    const hideActiveTooltip = () => hideTooltip(active.anchor);
    window.addEventListener("scroll", hideActiveTooltip, true);
    window.addEventListener("resize", hideActiveTooltip);
    return () => {
      window.removeEventListener("scroll", hideActiveTooltip, true);
      window.removeEventListener("resize", hideActiveTooltip);
    };
  }, [active, hideTooltip]);

  const controller = useMemo(
    () => ({ showTooltip, hideTooltip }),
    [showTooltip, hideTooltip]
  );

  return (
    <HoverTooltipContext.Provider value={controller}>
      {children}
      {active && <TooltipBubble active={active} />}
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
        controller.showTooltip(event.currentTarget, content, options);
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
