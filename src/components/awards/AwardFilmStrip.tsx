import { useEffect, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { CoverImage } from "../CoverImage";
import { TooltipDetail, TooltipTitle, useHoverTooltip } from "../HoverTooltip";
import { cn } from "../../lib/utils_ui";

/** Minimal shape the strip needs — the page's CategoryWithWinner satisfies it. */
export interface FilmStripAward {
  id: number;
  name: string;
  winner: { name: string; image_url: string | null } | null;
}

interface AwardFilmStripProps {
  /** Awards in page order (already type-filtered by the caller). */
  items: FilmStripAward[];
  /** Category whose card is under the viewport focus line. */
  activeId: number | null;
  /** Click a frame to jump to its card. */
  onSelect: (id: number) => void;
}

/**
 * Vertical film strip of winner covers pinned to the right edge of the year
 * view. An amber pointer slides along the strip to the frame matching the card
 * in view; the pointer lives inside the strip's own scroll content so it stays
 * glued to its frame while the strip auto-scrolls to keep it visible.
 */
export function AwardFilmStrip({ items, activeId, onSelect }: AwardFilmStripProps) {
  const reduceMotion = useReducedMotion();
  const { bindTooltip } = useHoverTooltip();
  const stripRef = useRef<HTMLDivElement>(null);
  const frameRefs = useRef(new Map<number, HTMLElement>());
  const [needleY, setNeedleY] = useState(0);

  // offsetTop is measured against the strip's inner (relative) container, so
  // the pointer tracks content coordinates and rides along on strip scrolls.
  useEffect(() => {
    const frame = activeId != null ? frameRefs.current.get(activeId) : undefined;
    if (frame) setNeedleY(frame.offsetTop + frame.offsetHeight / 2);
  }, [activeId, items]);

  // Keep the active frame inside the strip's own scroll window.
  useEffect(() => {
    if (activeId == null) return;
    const strip = stripRef.current;
    const frame = frameRefs.current.get(activeId);
    if (!strip || !frame) return;
    const stripRect = strip.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    if (frameRect.top >= stripRect.top && frameRect.bottom <= stripRect.bottom) return;
    strip.scrollTo({
      top: frame.offsetTop + frame.offsetHeight / 2 - strip.clientHeight / 2,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [activeId, reduceMotion]);

  if (items.length === 0) return null;

  const pointerHidden = activeId == null || !items.some(item => item.id === activeId);

  return (
    <div
      ref={stripRef}
      className="scrollbar-none max-h-[calc(100vh-3rem)] overflow-x-hidden overflow-y-auto rounded-2xl border border-white/10 bg-black/50 py-4 shadow-2xl shadow-black/40"
    >
      <div className="relative flex flex-col items-center gap-2.5 px-5">
        {/* Pointer tabs — inside the scroll content so they ride with the film */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 z-10 transition-transform ease-out",
            pointerHidden && "opacity-0"
          )}
          style={{
            transform: `translateY(${needleY}px)`,
            transitionDuration: reduceMotion ? "0ms" : "300ms",
          }}
        >
          <div className="absolute inset-x-3 top-0 h-px -translate-y-1/2 bg-gradient-to-r from-amber-400/70 via-amber-300/50 to-amber-400/70" />
          <div className="absolute left-3 top-0 -translate-y-1/2 border-y-[5px] border-l-[7px] border-y-transparent border-l-amber-400 drop-shadow" />
          <div className="absolute right-3 top-0 -translate-y-1/2 border-y-[5px] border-r-[7px] border-y-transparent border-r-amber-400 drop-shadow" />
        </div>

        {items.map(item => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              ref={el => {
                if (el) frameRefs.current.set(item.id, el);
                else frameRefs.current.delete(item.id);
              }}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-label={`Jump to ${item.name}`}
              aria-current={isActive}
              {...bindTooltip(
                <>
                  <TooltipTitle>{item.name}</TooltipTitle>
                  <TooltipDetail>{item.winner ? item.winner.name : "No winner yet"}</TooltipDetail>
                </>,
                { width: "content" }
              )}
              className={cn(
                "relative block aspect-[2/3] w-[68px] shrink-0 overflow-hidden rounded-md border transition-all duration-200",
                isActive
                  ? "scale-[1.07] border-amber-400/60 ring-2 ring-amber-400/70"
                  : item.winner
                    ? "border-white/15 hover:scale-105 hover:border-amber-300/50"
                    : "border-dashed border-white/10 hover:border-amber-300/40"
              )}
            >
              {item.winner ? (
                <CoverImage
                  path={item.winner.image_url}
                  alt={item.winner.name}
                  variant="small"
                  priority="low"
                  containerClassName="h-full w-full"
                  imageClassName={cn("h-full w-full object-cover", !isActive && "opacity-75")}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-white/[0.03] text-gray-600">
                  <Trophy size={18} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
