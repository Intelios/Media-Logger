import { useState } from "react";
import { Play, SlidersHorizontal } from "lucide-react";
import { ChapterTileGrid } from "./ChapterTileGrid";
import { CustomiseSheet } from "./CustomiseSheet";
import { ReplayColumn } from "./ReplayColumn";
import { ReviewHero } from "./ReviewHero";
import { ReviewCard } from "./review-ui";
import type { ReviewPageData } from "./useReviewPageData";
import { ADULT_ENTRY_TYPES, ENTRY_TYPES, useAdultMediaEnabled } from "../../lib/media-config";
import { cn } from "../../lib/utils_ui";

/**
 * The Review page as it now opens: the run is already built and waiting.
 *
 * The old page put four filter panels between the user and any content, which
 * is why nobody used it. Filters still exist — behind Customise — but nothing
 * has to be answered before something appears.
 */
export function ReviewLanding({
  data,
  onPlay,
}: {
  data: ReviewPageData;
  onPlay: (startIndex: number) => void;
}) {
  const [customiseOpen, setCustomiseOpen] = useState(false);
  const { ctx, reel, years, year, month, typeFilter, monthCounts, loading } = data;
  const adultEnabled = useAdultMediaEnabled();
  const totalAvailableTypes = adultEnabled
    ? ENTRY_TYPES.length
    : ENTRY_TYPES.filter((t) => !ADULT_ENTRY_TYPES.includes(t)).length;
  const isFiltered = typeFilter.length > 0 && typeFilter.length < totalAvailableTypes;

  const chapterCount = reel?.chapters.length ?? 0;
  const periodNoun = month != null ? "month" : "year";

  return (
    <div className="review-surface mx-auto flex max-w-[1200px] flex-col gap-[22px] pb-12">
      <header className="flex items-center justify-between gap-4 pt-6">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-[14px]"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 20%, transparent), color-mix(in srgb, var(--color-secondary) 10%, transparent))",
              boxShadow: "0 4px 12px color-mix(in srgb, var(--color-primary) 10%, transparent)",
              color: "var(--color-primary)",
            }}
          >
            <Play size={22} className="fill-current" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h2
              className="m-0 text-[30px] font-bold leading-[1.2] text-text"
              style={{ letterSpacing: "-0.02em" }}
            >
              Review
            </h2>
            <p className="m-0 text-[15px] text-text-muted">
              {chapterCount > 0
                ? `${chapterCount} ${chapterCount === 1 ? "chapter" : "chapters"}, written from what you actually finished.`
                : "Written from what you actually finished."}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCustomiseOpen(true)}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-[13px] font-medium transition-colors",
            isFiltered
              ? "border-primary/40 bg-primary/10 text-white hover:bg-primary/20"
              : "text-text-muted hover:bg-white/[0.08] hover:text-text",
          )}
          style={
            isFiltered
              ? undefined
              : { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.10)" }
          }
        >
          <SlidersHorizontal size={15} className={isFiltered ? "text-primary" : undefined} />
          <span>Customise</span>
          {isFiltered && (
            <span
              className="flex h-5 items-center rounded-full bg-primary/25 px-1.5 text-[11px] font-bold text-primary"
            >
              {typeFilter.length}
            </span>
          )}
        </button>
      </header>

      {loading && !ctx ? (
        <ReviewCard className="flex h-[316px] items-center justify-center">
          <span className="text-sm text-text-muted">Building your review…</span>
        </ReviewCard>
      ) : !ctx || ctx.basics.total === 0 ? (
        <ReviewCard className="flex h-[316px] flex-col items-center justify-center gap-2 px-8 text-center">
          <span className="text-lg font-semibold text-text">Nothing here yet</span>
          <p className="m-0 max-w-md text-sm text-text-muted">
            {years.length === 0
              ? "Log a completion with a year on it and your first review will build itself."
              : "No entries match this selection. Try a different year, or widen the media types under Customise."}
          </p>
        </ReviewCard>
      ) : (
        <ReviewHero ctx={ctx} chapterCount={chapterCount} years={years} onPlay={() => onPlay(0)} />
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ChapterTileGrid
          tiles={reel?.tiles ?? []}
          periodNoun={periodNoun}
          onPlayFrom={onPlay}
        />
        <ReplayColumn
          years={years}
          activeYear={year}
          activeMonth={month}
          monthCounts={monthCounts}
          onSelectYear={data.setYear}
          onSelectMonth={data.setMonth}
        />
      </div>

      <CustomiseSheet
        open={customiseOpen}
        onClose={() => setCustomiseOpen(false)}
        typeFilter={typeFilter}
        onSelectTypes={data.setTypeFilter}
      />
    </div>
  );
}
