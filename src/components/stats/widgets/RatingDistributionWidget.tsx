import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Star } from "lucide-react";
import type { StatItem } from "../../../lib/stats-logic";
import { StatsWidgetShell } from "../StatsWidgetShell";
import { STATS_WIDGET_META } from "../stats-config";

interface RatingDistributionWidgetProps {
  ratings: StatItem[];
}

function RatingTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  const { name, count } = payload[0].payload;

  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/95 px-4 py-3 shadow-2xl backdrop-blur-xl">
      <div className="mb-1 flex items-center gap-2">
        <Star size={14} className="text-amber-400" />
        <span className="font-semibold text-white">{name}/10</span>
      </div>
      <p className="text-sm text-gray-300">
        <span className="font-bold text-amber-300">{count}</span> {count === 1 ? "entry" : "entries"}
      </p>
    </div>
  );
}

export function RatingDistributionWidget({ ratings }: RatingDistributionWidgetProps) {
  const meta = STATS_WIDGET_META["rating-distribution"];
  const ratingCount = ratings.reduce((sum, rating) => sum + rating.count, 0);

  return (
    <StatsWidgetShell
      widgetId={meta.id}
      title={meta.title}
      icon={<Star className="text-amber-400" size={20} />}
      heightPreset={meta.heightPreset}
      fillBody
      isEmpty={ratingCount === 0}
      emptyState={
        <div className="flex h-full min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
          <p className="text-sm text-gray-400">No rated entries for the current filters.</p>
        </div>
      }
    >
      <div className="h-full min-h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={[...ratings].reverse()} layout="vertical" margin={{ left: 0, right: 30 }}>
            <XAxis type="number" hide />
            <YAxis dataKey="name" type="category" width={30} tick={{ fill: "#9CA3AF" }} />
            <Tooltip content={<RatingTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
            <Bar dataKey="count" fill="#fbbf24" radius={[0, 4, 4, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </StatsWidgetShell>
  );
}
