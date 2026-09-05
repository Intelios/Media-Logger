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
import { getRatingTextColor } from "../../../lib/media-config";
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

interface TimelineChartRow {
  label: string;
  completions: number;
  score: number | null;
  ratedCount: number;
  rewatches: number;
  comparisonCompletions?: number;
}

interface TimelineTooltipEntry {
  name?: string;
  value?: number | null;
  color?: string;
  dataKey?: string | number;
  payload?: TimelineChartRow;
}

// The average score is the layer people read the timeline for, so it leads at
// full size and the remaining layers sit beneath it as supporting rows.
function TimelineTooltip({
  active,
  payload,
  label,
  scoreLayerActive = false,
}: {
  active?: boolean;
  payload?: TimelineTooltipEntry[];
  label?: string | number;
  scoreLayerActive?: boolean;
}) {
  if (!active || !payload?.length) return null;

  // Read the score off the bucket rather than the payload: recharts drops a
  // series from the payload entirely when its value is null, so an unrated
  // bucket would otherwise render nothing at all.
  const row = payload[0]?.payload;
  const score = typeof row?.score === "number" ? row.score : null;
  const ratedCount = row?.ratedCount ?? 0;
  const otherEntries = payload.filter((entry) => entry.dataKey !== "score");

  return (
    <div className="glass-tooltip min-w-[148px] rounded-xl px-3 py-2.5">
      <div className="text-[11px] font-medium text-text-muted">{String(label ?? "")}</div>

      {scoreLayerActive ? (
        score === null ? (
          <div className="mt-1 text-[12px] text-text-subtle">No rated entries</div>
        ) : (
          <>
            <div className="mt-1 flex items-baseline gap-1">
              <span className={cn("text-2xl font-bold leading-none", getRatingTextColor(score))}>
                {score.toFixed(1)}
              </span>
              <span className="text-[11px] text-text-subtle">/10</span>
            </div>
            <div className="mt-1 text-[11px] text-text-muted">
              from {ratedCount} rated {ratedCount === 1 ? "entry" : "entries"}
            </div>
          </>
        )
      ) : null}

      {otherEntries.length > 0 ? (
        <div className={cn("space-y-0.5", scoreLayerActive ? "mt-2 border-t border-primary/15 pt-2" : "mt-1")}>
          {otherEntries.map((entry) => (
            <div key={String(entry.dataKey)} className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: entry.color ?? "var(--color-primary)" }}
              />
              <span className="text-[11px] text-text-muted">{entry.name}</span>
              <span className="ml-auto pl-3 font-mono text-[11px] text-text">
                {typeof entry.value === "number" ? entry.value : "—"}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
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
    ratedCount: bucket.ratedCount,
    rewatches: bucket.rewatches,
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
              content={<TimelineTooltip scoreLayerActive={activeLayers.has("score")} />}
              cursor={{ stroke: "rgba(255,255,255,0.08)" }}
              wrapperStyle={{ zIndex: 50 }}
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
