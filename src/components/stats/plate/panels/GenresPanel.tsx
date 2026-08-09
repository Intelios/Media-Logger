import { PieChart as PieIcon } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { StatItem } from "../../../../lib/stats-logic";
import { BarRow, CATEGORY_PALETTE, PanelEmptyState, PanelFrame } from "../plate-ui";

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
  const isExpanded = variant === "expanded";
  const maxCount = genres[0]?.count ?? 0;
  const comparisonMax = comparisonGenres?.[0]?.count ?? 0;
  const comparisonByName = new Map((comparisonGenres ?? []).map((genre) => [genre.name, genre.count]));
  const visible = isExpanded ? genres : genres.slice(0, 6);
  const donutData = buildDonutData(genres);

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
      {genres.length === 0 ? (
        <PanelEmptyState message="No genres in the current selection." />
      ) : (
        <div className={isExpanded ? "flex min-h-0 flex-1 gap-6" : "flex min-h-0 flex-1 items-center gap-3"}>
          <div className={isExpanded ? "h-56 w-56 shrink-0" : "h-[84px] w-[84px] shrink-0"}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="count"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="100%"
                  paddingAngle={1}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {donutData.map((slice, index) => (
                    <Cell key={slice.name} fill={CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className={isExpanded ? "flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1" : "flex min-w-0 flex-1 flex-col gap-1.5"}>
            {visible.map((genre, index) => (
              <BarRow
                key={genre.name}
                name={genre.name}
                value={genre.count}
                fraction={maxCount > 0 ? genre.count / maxCount : 0}
                ghostFraction={ghostFor(genre.name)}
                color={CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]}
                nameWidth={isExpanded ? "9rem" : "4.5rem"}
                onClick={() => onGenreClick(genre.name)}
                title={
                  isExpanded
                    ? `${genre.count} entries · ${total > 0 ? Math.round((genre.count / total) * 100) : 0}% of selection${
                        genre.avgScore !== undefined ? ` · avg ${genre.avgScore.toFixed(1)}` : ""
                      }`
                    : `View ${genre.name} entries`
                }
              />
            ))}
          </div>
        </div>
      )}
    </PanelFrame>
  );
}
