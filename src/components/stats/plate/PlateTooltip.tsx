import { useCallback, useEffect, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface HoverState {
  content: ReactNode;
  rect: DOMRect;
}

const TOOLTIP_WIDTH = 210;
const TOOLTIP_GAP = 8;
const ESTIMATED_HEIGHT = 56;

function TooltipBubble({ content, rect }: HoverState) {
  const left = Math.max(
    TOOLTIP_GAP,
    Math.min(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_GAP)
  );
  // Flip below the anchor when there is not enough headroom above it.
  const placeBelow = rect.top < ESTIMATED_HEIGHT + TOOLTIP_GAP;
  const top = placeBelow ? rect.bottom + TOOLTIP_GAP : rect.top - TOOLTIP_GAP;

  return createPortal(
    <div
      role="tooltip"
      className="glass-tooltip pointer-events-none fixed z-[9999] rounded-xl px-3 py-2"
      style={{
        top,
        left,
        width: TOOLTIP_WIDTH,
        transform: placeBelow ? undefined : "translateY(-100%)",
      }}
    >
      {content}
    </div>,
    document.body
  );
}

/**
 * Shared hover tooltip for the plate. Native `title` is unusable for data
 * inspection — it waits about a second, cannot be styled, and renders outside
 * the app's visual language. One portal is shared across every anchor bound by
 * a single hook instance, so a 53-cell strip does not create 53 portals.
 */
export function useHoverTooltip() {
  const [hovered, setHovered] = useState<HoverState | null>(null);

  const hideTooltip = useCallback(() => setHovered(null), []);

  // The anchor moves with any scroll or resize, and re-positioning would point
  // at whatever slid under the cursor instead. Hide rather than follow.
  useEffect(() => {
    if (!hovered) {
      return;
    }

    const handle = () => setHovered(null);
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);

    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [hovered]);

  const bindTooltip = useCallback(
    (content: ReactNode) => ({
      onPointerEnter: (event: PointerEvent<HTMLElement>) => {
        if (content === null || content === undefined || content === false) {
          return;
        }

        setHovered({ content, rect: event.currentTarget.getBoundingClientRect() });
      },
      onPointerLeave: () => setHovered(null),
    }),
    []
  );

  return {
    bindTooltip,
    hideTooltip,
    tooltip: hovered ? <TooltipBubble {...hovered} /> : null,
  };
}

export function TooltipTitle({ children }: { children: ReactNode }) {
  return <div className="text-[13px] font-semibold leading-tight text-text">{children}</div>;
}

export function TooltipDetail({ children }: { children: ReactNode }) {
  return <div className="mt-0.5 text-[12px] leading-snug text-text-muted">{children}</div>;
}
