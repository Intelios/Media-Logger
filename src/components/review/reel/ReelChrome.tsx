import { ChevronRight, Download, Pause, Play, X } from "lucide-react";
import { cn } from "../../../lib/utils_ui";
import type { AssembledChapter } from "../../../lib/review-logic";
import type { ReelPlayback } from "./useReelPlayback";

/**
 * Chrome around the reel: the story timer, the exit, and the poster export.
 *
 * Segments are real buttons so chapter-jumping is reachable from the keyboard
 * inside the focus trap; the visible bar is 3px but the hit target is 44.
 */
export function ReelChrome({
  chapters,
  playback,
  periodLabel,
  saving,
  onSavePoster,
  onExit,
}: {
  chapters: AssembledChapter[];
  playback: ReelPlayback;
  periodLabel: string;
  saving: boolean;
  onSavePoster: () => void;
  onExit: () => void;
}) {
  const { index, stickyPaused, goTo, toggleSticky, setActiveSegment } = playback;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-4 px-14 pt-4">
        <div className="pointer-events-auto flex items-center gap-[5px]">
          {chapters.map((chapter, position) => {
            const done = position < index;
            const active = position === index;
            return (
              <button
                key={chapter.id}
                type="button"
                onClick={() => goTo(position)}
                aria-label={`Chapter ${position + 1} of ${chapters.length}: ${chapter.spec.label}`}
                aria-current={active ? "step" : undefined}
                // 3px of paint, 44px of target. The focus ring is moved onto
                // the visible bar so keyboard focus doesn't draw a 44px box.
                className="group flex h-11 flex-1 items-center outline-none"
              >
                <span className="relative block h-[3px] w-full overflow-hidden rounded-sm bg-white/[0.22] ring-offset-2 ring-offset-[#08080A] group-focus-visible:ring-2 group-focus-visible:ring-white/70">
                  <span
                    ref={active ? setActiveSegment : undefined}
                    className={cn(
                      "absolute inset-0 block rounded-sm bg-white",
                      done && "!scale-x-100",
                    )}
                    style={{
                      transform: done ? "scaleX(1)" : "scaleX(0)",
                      transformOrigin: "left center",
                    }}
                  />
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <div className="pointer-events-auto flex items-center gap-3.5">
            <span
              className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-white/[0.14] bg-white/[0.10]"
              aria-hidden
            >
              <Play size={13} className="fill-white text-white" />
            </span>
            <span
              className="text-xs font-semibold uppercase text-white/60"
              style={{ letterSpacing: "0.22em" }}
            >
              {periodLabel} &middot; The Reel
            </span>
          </div>

          <div className="pointer-events-auto flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleSticky}
              aria-pressed={stickyPaused}
              className="flex h-11 items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.08] px-4 text-[13px] font-semibold text-white/85 transition-colors hover:bg-white/[0.16]"
            >
              {stickyPaused ? <Play size={15} className="fill-current" /> : <Pause size={15} />}
              {stickyPaused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={onSavePoster}
              disabled={saving}
              className="flex h-11 items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.08] px-4 text-[13px] font-semibold text-white/85 transition-colors hover:bg-white/[0.16] disabled:opacity-60"
            >
              <Download size={15} />
              {saving ? "Saving…" : "Save poster"}
            </button>
            <button
              type="button"
              onClick={onExit}
              aria-label="Close the reel"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.08] text-white transition-colors hover:bg-white/[0.16]"
            >
              <X size={17} />
            </button>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between px-14 pb-8">
        <div className="flex items-center gap-5">
          <span className="text-xs font-medium text-white/40" style={{ letterSpacing: "0.04em" }}>
            Hold to pause
          </span>
          <span
            className="flex items-center gap-2 text-xs font-medium text-white/40"
            style={{ letterSpacing: "0.04em" }}
          >
            <ChevronRight size={14} />
            Click right to skip
          </span>
          <span className="text-xs font-medium text-white/40" style={{ letterSpacing: "0.04em" }}>
            Space to {stickyPaused ? "resume" : "pause"}
          </span>
        </div>
        <span
          className="text-xs font-semibold text-white/40"
          style={{ letterSpacing: "0.14em" }}
        >
          {String(index + 1).padStart(2, "0")} / {String(chapters.length).padStart(2, "0")}
        </span>
      </div>
    </>
  );
}
