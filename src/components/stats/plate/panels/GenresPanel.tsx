import { useState } from "react";
import { PieChart as PieIcon } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { cn } from "../../../../lib/utils_ui";
import type { StatItem } from "../../../../lib/stats-logic";
import { BarRow, CATEGORY_PALETTE, PanelEmptyState, PanelFrame } from "../plate-ui";
import { TooltipDetail, TooltipTitle, useHoverTooltip } from "../PlateTooltip";

interface GenresPanelProps {
  genres: StatItem[];
  comparisonGenres: StatItem[] | null;
  genreCount: number;
  total: number;
  variant: "compact" | "expanded";
  onGenreClick: (genre: string) => void;
  onExpand?: () => void;
}

function buildDonutData(genres: StatItem[]) {
  const meaningful = genres.filter((genre) => genre.count > 0);
  const top = meaningful.slice(0, 6);
  const rest = meaningful.slice(6);

  if (rest.length === 0) {
    return top.map((genre) => ({ name: genre.name, count: genre.count }));
  }

  return [
    ...top.map((genre) => ({ name: genre.name, count: genre.count })),
    { name: `${rest.length} more`, count: rest.reduce((sum, genre) => sum + genre.count, 0) },
  ];
}

export function GenresPanel({
  genres,
  comparisonGenres,
  genreCount,
  total,
  variant,
  onGenreClick,
  onExpand,
}: GenresPanelProps) {
  const { bindTooltip, tooltip } = useHoverTooltip();
  const [hoveredName, setHoveredName] = useState<string | null>(null);

  const isExpanded = variant === "expanded";
  const maxCount = genres[0]?.count ?? 0;
  const comparisonMax = comparisonGenres?.[0]?.count ?? 0;
  const comparisonByName = new Map((comparisonGenres ?? []).map((genre) => [genre.name, genre.count]));
  const visible = isExpanded ? genres : genres.slice(0, 6);
  const donutData = buildDonutData(genres);

  // The donut's middle is dead space and the natural home for the share, which
  // keeps the rows down to a single number each.
  const highlighted = genres.find((genre) => genre.name === hoveredName) ?? genres[0];
  const highlightedShare = highlighted && total > 0 ? highlighted.count / total : 0;

  const ghostFor = (name: string) => {
    if (!comparisonGenres || comparisonMax === 0) {
      return undefined;
    }

    return (comparisonByName.get(name) ?? 0) / comparisonMax;
  };

  return (
    <PanelFrame
      title="Genres"
      subtitle={
        genreCount > genres.length ? `top ${genres.length} of ${genreCount}` : `${genreCount} in selection`
      }
      accent="purple"
      icon={<PieIcon size={13} />}
      onExpand={onExpand}
      bodyClassName={isExpanded ? "gap-4" : "gap-2"}
    >
      {tooltip}
      {genres.length === 0 ? (
        <PanelEmptyState message="No genres in the current selection." />
      ) : (
        <div className={cn("flex min-h-0 flex-1 gap-3", isExpanded ? "gap-6" : "items-center")}>
          <div className="flex shrink-0 flex-col items-center gap-1">
            <div className={cn("relative", isExpanded ? "h-56 w-56" : "h-[92px] w-[92px]")}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="count"
                    nameKey="name"
                    innerRadius="64%"
                    outerRadius="100%"
                    paddingAngle={1}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {donutData.map((slice, index) => (
                      <Cell
                        key={slice.name}
                        fill={CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]}
                        opacity={hoveredName === null || hoveredName === slice.name ? 1 : 0.3}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className={cn(
                    "font-bold leading-none tabular-nums text-white",
                    isExpanded ? "text-3xl" : "text-[15px]"
                  )}
                >
                  {Math.round(highlightedShare * 100)}%
                </span>
                {isExpanded ? (
                  <span className="mt-1 max-w-[9rem] truncate text-[12px] text-gray-400">{highlighted?.name}</span>
                ) : null}
              </div>
            </div>

            {!isExpanded ? (
              <span className="max-w-[92px] truncate text-center text-[9px] leading-tight text-gray-500">
                {highlighted?.name}
              </span>
            ) : null}
          </div>

          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col gap-1.5",
              isExpanded && "min-h-0 overflow-y-auto pr-1"
            )}
            onPointerLeave={() => setHoveredName(null)}
          >
            {visible.map((genre, index) => (
              <div key={genre.name} onPointerEnter={() => setHoveredName(genre.name)}>
                <BarRow
                  name={genre.name}
                  value={genre.count}
                  fraction={maxCount > 0 ? genre.count / maxCount : 0}
                  ghostFraction={ghostFor(genre.name)}
                  color={CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]}
                  nameWidth={isExpanded ? "9rem" : "4.5rem"}
                  onClick={() => onGenreClick(genre.name)}
                  hoverProps={bindTooltip(
                    <>
                      <TooltipTitle>{genre.name}</TooltipTitle>
                      <TooltipDetail>
                        {genre.count} {genre.count === 1 ? "entry" : "entries"}
                        {total > 0 ? ` · ${((genre.count / total) * 100).toFixed(1)}% of selection` : ""}
                        {genre.avgScore !== undefined ? ` · avg ${genre.avgScore.toFixed(1)}` : ""}
                        {genre.perfectCount ? ` · ${genre.perfectCount} perfect` : ""}
                      </TooltipDetail>
                      <TooltipDetail>Click to open these entries</TooltipDetail>
                    </>
                  )}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </PanelFrame>
  );
}
