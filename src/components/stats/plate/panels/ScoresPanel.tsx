import { Star } from "lucide-react";
import { cn } from "../../../../lib/utils_ui";
import type { StatItem } from "../../../../lib/stats-logic";
import { BarRow, PanelEmptyState, PanelFrame } from "../plate-ui";
import { TooltipDetail, TooltipTitle, useHoverTooltip } from "../PlateTooltip";

interface ScoresPanelProps {
  ratings: StatItem[];
  averageScoreByType: StatItem[];
  averageScore: number;
  comparisonAverage: number | null;
  comparisonRatings: StatItem[] | null;
  variant: "compact" | "expanded";
  onExpand?: () => void;
}

// selectRatingDistribution returns 10→1 (plus an optional 0); the column chart
// reads left-to-right low-to-high, so flip it and keep 0 at the front.
function toAscendingScores(ratings: StatItem[]): StatItem[] {
  return [...ratings].sort((left, right) => Number(left.name) - Number(right.name));
}

export function ScoresPanel({
  ratings,
  averageScoreByType,
  averageScore,
  comparisonAverage,
  comparisonRatings,
  variant,
  onExpand,
}: ScoresPanelProps) {
  const { bindTooltip, tooltip } = useHoverTooltip();
  const isExpanded = variant === "expanded";
  const ascending = toAscendingScores(ratings);
  const maxCount = ascending.reduce((max, rating) => Math.max(max, rating.count), 0);
  const totalRated = ascending.reduce((sum, rating) => sum + rating.count, 0);

  const comparisonAscending = comparisonRatings ? toAscendingScores(comparisonRatings) : null;
  const comparisonMax = comparisonAscending?.reduce((max, rating) => Math.max(max, rating.count), 0) ?? 0;
  const comparisonByScore = new Map((comparisonAscending ?? []).map((rating) => [rating.name, rating.count]));

  const typeMax = averageScoreByType.reduce((max, type) => Math.max(max, type.avgScore ?? 0), 0);

  const subtitle =
    comparisonAverage === null
      ? `avg ${averageScore.toFixed(1)} · ${totalRated} rated`
      : `avg ${averageScore.toFixed(1)} · was ${comparisonAverage.toFixed(1)}`;

  return (
    <PanelFrame
      title="Scores"
      subtitle={subtitle}
      accent="amber"
      icon={<Star size={13} />}
      onExpand={onExpand}
      bodyClassName="gap-2"
    >
      {tooltip}
      {totalRated === 0 ? (
        <PanelEmptyState message="Nothing in the current selection has a score yet." />
      ) : (
        <>
          <div className={cn("flex min-h-[56px] flex-1 items-end gap-[3px]", isExpanded && "min-h-[220px]")}>
            {ascending.map((rating) => {
              const height = maxCount > 0 ? (rating.count / maxCount) * 100 : 0;
              const ghostHeight =
                comparisonMax > 0 ? ((comparisonByScore.get(rating.name) ?? 0) / comparisonMax) * 100 : null;

              const comparisonCount = comparisonByScore.get(rating.name);

              return (
                <div
                  key={rating.name}
                  // The hit area is the whole column, not just the drawn bar, so
                  // low-count scores are still hoverable.
                  className="group relative flex min-w-0 flex-1 items-end self-stretch"
                  {...bindTooltip(
                    <>
                      <TooltipTitle>Score {rating.name}</TooltipTitle>
                      <TooltipDetail>
                        {rating.count} {rating.count === 1 ? "entry" : "entries"}
                        {totalRated > 0 ? ` · ${((rating.count / totalRated) * 100).toFixed(1)}% of rated` : ""}
                      </TooltipDetail>
                      {comparisonCount !== undefined ? (
                        <TooltipDetail>Comparison: {comparisonCount}</TooltipDetail>
                      ) : null}
                    </>
                  )}
                >
                  <div className="absolute inset-0 rounded-sm bg-white/0 transition-colors group-hover:bg-white/[0.06]" />
                  <div
                    className="relative w-full rounded-t-sm bg-gradient-to-t from-amber-500/40 to-amber-400 transition-[filter] group-hover:brightness-110"
                    style={{ height: `${Math.max(height, rating.count > 0 ? 3 : 0)}%` }}
                  />
                  {ghostHeight !== null ? (
                    <div
                      className="absolute inset-x-0 h-[2px] rounded-full bg-white/35"
                      style={{ bottom: `${ghostHeight}%` }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="flex shrink-0 justify-between text-[9px] text-gray-600">
            {ascending.map((rating) => (
              <span key={rating.name} className="min-w-0 flex-1 text-center">
                {rating.name}
              </span>
            ))}
          </div>

          {isExpanded && averageScoreByType.length > 0 ? (
            <div className="flex shrink-0 flex-col gap-2 border-t border-white/10 pt-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                Average score by type
              </h4>
              <div className="flex flex-col gap-1.5">
                {averageScoreByType.map((type) => (
                  <BarRow
                    key={type.name}
                    name={type.name}
                    value={(type.avgScore ?? 0).toFixed(1)}
                    fraction={typeMax > 0 ? (type.avgScore ?? 0) / typeMax : 0}
                    color="#fbbf24"
                    nameWidth="9rem"
                    hoverProps={bindTooltip(
                      <>
                        <TooltipTitle>{type.name}</TooltipTitle>
                        <TooltipDetail>
                          avg {(type.avgScore ?? 0).toFixed(1)} across {type.count}{" "}
                          {type.count === 1 ? "entry" : "entries"}
                        </TooltipDetail>
                      </>
                    )}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </PanelFrame>
  );
}
