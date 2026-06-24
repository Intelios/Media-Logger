import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import type { StatItem } from "../../../lib/stats-logic";
import { StatsWidgetShell } from "../StatsWidgetShell";
import { STATS_WIDGET_META } from "../stats-config";

interface AverageScoreByTypeWidgetProps {
  items: StatItem[];
}

function AverageScoreTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  const item = payload[0]?.payload as StatItem | undefined;
  if (!item || item.avgScore === undefined) {
    return null;
  }

  return (
    <div className="glass-tooltip rounded-xl px-4 py-3">
      <div className="mb-1 text-sm font-semibold text-text">{item.name}</div>
      <div className="space-y-1 text-sm">
        <p className="text-sky-300">
          Avg score <span className="font-bold">{item.avgScore.toFixed(1)}</span>
        </p>
        <p className="text-text-muted">
          {item.count} {item.count === 1 ? "entry" : "entries"}
        </p>
      </div>
    </div>
  );
}

export function AverageScoreByTypeWidget({ items }: AverageScoreByTypeWidgetProps) {
  const meta = STATS_WIDGET_META["average-score-by-type"];
  const chartData = [...items].reverse();

  return (
    <StatsWidgetShell
      widgetId={meta.id}
      title={meta.title}
      icon={<BarChart3 className="text-sky-400" size={20} />}
      subtitle="Average score by content type"
      heightPreset={meta.heightPreset}
      fillBody
      isEmpty={items.length === 0}
      emptyState={
        <div className="flex h-full min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
          <p className="text-sm text-gray-400">You need rated entries across content types to compare average scores.</p>
        </div>
      }
    >
      <div className="h-full min-h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 18, right: 24, top: 8, bottom: 4 }}>
            <XAxis
              type="number"
              domain={[0, 10]}
              tick={{ fill: "#6B7280", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              dataKey="name"
              type="category"
              width={88}
              tick={{ fill: "#9CA3AF", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<AverageScoreTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
            <Bar dataKey="avgScore" fill="#38bdf8" radius={[0, 4, 4, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </StatsWidgetShell>
  );
}
