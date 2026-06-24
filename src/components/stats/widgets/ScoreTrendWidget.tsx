import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import { statsLogic, type ScoreTimelinePoint } from "../../../lib/stats-logic";
import { StatsWidgetShell } from "../StatsWidgetShell";
import { STATS_WIDGET_META } from "../stats-config";
import { COMPARISON_SERIES_COLOR, ComparisonLegend, StatsComparePicker } from "./StatsComparePicker";

const PRIMARY_COLOR = "#34d399";

interface ScoreTrendWidgetProps {
  timeline: ScoreTimelinePoint[];
  granularity: "month" | "year";
  activeYear: string;
  selectedTypes: string[];
  comparisonYearOptions: string[];
}

interface ScoreTrendTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ScoreTrendChartPoint }>;
  label?: string;
  activeYear: string;
  comparisonYear: string | null;
}

interface ScoreTrendChartPoint {
  label: string;
  averageScore: number | null;
  count: number;
  comparisonScore: number | null;
  comparisonCount: number;
}

function ScoreTrendTooltip({ active, payload, label, activeYear, comparisonYear }: ScoreTrendTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  if (!point) {
    return null;
  }

  const hasPrimary = point.averageScore !== null && point.averageScore !== undefined;
  const hasComparison =
    comparisonYear !== null && point.comparisonScore !== null && point.comparisonScore !== undefined;

  if (!hasPrimary && !hasComparison) {
    return null;
  }

  const primaryLabel = comparisonYear !== null ? `${activeYear} avg` : "Avg score";

  return (
    <div className="glass-tooltip rounded-xl px-4 py-3">
      <div className="mb-1 text-sm font-semibold text-text">{label}</div>
      <div className="space-y-1 text-sm">
        {hasPrimary ? (
          <>
            <p className="text-emerald-300">
              {primaryLabel} <span className="font-bold">{point.averageScore!.toFixed(1)}</span>
            </p>
            <p className="text-text-muted">
              {point.count} rated {point.count === 1 ? "entry" : "entries"}
            </p>
          </>
        ) : null}
        {hasComparison ? (
          <>
            <p className="text-amber-300">
              {comparisonYear} avg <span className="font-bold">{point.comparisonScore!.toFixed(1)}</span>
            </p>
            <p className="text-text-muted">
              {point.comparisonCount} rated {point.comparisonCount === 1 ? "entry" : "entries"}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function ScoreTrendWidget({
  timeline,
  granularity,
  activeYear,
  selectedTypes,
  comparisonYearOptions,
}: ScoreTrendWidgetProps) {
  const meta = STATS_WIDGET_META["score-trend"];
  const ratedPointCount = timeline.filter((point) => point.averageScore !== null).length;
  const canCompare = granularity === "month";

  const [comparisonYear, setComparisonYear] = useState<string | null>(null);
  const [comparisonTimeline, setComparisonTimeline] = useState<ScoreTimelinePoint[] | null>(null);

  // Clear any active comparison when the active year changes (the comparison is ephemeral).
  useEffect(() => {
    setComparisonYear(null);
  }, [activeYear]);

  // Fetch the comparison year's score timeline, honouring the current type filters.
  useEffect(() => {
    if (!comparisonYear) {
      setComparisonTimeline(null);
      return;
    }

    let cancelled = false;
    void statsLogic.getComparisonSeries(comparisonYear, selectedTypes).then((series) => {
      if (!cancelled) {
        setComparisonTimeline(series.scoreTimeline);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [comparisonYear, selectedTypes]);

  const hasComparison = canCompare && comparisonYear !== null && comparisonTimeline !== null;
  const chartData: ScoreTrendChartPoint[] = timeline.map((point, index) => ({
    label: point.label,
    averageScore: point.averageScore,
    count: point.count,
    comparisonScore: comparisonTimeline?.[index]?.averageScore ?? null,
    comparisonCount: comparisonTimeline?.[index]?.count ?? 0,
  }));

  return (
    <StatsWidgetShell
      widgetId={meta.id}
      title={meta.title}
      icon={<TrendingUp className="text-emerald-400" size={20} />}
      subtitle={granularity === "month" ? "Average score by month" : "Average score by year"}
      heightPreset={meta.heightPreset}
      fillBody
      action={
        canCompare ? (
          <StatsComparePicker value={comparisonYear} options={comparisonYearOptions} onChange={setComparisonYear} />
        ) : undefined
      }
      isEmpty={ratedPointCount === 0}
      emptyState={
        <div className="flex h-full min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
          <p className="text-sm text-gray-400">Not enough rated entries to plot a score trend.</p>
        </div>
      }
    >
      {hasComparison && comparisonYear !== null ? (
        <ComparisonLegend primaryYear={activeYear} primaryColor={PRIMARY_COLOR} comparisonYear={comparisonYear} />
      ) : null}
      <div className="h-full min-h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <LineChart data={chartData} margin={{ left: 0, right: 18, top: 10, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              domain={[0, 10]}
              tick={{ fill: "#6B7280", fontSize: 12 }}
              width={28}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<ScoreTrendTooltip activeYear={activeYear} comparisonYear={hasComparison ? comparisonYear : null} />}
              cursor={{ stroke: "rgba(255,255,255,0.08)" }}
            />
            {hasComparison ? (
              <Line
                type="monotone"
                dataKey="comparisonScore"
                stroke={COMPARISON_SERIES_COLOR}
                strokeWidth={2.5}
                dot={{ r: 3, fill: COMPARISON_SERIES_COLOR, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: COMPARISON_SERIES_COLOR, stroke: "#0f172a", strokeWidth: 2 }}
                connectNulls={false}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey="averageScore"
              stroke={PRIMARY_COLOR}
              strokeWidth={2.5}
              dot={{ r: 3, fill: PRIMARY_COLOR, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: PRIMARY_COLOR, stroke: "#0f172a", strokeWidth: 2 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </StatsWidgetShell>
  );
}
