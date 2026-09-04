import { useCallback, useEffect, useState } from "react";
import { getVisibleEntryTypes } from "../lib/media-config";
import { ReviewLanding } from "../components/review/ReviewLanding";
import { Reel } from "../components/review/reel/Reel";
import { useReviewPageData } from "../components/review/useReviewPageData";

/**
 * Route shell.
 *
 * The page is two surfaces: the landing screen, which shows what is waiting
 * without asking anything first, and the reel, which plays it. Everything that
 * decides what a run contains lives in lib/review; everything that draws it
 * lives in components/review.
 */
export default function ReviewPage() {
  const data = useReviewPageData(getVisibleEntryTypes());
  const [startIndex, setStartIndex] = useState<number | null>(null);

  // Display type runs to 150px here. font-display: swap would otherwise show a
  // very visible Georgia flash on the first paint of the hero.
  useEffect(() => {
    void document.fonts?.load('400 60px "Instrument Serif"');
    void document.fonts?.load('italic 400 60px "Instrument Serif"');
  }, []);

  const handlePlay = useCallback(
    async (index: number) => {
      if (!data.reel || data.reel.chapters.length === 0) return;
      // Fetch the signature chapter's note before opening rather than during
      // playback: it lands in the context the reel is built from, so nothing
      // has to change underneath the viewer.
      await data.loadNote();
      setStartIndex(index);
    },
    [data],
  );

  return (
    <div style={{ animation: "fadeIn 0.5s ease-out" }}>
      <ReviewLanding data={data} onPlay={(index) => void handlePlay(index)} />

      {/* Guarded on a non-empty chapter list: mounting against an empty reel
          (which happens for a beat whenever the year's rows are refetching)
          would clamp the starting chapter to the first one and stay there. */}
      {startIndex !== null && data.ctx && data.reel && data.reel.chapters.length > 0 && (
        <Reel
          reel={data.reel}
          ctx={data.ctx}
          startIndex={startIndex}
          onExit={() => setStartIndex(null)}
        />
      )}
    </div>
  );
}
