import { Activity } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimelineBucket } from "../../../lib/stats-logic";
import { cn } from "../../../lib/utils_ui";
import { formatShortDate } from "../../../lib/dates";
import { TIMELINE_LAYER_DEFINITIONS, TIMELINE_LAYER_IDS, type TimelineLayerId } from "./plate-config";
import { PanelFrame, PlatePill } from "./plate-ui";
import { BrushStrip } from "./BrushStrip";
import { BUSY_DAY_THRESHOLD, isAllTime, type BrushCell, type StatsRange } from "./plate-data";

const COMPARISON_COLOR = "#94a3b8";

interface TimelineHeroProps {
  timeline: TimelineBucket[];
  comparisonTimeline: TimelineBucket[] | null;
  comparisonYear: string | null;
  layers: TimelineLayerId[];
  onToggleLayer: (layer: TimelineLayerId) => void;
  brushCells: BrushCell[];
  range: StatsRange | null;
  onRangeChange: (range: StatsRange | null) => void;
  activeYear: string;
  rangedTotal: number;
  onExpand?: () => void;
  className?: string;
  chartClassName?: string;
  showBrush?: boolean;
}

function bucketLabelsForRange(timeline: TimelineBucket[], range: StatsRange | null): [string, string] | null {
  if (!range || timeline.length === 0) {
    return null;
  }

  // Buckets are keyed by zero-padded month index or by year; both compare
  // correctly against the equivalent slice of the range bounds.
  const isMonthly = timeline[0].key.length === 2;
  const fromKey = isMonthly ? String(Number(range.from.slice(5, 7)) - 1).padStart(2, "0") : range.from.slice(0, 4);
  const toKey = isMonthly ? String(Number(range.to.slice(5, 7)) - 1).padStart(2, "0") : range.to.slice(0, 4);

  const inRange = timeline.filter((bucket) => bucket.key >= fromKey && bucket.key <= toKey);
  if (inRange.length === 0) {
    return null;
  }

  return [inRange[0].label, inRange[inRange.length - 1].label];
}

