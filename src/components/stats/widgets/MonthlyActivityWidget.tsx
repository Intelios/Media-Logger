import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Sparkles } from "lucide-react";
import { statsLogic } from "../../../lib/stats-logic";
import { StatsWidgetShell } from "../StatsWidgetShell";
import { STATS_WIDGET_META } from "../stats-config";
import { COMPARISON_SERIES_COLOR, ComparisonLegend, StatsComparePicker } from "./StatsComparePicker";

const PRIMARY_COLOR = "#8b5cf6";

interface MonthlyActivityWidgetProps {
  monthlyCompletions: { month: string; count: number }[];
  activeYear: string;
  selectedTypes: string[];
  comparisonYearOptions: string[];
}

export function MonthlyActivityWidget({
  monthlyCompletions,
  activeYear,
  selectedTypes,
  comparisonYearOptions,
}: MonthlyActivityWidgetProps) {
  const totalCompletions = monthlyCompletions.reduce((sum, month) => sum + month.count, 0);
  const meta = STATS_WIDGET_META["monthly-activity"];

  const [comparisonYear, setComparisonYear] = useState<string | null>(null);
  const [comparisonMonthly, setComparisonMonthly] = useState<{ month: string; count: number }[] | null>(null);

  // Clear any active comparison when the active year changes (the comparison is ephemeral).
  useEffect(() => {
    setComparisonYear(null);
  }, [activeYear]);

  // Fetch the comparison year's monthly series, honouring the current type filters.
  useEffect(() => {
    if (!comparisonYear) {
      setComparisonMonthly(null);
      return;
    }

    let cancelled = false;
    void statsLogic.getComparisonSeries(comparisonYear, selectedTypes).then((series) => {
      if (!cancelled) {
        setComparisonMonthly(series.monthlyCompletions);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [comparisonYear, selectedTypes]);

  const hasComparison = comparisonYear !== null && comparisonMonthly !== null;
  const chartData = monthlyCompletions.map((entry, index) => ({
    month: entry.month,
    count: entry.count,
    comparisonCount: comparisonMonthly?.[index]?.count,
  }));

  return (
    <StatsWidgetShell
      widgetId={meta.id}
      title={meta.title}
      icon={<Sparkles className="text-cyan-400" size={20} />}
      heightPreset={meta.heightPreset}
      fillBody
      action={
        <StatsComparePicker value={comparisonYear} options={comparisonYearOptions} onChange={setComparisonYear} />
      }
      isEmpty={totalCompletions === 0}
      emptyState={
        <div className="flex h-full min-h-[190px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
          <p className="text-sm text-gray-400">No completed entries for the selected year and filters.</p>
        </div>
      }
    >
      {hasComparison ? (
        <ComparisonLegend primaryYear={activeYear} primaryColor={PRIMARY_COLOR} comparisonYear={comparisonYear} />
      ) : null}
      <div className="h-full min-h-[190px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <AreaChart data={chartData} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="stats-monthly-activity-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={PRIMARY_COLOR} stopOpacity={0.4} />
                <stop offset="95%" stopColor={PRIMARY_COLOR} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="stats-monthly-activity-comparison-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COMPARISON_SERIES_COLOR} stopOpacity={0.35} />
                <stop offset="95%" stopColor={COMPARISON_SERIES_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                backgroundColor: "color-mix(in srgb, var(--color-surface) 96%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-primary) 14%, var(--color-border))",
                borderRadius: 12,
                boxShadow: "0 12px 32px -8px rgba(0,0,0,0.55)",
                backdropFilter: "blur(14px)",
              }}
              itemStyle={{ color: "var(--color-text)" }}
              labelStyle={{ color: "var(--color-text-muted)" }}
            />
            {hasComparison ? (
              <Area
                type="monotone"
                dataKey="comparisonCount"
                name={comparisonYear}
                stroke={COMPARISON_SERIES_COLOR}
                strokeWidth={2}
                fill="url(#stats-monthly-activity-comparison-gradient)"
              />
            ) : null}
            <Area
              type="monotone"
              dataKey="count"
              name={activeYear}
              stroke={PRIMARY_COLOR}
              strokeWidth={2}
              fill="url(#stats-monthly-activity-gradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </StatsWidgetShell>
  );
}
