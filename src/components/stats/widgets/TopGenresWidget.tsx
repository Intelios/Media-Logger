import { ChevronRight, Filter, Star } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { StatItem } from "../../../lib/stats-logic";
import { StatsWidgetShell } from "../StatsWidgetShell";
import { STATS_WIDGET_META } from "../stats-config";

const COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"];

interface TopGenresWidgetProps {
  genres: StatItem[];
  onViewAllGenres: () => void;
  onGenreClick: (genreName: string) => void;
}

function GenreTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  const { name, count, avgScore, perfectCount } = payload[0].payload;

  return (
    <div className="min-w-[140px] rounded-xl border border-white/10 bg-gray-900/95 px-4 py-3 shadow-2xl backdrop-blur-xl">
      <div className="mb-2 flex items-center gap-2">
        <div
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: payload[0].payload.fill || payload[0].color }}
        />
        <span className="font-semibold text-white">{name}</span>
      </div>
      <div className="space-y-1 text-sm">
        <p className="text-gray-300">
          <span className="font-bold text-purple-300">{count}</span> {count === 1 ? "entry" : "entries"}
        </p>
        {avgScore !== undefined ? (
          <p className="flex items-center gap-1 text-gray-400">
            <Star size={12} className="text-amber-400" />
            <span className="font-medium text-amber-300">{avgScore.toFixed(1)}</span> avg
          </p>
        ) : null}
        {(perfectCount ?? 0) > 0 ? (
          <p className="text-gray-400">
            <span className="font-medium text-pink-300">💎 {perfectCount}</span> perfect
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function TopGenresWidget({ genres, onViewAllGenres, onGenreClick }: TopGenresWidgetProps) {
  const meta = STATS_WIDGET_META["top-genres"];
  const topGenres = genres.slice(0, 10);

  return (
    <StatsWidgetShell
      widgetId={meta.id}
      title={meta.title}
      icon={<Filter className="text-purple-400" size={20} />}
      action={
        genres.length > 10 ? (
          <button
            type="button"
            onClick={onViewAllGenres}
            className="flex items-center gap-1 text-sm font-medium text-purple-400 transition-colors hover:text-purple-300"
          >
            View all {genres.length} genres
            <ChevronRight size={16} />
          </button>
        ) : null
      }
      isEmpty={topGenres.length === 0}
      emptyState={
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
          <p className="text-sm text-gray-400">No genres available for the current filters.</p>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-8 md:flex-row">
        <div className="h-64 w-full md:w-1/2">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <PieChart>
              <Pie data={topGenres} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={4} dataKey="value">
                {topGenres.map((_, index) => (
                  <Cell key={`top-genre-cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                ))}
              </Pie>
              <Tooltip content={<GenreTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="w-full space-y-2 md:w-1/2">
          {topGenres.map((genre, index) => (
            <button
              key={genre.name}
              type="button"
              onClick={() => onGenreClick(genre.name)}
              className="group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-gray-300 transition-colors group-hover:text-white">{genre.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {(genre.perfectCount ?? 0) > 0 ? <span className="text-xs text-pink-400">💎{genre.perfectCount}</span> : null}
                {genre.avgScore ? <span className="text-xs text-amber-400">⭐{genre.avgScore.toFixed(1)}</span> : null}
                <span className="font-bold text-white">{genre.count}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </StatsWidgetShell>
  );
}