export function TimelineHero({
  timeline,
  comparisonTimeline,
  comparisonYear,
  layers,
  onToggleLayer,
  brushCells,
  range,
  onRangeChange,
  activeYear,
  rangedTotal,
  onExpand,
  className,
  chartClassName = "min-h-[92px] flex-1",
  showBrush = true,
}: TimelineHeroProps) {
  const activeLayers = new Set(layers);

  const chartData = timeline.map((bucket, index) => ({
    label: bucket.label,
    completions: bucket.completions,
    score: bucket.averageScore,
    rewatches: bucket.rewatches,
    platinums: bucket.platinums,
    comparisonCompletions: comparisonTimeline?.[index]?.completions,
  }));

  const referenceLabels = bucketLabelsForRange(timeline, range);

  const subtitle = range ? (
    <span>
      {formatShortDate(range.from)} — {formatShortDate(range.to)} · {rangedTotal}{" "}
      {rangedTotal === 1 ? "entry" : "entries"} ·{" "}
      <button
        type="button"
        onClick={() => onRangeChange(null)}
        className="text-purple-300 underline underline-offset-2 transition-colors hover:text-purple-200"
      >
        clear selection
      </button>
    </span>
  ) : (
    <span>
      {activeYear} · full range
      {comparisonYear ? ` · faint line is ${comparisonYear}` : ""}
    </span>
  );

  return (
    <PanelFrame
      title="Timeline"
      subtitle={subtitle}
      accent="purple"
      icon={<Activity size={13} />}
      onExpand={onExpand}
      expandLabel="Expand timeline"
      className={cn("min-h-0", className)}
      bodyClassName="gap-2"
      action={
        <div className="flex flex-wrap items-center justify-end gap-1">
          {TIMELINE_LAYER_IDS.map((layerId) => {
            const definition = TIMELINE_LAYER_DEFINITIONS[layerId];
            const isActive = activeLayers.has(layerId);

            return (
              <PlatePill key={layerId} active={isActive} onClick={() => onToggleLayer(layerId)}>
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: isActive ? definition.color : "currentColor" }}
                />
                <span>{definition.label}</span>
              </PlatePill>
            );
          })}
        </div>
      }
    >
      <div className={cn("w-full", chartClassName)}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <ComposedChart data={chartData} margin={{ left: 10, right: 10, top: 6, bottom: 0 }}>
            <defs>
              <linearGradient id="plate-timeline-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TIMELINE_LAYER_DEFINITIONS.completions.color} stopOpacity={0.42} />
                <stop offset="100%" stopColor={TIMELINE_LAYER_DEFINITIONS.completions.color} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#6B7280", fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              interval={0}
              height={14}
            />
            <YAxis yAxisId="count" hide />
            <YAxis yAxisId="score" hide domain={[0, 10]} />

            <Tooltip
              contentStyle={{
                backgroundColor: "color-mix(in srgb, var(--color-surface) 96%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-primary) 14%, var(--color-border))",
                borderRadius: 12,
                fontSize: 12,
                boxShadow: "0 12px 32px -8px rgba(0,0,0,0.55)",
              }}
              itemStyle={{ color: "var(--color-text)" }}
              labelStyle={{ color: "var(--color-text-muted)" }}
              formatter={(value, name) => [
                // Months with no rated entries carry a null average; show a dash
                // rather than recharts' default empty cell.
                typeof value === "number" ? String(Number(value.toFixed(1))) : "—",
                name,
              ]}
            />

            {referenceLabels ? (
              <ReferenceArea
                yAxisId="count"
                x1={referenceLabels[0]}
                x2={referenceLabels[1]}
                fill={TIMELINE_LAYER_DEFINITIONS.completions.color}
                fillOpacity={0.08}
                stroke={TIMELINE_LAYER_DEFINITIONS.completions.color}
                strokeOpacity={0.45}
              />
            ) : null}

            {comparisonTimeline && activeLayers.has("completions") ? (
              <Line
                yAxisId="count"
                type="monotone"
                dataKey="comparisonCompletions"
                name={comparisonYear ?? "Comparison"}
                stroke={COMPARISON_COLOR}
                strokeWidth={1.5}
                strokeOpacity={0.55}
                dot={false}
              />
            ) : null}

            {activeLayers.has("completions") ? (
              <Area
                yAxisId="count"
                type="monotone"
                dataKey="completions"
                name={TIMELINE_LAYER_DEFINITIONS.completions.label}
                stroke={TIMELINE_LAYER_DEFINITIONS.completions.color}
                strokeWidth={2}
                fill="url(#plate-timeline-fill)"
                dot={false}
              />
            ) : null}

            {activeLayers.has("rewatches") ? (
              <Line
                yAxisId="count"
                type="monotone"
                dataKey="rewatches"
                name={TIMELINE_LAYER_DEFINITIONS.rewatches.label}
                stroke={TIMELINE_LAYER_DEFINITIONS.rewatches.color}
                strokeWidth={1.75}
                dot={false}
              />
            ) : null}

            {activeLayers.has("platinums") ? (
              <Line
                yAxisId="count"
                type="monotone"
                dataKey="platinums"
                name={TIMELINE_LAYER_DEFINITIONS.platinums.label}
                stroke={TIMELINE_LAYER_DEFINITIONS.platinums.color}
                strokeWidth={1.75}
                dot={false}
              />
            ) : null}

            {activeLayers.has("score") ? (
              <Line
                yAxisId="score"
                type="monotone"
                dataKey="score"
                name={TIMELINE_LAYER_DEFINITIONS.score.label}
                stroke={TIMELINE_LAYER_DEFINITIONS.score.color}
                strokeWidth={1.75}
                strokeDasharray="4 3"
                connectNulls
                dot={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {showBrush ? (
        <>
          <BrushStrip cells={brushCells} range={range} onRangeChange={onRangeChange} />
          <p className="shrink-0 text-[9px] leading-tight text-gray-600">
            {isAllTime(activeYear)
              ? "One cell per year · drag to select, double-click to reset"
              : `Weekly completions · amber marks a week with a ${BUSY_DAY_THRESHOLD}+ log day · drag to select, double-click to reset`}
          </p>
        </>
      ) : null}
    </PanelFrame>
  );
}
