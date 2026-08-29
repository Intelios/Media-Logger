import { useRef } from "react";
import { formatDurationShort, getDaysSince } from "../../lib/dates";
import { useHoverTooltip } from "../HoverTooltip";
import { cn } from "../../lib/utils_ui";
import { BacklogTooltipContent } from "./BacklogTooltipContent";
import { AGE_HOT_DAYS, ITEM_HEIGHT, SPINE_WIDTH, getSpineGradient } from "./backlog-visuals";
import type { BacklogItem } from "../../lib/db";
import type { MenuAnchor } from "./BacklogItemMenu";

/** Matches the PointerSensor activation distance, so a drag never opens a menu. */
const CLICK_SLOP = 8;

interface BacklogSpineProps {
  item: BacklogItem;
  /** 1-based queue position. Null for unreleased items, which aren't ranked. */
  rank: number | null;
  /** Entrance stagger index within its section. */
  index: number;
  /** A type filter is active and this item doesn't match. */
  dimmed: boolean;
  /** Shrink-wrapped treatment for items that aren't out yet. */
  wrapped?: boolean;
  suppressTooltip: boolean;
  /** Rendered inside a DragOverlay: no entrance animation, no hover, no tooltip. */
  preview?: boolean;
  /** Item just landed here via a cross-section drop: use the settle animation
   *  instead of the standard entrance. */
  land?: boolean;
  onOpenMenu: (anchor: MenuAnchor) => void;
}

// One case standing on the shelf, seen edge-on. A spine needs no cover art to
// look finished — a colour, a title in vertical type and a couple of printed
// facts is exactly what the real object carries.
export function BacklogSpine({
  item,
  rank,
  index,
  dimmed,
  wrapped = false,
  suppressTooltip,
  preview = false,
  land = false,
  onOpenMenu,
}: BacklogSpineProps) {
  const { bindTooltip, hideTooltip } = useHoverTooltip();
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const daysWaiting = wrapped ? null : getDaysSince(item.added_date);
  const ageLabel = formatDurationShort(daysWaiting);
  const ageIsHot = daysWaiting !== null && daysWaiting >= AGE_HOT_DAYS;

  const tooltipProps = suppressTooltip || preview
    ? {}
    : bindTooltip(<BacklogTooltipContent item={item} />, { width: 220 });

  // dnd-kit owns pointer events on the wrapper, so the click that reaches us
  // after a drag has to be filtered out by distance rather than by a flag.
  const handlePointerDown = (event: React.PointerEvent) => {
    // The pointer is captured for the whole drag, so the tooltip opened on
    // hover would never see pointerleave — close it on press instead.
    hideTooltip();
    pointerStart.current = { x: event.clientX, y: event.clientY };
  };

  const openMenu = (event: React.MouseEvent) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (start) {
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved > CLICK_SLOP) return;
    }
    event.preventDefault();
    event.stopPropagation();
    hideTooltip();
    onOpenMenu({ item, rect: event.currentTarget.getBoundingClientRect() });
  };

  return (
    <div
      className={cn(!preview && (land ? "group backlog-land" : "group backlog-spine-enter"))}
      style={preview ? undefined : land ? undefined : { animationDelay: `${Math.min(index * 22, 320)}ms` }}
    >
      <button
        type="button"
        aria-label={`${item.name} — ${item.entry_type}. Open actions.`}
        onPointerDown={handlePointerDown}
        onClick={openMenu}
        onContextMenu={openMenu}
        style={{ width: SPINE_WIDTH, height: ITEM_HEIGHT }}
        className={cn(
          "backlog-spine relative flex flex-col items-center justify-between rounded-l-[2px] rounded-r-[3px]",
          "bg-gradient-to-br px-0 pb-[7px] pt-2 text-left transition-[transform,opacity] duration-200 ease-out",
          !preview && "group-hover:-translate-y-4 focus-visible:-translate-y-4",
          preview && "backlog-drag-preview",
          getSpineGradient(item.entry_type),
          wrapped && "backlog-spine-wrapped",
          dimmed && "opacity-25 saturate-50"
        )}
        {...tooltipProps}
      >
        {/* Rounded page-edge highlight down the hinge side. */}
        <span aria-hidden className="backlog-spine-hinge" />

        {rank !== null ? (
          <span className="relative rounded-[3px] bg-black/35 px-1 text-[9px] font-semibold leading-[1.4] tabular-nums text-white/95">
            {rank}
          </span>
        ) : (
          <span aria-hidden className="relative h-[11px]" />
        )}

        <span className="backlog-spine-title relative">{item.name}</span>

        {ageLabel ? (
          <span
            className={cn(
              "relative border-t pt-1 text-[8px] font-medium leading-none tabular-nums",
              ageIsHot ? "border-rose-300/50 text-rose-200" : "border-white/20 text-white/65"
            )}
          >
            {ageLabel}
          </span>
        ) : (
          <span aria-hidden className="relative h-2.5" />
        )}
      </button>
    </div>
  );
}
