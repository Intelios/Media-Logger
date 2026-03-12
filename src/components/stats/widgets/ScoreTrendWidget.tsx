import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import type { ScoreTimelinePoint } from "../../../lib/stats-logic";
import { StatsWidgetShell } from "../StatsWidgetShell";
import { STATS_WIDGET_META } from "../stats-config";

interface ScoreTrendWidgetProps {
  timeline: ScoreTimelinePoint[];
  granularity: "month" | "year";
}

function ScoreTrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload as ScoreTimelinePoint | undefined;
  if (!point || point.averageScore === null) {
    return null;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/95 px-4 py-3 shadow-2xl backdrop-blur-xl">
      <div className="mb-1 text-sm font-semibold text-white">{label}</div>
      <div className="space-y-1 text-sm">
        <p className="text-emerald-300">
          Avg score <span className="font-bold">{point.averageScore.toFixed(1)}</span>
        </p>
        <p className="text-gray-400">
          {point.count} rated {point.count === 1 ? "entry" : "entries"}
        </p>
      </div>
    </div>
  );
}

export function ScoreTrendWidget({ timeline, granularity }: ScoreTrendWidgetProps) {
  const meta = STATS_WIDGET_META["score-trend"];
  const ratedPointCount = timeline.filter((point) => point.averageScore !== null).length;

  return (
    <StatsWidgetShell
      widgetId={meta.id}
      title={meta.title}
      icon={<TrendingUp className="text-emerald-400" size={20} />}
      subtitle={granularity === "month" ? "Average score by month" : "Average score by year"}
      heightPreset={meta.heightPreset}
      fillBody
      isEmpty={ratedPointCount === 0}
      emptyState={
        <div className="flex h-full min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
          <p className="text-sm text-gray-400">Not enough rated entries to plot a score trend.</p>
        </div>
      }
    >
      <div className="h-full min-h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <LineChart data={timeline} margin={{ left: 0, right: 18, top: 10, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              domain={[0, 10]}
              tick={{ fill: "#6B7280", fontSize: 12 }}
              width={28}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<ScoreTrendTooltip />} cursor={{ stroke: "rgba(255,255,255,0.08)" }} />
            <Line
              type="monotone"
              dataKey="averageScore"
              stroke="#34d399"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#34d399", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#34d399", stroke: "#0f172a", strokeWidth: 2 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </StatsWidgetShell>
  );
}
