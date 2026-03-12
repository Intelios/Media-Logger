import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Sparkles } from "lucide-react";
import { StatsWidgetShell } from "../StatsWidgetShell";
import { STATS_WIDGET_META } from "../stats-config";

interface MonthlyActivityWidgetProps {
  monthlyCompletions: { month: string; count: number }[];
}

export function MonthlyActivityWidget({ monthlyCompletions }: MonthlyActivityWidgetProps) {
  const totalCompletions = monthlyCompletions.reduce((sum, month) => sum + month.count, 0);
  const meta = STATS_WIDGET_META["monthly-activity"];

  return (
    <StatsWidgetShell
      widgetId={meta.id}
      title={meta.title}
      icon={<Sparkles className="text-cyan-400" size={20} />}
      heightPreset={meta.heightPreset}
      fillBody
      isEmpty={totalCompletions === 0}
      emptyState={
        <div className="flex h-full min-h-[190px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
          <p className="text-sm text-gray-400">No completed entries for the selected year and filters.</p>
        </div>
      }
    >
      <div className="h-full min-h-[190px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <AreaChart data={monthlyCompletions} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="stats-monthly-activity-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ backgroundColor: "#1f1f1f", borderColor: "#333", borderRadius: 8 }}
              itemStyle={{ color: "#fff" }}
              labelStyle={{ color: "#9CA3AF" }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#8b5cf6"
              strokeWidth={2}
              fill="url(#stats-monthly-activity-gradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </StatsWidgetShell>
  );
}
