import { useRef } from "react";
import { formatDurationShort, getDaysSince } from "../../lib/dates";
import { useHoverTooltip } from "../HoverTooltip";
import { cn } from "../../lib/utils_ui";
import { CoverImage } from "../CoverImage";
import { BacklogTooltipContent } from "./BacklogTooltipContent";
import {
  AGE_HOT_DAYS, ITEM_HEIGHT, getShelfItemWidth, getSpineGradient,
} from "./backlog-visuals";
import type { BacklogDensity } from "../../lib/backlog/density";
import type { CoverPalette } from "../../lib/cover-palette";
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
  /** How much of the item's artwork to show. */
  density: BacklogDensity;
  /** Colours extracted from this item's cover, or null while none are known. */
  palette: CoverPalette | null;
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

// One case standing on the shelf. Its colour comes from its own cover art
// wherever the image service has been able to sample one, and falls back to the
// media-type palette otherwise, so a shelf reads as a rack of distinct objects
// rather than a bar chart of type colours.
export function BacklogSpine({
  item,
  rank,
  index,
  dimmed,
  density,
  palette,
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

  const faceOut = density === "covers";
  const showArt = density !== "spines" && Boolean(item.image_url);

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

  const rankChip = rank !== null && (
    <span className="backlog-spine-rank relative rounded-[3px] bg-black/45 px-1 text-[9px] font-semibold leading-[1.4] tabular-nums text-white/95">
      {rank}
    </span>
  );

  const age = ageLabel && (
    <span
      className={cn(
        "relative text-[8px] font-medium leading-none tabular-nums",
        faceOut ? "" : "border-t pt-1",
        ageIsHot
          ? cn("text-rose-200", !faceOut && "border-rose-300/50")
          : cn("text-white/65", !faceOut && "border-white/20")
      )}
    >
      {ageLabel}
    </span>
  );

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
        style={{ width: getShelfItemWidth(density), height: ITEM_HEIGHT }}
        className={cn(
          "backlog-spine relative overflow-hidden rounded-l-[2px] rounded-r-[3px]",
          "bg-gradient-to-br text-left transition-[transform,opacity] duration-200 ease-out",
          faceOut ? "block" : "flex flex-col items-center justify-between px-0 pb-[7px] pt-2",
          !preview && "group-hover:-translate-y-4 focus-visible:-translate-y-4",
          preview && "backlog-drag-preview",
          // The type gradient is the floor, not the finish: it shows through
          // until (or unless) the cover's own colours arrive.
          getSpineGradient(item.entry_type),
          wrapped && "backlog-spine-wrapped",
          dimmed && "opacity-25 saturate-50"
        )}
        {...tooltipProps}
      >
        {/* The extracted colour, cross-faded in over the type gradient so a
            palette landing after first paint doesn't snap the whole shelf. */}
        <span
          aria-hidden
          className="backlog-spine-tint"
          style={
            palette
              ? {
                  opacity: 1,
                  backgroundImage: `linear-gradient(to bottom right, ${palette.shadow}, ${palette.base})`,
                }
              : undefined
          }
        />

        {showArt && (
          <CoverImage
            path={item.image_url}
            variant="small"
            alt=""
            aria-hidden
            sizes={faceOut ? "124px" : "34px"}
            priority="low"
            showSkeleton={false}
            containerClassName={cn(
              "backlog-spine-art absolute inset-0",
              faceOut && "backlog-spine-art-faceout"
            )}
            imageClassName="h-full w-full object-cover"
          />
        )}

        {/* Rounded page-edge highlight down the hinge side. */}
        <span aria-hidden className="backlog-spine-hinge" />

        {faceOut ? (
          <span className="relative flex h-full w-full flex-col justify-between">
            <span className="flex px-2 pt-2">{rankChip}</span>
            <span className="backlog-spine-caption flex flex-col gap-1 px-2.5 pb-2.5">
              <span className="line-clamp-2 text-[12px] font-semibold leading-tight text-white">
                {item.name}
              </span>
              {age}
            </span>
          </span>
        ) : (
          <>
            {rankChip || <span aria-hidden className="relative h-[11px]" />}
            <span className="backlog-spine-title relative">{item.name}</span>
            {age || <span aria-hidden className="relative h-2.5" />}
          </>
        )}
      </button>
    </div>
  );
}
