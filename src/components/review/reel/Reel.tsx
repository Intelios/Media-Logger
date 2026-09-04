import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { CheckCircle2, FolderOpen } from "lucide-react";
import { useEscapeToClose } from "../../../lib/useEscapeToClose";
import { useFocusTrap } from "../../../lib/useFocusTrap";
import { prewarmImageCache } from "../../../lib/image-service";
import type { AssembledReel, ReviewContext } from "../../../lib/review-logic";
import { buildPosterData, revealPoster, saveReviewPoster } from "../../../lib/review/poster";
import { CHAPTER_RENDERERS } from "./chapters";
import { ReelChrome } from "./ReelChrome";
import { ReelStage } from "./ReelStage";
import { useReelPlayback } from "./useReelPlayback";

const CHAPTER_MS = 6000;

interface SaveState {
  status: "idle" | "saving" | "saved" | "error";
  path?: string;
  message?: string;
}

/**
 * The full-screen player.
 *
 * Sits at z-[100] where the old Presentation did, and unlike it participates
 * in the app's modal stacks: Escape closes through useEscapeToClose, focus is
 * trapped and restored, and a nested dialog can open over it safely.
 */
export function Reel({
  reel,
  ctx,
  startIndex,
  onExit,
}: {
  reel: AssembledReel;
  ctx: ReviewContext;
  startIndex: number;
  onExit: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const [save, setSave] = useState<SaveState>({ status: "idle" });

  const chapters = reel.chapters;

  const playback = useReelPlayback({
    count: chapters.length,
    startIndex: Math.min(startIndex, Math.max(chapters.length - 1, 0)),
    durationMs: CHAPTER_MS,
    // Motion-sensitive viewers get a reel that waits for them.
    autoAdvance: !reduceMotion,
    onExit,
  });

  useEscapeToClose(true, onExit);
  useFocusTrap(true, rootRef);

  // Warm every backdrop's hero derivative once, natively, rather than letting
  // each cut wait on generation. Thirteen is well inside the batch guidance.
  useEffect(() => {
    const paths = chapters
      .map((chapter) => chapter.backdrop)
      .filter((path): path is string => typeof path === "string" && path.length > 0);
    if (paths.length === 0) return;
    void prewarmImageCache(paths.map((imagePath) => ({ imagePath, variant: "hero" }))).catch(
      () => {
        /* best effort — CoverImage still generates on demand */
      },
    );
  }, [chapters]);

  const shownIndex = playback.index;
  const current = chapters[shownIndex];

  // Six seconds covers two cuts, so warm N+1 and N+2. Deduped: the backdrop
  // picker reuses a cover once a chapter's own pool is exhausted, so adjacent
  // chapters legitimately share one — and two nodes keyed by the same path
  // would collide.
  const preload = useMemo(
    () => [
      ...new Set(
        [chapters[shownIndex + 1]?.backdrop, chapters[shownIndex + 2]?.backdrop].filter(
          (path): path is string => typeof path === "string" && path.length > 0,
        ),
      ),
    ],
    [chapters, shownIndex],
  );

  const handleSavePoster = async () => {
    setSave({ status: "saving" });
    // The save dialog blurs the window, which would resume playback the moment
    // it paints over us; hold the clock explicitly across the whole exchange.
    playback.setPause("export", true);
    try {
      const result = await saveReviewPoster(buildPosterData(ctx));
      if (result.ok) setSave({ status: "saved", path: result.path });
      else if (result.reason === "cancelled") setSave({ status: "idle" });
      else setSave({ status: "error", message: result.message });
    } finally {
      playback.setPause("export", false);
    }
  };

  useEffect(() => {
    if (save.status !== "saved" && save.status !== "error") return;
    const timer = window.setTimeout(() => setSave({ status: "idle" }), 6000);
    return () => window.clearTimeout(timer);
  }, [save.status]);

  if (chapters.length === 0 || !current) return null;

  const renderer = CHAPTER_RENDERERS[current.id];

  return createPortal(
    <div
      ref={rootRef}
      // `isolate` keeps the grain's blend inside this overlay: the macOS window
      // is transparent, so without it the blend reaches the desktop behind.
      className="review-surface fixed inset-0 z-[100] isolate overflow-hidden bg-[#08080A]"
      role="dialog"
      aria-modal="true"
      aria-label={`${ctx.period.label} in review`}
    >
      <ReelStage
        backdrop={current.backdrop}
        preload={preload}
        reduceMotion={reduceMotion}
        stageHandlers={playback.stageHandlers}
      >
        <div
          key={current.id}
          className={reduceMotion ? "w-full" : "review-fade-up w-full"}
          style={reduceMotion ? undefined : { animationDelay: "60ms" }}
        >
          {renderer({
            data: current.data as never,
            ctx,
            onSavePoster: () => void handleSavePoster(),
            saving: save.status === "saving",
          })}
        </div>
      </ReelStage>

      <ReelChrome
        chapters={chapters}
        playback={playback}
        periodLabel={ctx.period.label}
        saving={save.status === "saving"}
        onSavePoster={() => void handleSavePoster()}
        onExit={onExit}
      />

      {(save.status === "saved" || save.status === "error") && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center">
          <div
            className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/[0.14] bg-black/80 py-2 pl-4 pr-2 backdrop-blur-md"
            role="status"
          >
            {save.status === "saved" ? (
              <>
                <CheckCircle2 size={16} style={{ color: "#34d399" }} />
                <span className="text-[13px] font-medium text-white/90">Poster saved</span>
                <button
                  type="button"
                  onClick={() => void revealPoster(save.path)}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
                >
                  <FolderOpen size={14} />
                  Show in Finder
                </button>
              </>
            ) : (
              <span className="px-2 text-[13px] font-medium text-white/90">
                {save.message ?? "Couldn’t save the poster."}
              </span>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
