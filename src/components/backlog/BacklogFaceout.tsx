import { useRef } from "react";
import {
  Play, MoreVertical, Film, Tv, MonitorPlay, Gamepad2,
  BookOpen, Disc3, Heart, Monitor, Tag,
} from "lucide-react";
import { CoverImage } from "../CoverImage";
import { useHoverTooltip } from "../HoverTooltip";
import { cn } from "../../lib/utils_ui";
import { BacklogTooltipContent } from "./BacklogTooltipContent";
import { FACEOUT_WIDTH, ITEM_HEIGHT, getSpineGradient } from "./backlog-visuals";
import type { BacklogItem } from "../../lib/db";
import type { MenuAnchor } from "./BacklogItemMenu";

const CLICK_SLOP = 8;

const getTypeIcon = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes("album")) return <Disc3 size={30} />;
  if (t.includes("game")) return <Gamepad2 size={30} />;
  if (t.includes("anime")) return <MonitorPlay size={30} />;
  if (t.includes("k-drama")) return <Tv size={30} />;
  if (t.includes("movie")) return <Film size={30} />;
  if (t.includes("show")) return <Tv size={30} />;
  if (t.includes("book")) return <BookOpen size={30} />;
  if (t.includes("jav") || t.includes("hentai")) return <Heart size={30} />;
  if (t.includes("visual novel")) return <Monitor size={30} />;
  return <Tag size={30} />;
};

interface BacklogFaceoutProps {
  item: BacklogItem;
  index: number;
  dimmed: boolean;
  suppressTooltip: boolean;
  /** Rendered inside a DragOverlay: no entrance animation, no hover, no tooltip. */
  preview?: boolean;
  /** Item just landed here via a cross-section drop: use the settle animation
   *  instead of the standard entrance. */
  land?: boolean;
  onOpenMenu: (anchor: MenuAnchor) => void;
}

// The case you pulled off the shelf and left on the desk: turned face-out,
// tilted, lit, and the one place on this page where cover art is shown big.
export function BacklogFaceout({
  item,
  index,
  dimmed,
  suppressTooltip,
  preview = false,
  land = false,
  onOpenMenu,
}: BacklogFaceoutProps) {
  const { bindTooltip, hideTooltip } = useHoverTooltip();
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const tooltipProps = suppressTooltip || preview
    ? {}
    : bindTooltip(<BacklogTooltipContent item={item} />, { width: 220 });

  const handlePointerDown = (event: React.PointerEvent) => {
    // The pointer is captured for the whole drag, so the tooltip opened on
    // hover would never see pointerleave — close it on press instead.
    hideTooltip();
    pointerStart.current = { x: event.clientX, y: event.clientY };
  };

  const wasDrag = (event: React.MouseEvent) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return false;
    return Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP;
  };

  const openMenu = (event: React.MouseEvent, anchorEl: HTMLElement) => {
    if (wasDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    hideTooltip();
    onOpenMenu({ item, rect: anchorEl.getBoundingClientRect() });
  };

  return (
    <div
      // No `group` in preview: the cursor sits over the overlay for the whole
      // drag, and `.group:hover > .backlog-faceout` would outrank the preview
      // transform.
      className={cn(!preview && (land ? "group backlog-land" : "group backlog-faceout-enter"))}
      style={preview ? undefined : land ? undefined : { animationDelay: `${Math.min(index * 60, 240)}ms` }}
      onPointerDown={handlePointerDown}
      onContextMenu={(event) => openMenu(event, event.currentTarget)}
    >
      <div
        style={{ width: FACEOUT_WIDTH, height: ITEM_HEIGHT }}
        className={cn(
          "backlog-faceout relative overflow-hidden rounded-l-[3px] rounded-r-md transition-[transform,opacity] duration-300 ease-out",
          preview && "backlog-drag-preview",
          dimmed && "opacity-25 saturate-50"
        )}
        {...tooltipProps}
      >
        {item.image_url ? (
          <CoverImage
            path={item.image_url}
            variant="small"
            alt={item.name}
            sizes="132px"
            containerClassName="absolute inset-0"
            imageClassName="h-full w-full object-cover"
          />
        ) : (
          <div
            className={cn("flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br", getSpineGradient(item.entry_type))}
          >
            <div className="text-white/45">{getTypeIcon(item.entry_type)}</div>
            <p className="line-clamp-3 px-3 text-center text-[11px] font-semibold leading-tight text-white/70">
              {item.name}
            </p>
          </div>
        )}

        {/* Inner case-edge shading, then the dark hinge strip down the left. */}
        <div aria-hidden className="backlog-faceout-inner absolute inset-0 rounded-r-md" />
        <div aria-hidden className="absolute inset-y-0 left-0 w-[7px] bg-black/35" />

        <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 shadow-[0_0_16px_rgba(245,165,36,0.55)]">
          <Play size={10} className="ml-px text-amber-950" fill="currentColor" />
        </div>

        <button
          type="button"
          aria-label={`Actions for ${item.name}`}
          onClick={(event) => openMenu(event, event.currentTarget)}
          className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/75 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <MoreVertical size={13} className="text-white" />
        </button>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-2.5 pb-2.5 pt-7">
          <p className="line-clamp-2 text-[12px] font-semibold leading-tight text-white">{item.name}</p>
        </div>
      </div>
    </div>
  );
}
