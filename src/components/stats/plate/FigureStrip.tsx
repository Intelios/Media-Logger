import { cn } from "../../../lib/utils_ui";
import type { FullStats } from "../../../lib/stats-logic";
import { PLATE_FIGURE_DEFINITIONS, type PlateFigureId } from "./plate-config";
import { ACCENT_CLASSES } from "./plate-ui";
import type { StatsRange } from "./plate-data";

interface FigureStripProps {
  stats: FullStats;
  comparisonStats: FullStats | null;
  genreCount: number;
  comparisonGenreCount: number | null;
  figures: PlateFigureId[];
  range: StatsRange | null;
  onPerfectClick: () => void;
  onThisMonthClick: () => void;
}

interface ResolvedFigure {
  id: PlateFigureId;
  label: string;
  display: string;
  delta: number | null;
  precision: number;
  onClick?: () => void;
}

// Whole calendar months touched by the range, so "per month" reads as a rate
// rather than a fraction. A range inside one month counts as one month.
function monthsSpanned(range: StatsRange): number {
  const fromYear = Number(range.from.slice(0, 4));
  const fromMonth = Number(range.from.slice(5, 7));
  const toYear = Number(range.to.slice(0, 4));
  const toMonth = Number(range.to.slice(5, 7));

  const span = (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
  return Math.max(1, span);
}

function formatDelta(delta: number, precision: number): string {
  const rounded = Number(delta.toFixed(precision));
  if (rounded === 0) {
    return "±0";
  }

  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(precision)}`;
}

export function FigureStrip({
  stats,
  comparisonStats,
  genreCount,
  comparisonGenreCount,
  figures,
  range,
  onPerfectClick,
  onThisMonthClick,
}: FigureStripProps) {
  const resolve = (id: PlateFigureId): ResolvedFigure => {
    const label = PLATE_FIGURE_DEFINITIONS[id].label;

    switch (id) {
      case "total":
        return {
          id,
          label,
          display: String(stats.total),
          delta: comparisonStats ? stats.total - comparisonStats.total : null,
          precision: 0,
        };
      case "average":
        return {
          id,
          label,
          display: stats.average_score.toFixed(1),
          delta: comparisonStats ? stats.average_score - comparisonStats.average_score : null,
          precision: 1,
        };
      case "rewatches":
        return {
          id,
          label,
          display: String(stats.rewatch_count),
          delta: comparisonStats ? stats.rewatch_count - comparisonStats.rewatch_count : null,
          precision: 0,
        };
      case "perfect":
        return {
          id,
          label,
          display: String(stats.perfectTenCount),
          delta: comparisonStats ? stats.perfectTenCount - comparisonStats.perfectTenCount : null,
          precision: 0,
          onClick: stats.perfectTenCount > 0 ? onPerfectClick : undefined,
        };
      case "this-month": {
        // "This month" is a right-now figure and would be meaningless against a
        // selection, so a brushed range turns it into a rate for that selection.
        if (range) {
          const perMonth = stats.total / monthsSpanned(range);
          const comparisonPerMonth = comparisonStats ? comparisonStats.total / monthsSpanned(range) : null;

          return {
            id,
            label: "Per month",
            display: perMonth.toFixed(1),
            delta: comparisonPerMonth === null ? null : perMonth - comparisonPerMonth,
            precision: 1,
          };
        }

        return {
          id,
          label,
          display: String(stats.entriesThisMonth),
          delta: null,
          precision: 0,
          onClick: stats.entriesThisMonth > 0 ? onThisMonthClick : undefined,
        };
      }
      case "genre-count":
        return {
          id,
          label,
          display: String(genreCount),
          delta: comparisonGenreCount === null ? null : genreCount - comparisonGenreCount,
          precision: 0,
        };
    }
  };

  const resolved = figures.map(resolve);

  if (resolved.length === 0) {
    return null;
  }

  return (
    <div className="flex shrink-0 items-stretch rounded-xl border border-white/10 bg-white/[0.03] px-1 py-2">
      {resolved.map((figure, index) => {
        const accent = PLATE_FIGURE_DEFINITIONS[figure.id].accent;
        const isInteractive = Boolean(figure.onClick);

        return (
          <div
            key={figure.id}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center px-2",
              index < resolved.length - 1 && "border-r border-white/10"
            )}
          >
            <button
              type="button"
              disabled={!isInteractive}
              onClick={figure.onClick}
              className={cn(
                "flex min-w-0 flex-col items-center gap-px rounded-lg px-2 py-0.5 transition-colors",
                isInteractive ? "cursor-pointer hover:bg-white/5" : "cursor-default"
              )}
            >
              <span className="flex items-baseline gap-1.5">
                <span className={cn("text-[22px] font-bold leading-none", ACCENT_CLASSES[accent].text)}>
                  {figure.display}
                </span>
                {figure.delta !== null ? (
                  <span
                    className={cn(
                      "text-[10px] font-semibold tabular-nums",
                      figure.delta > 0 ? "text-emerald-400" : figure.delta < 0 ? "text-amber-400" : "text-gray-500"
                    )}
                  >
                    {formatDelta(figure.delta, figure.precision)}
                  </span>
                ) : null}
              </span>
              <span className="truncate text-[9px] font-medium uppercase tracking-[0.11em] text-gray-500">
                {figure.label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
