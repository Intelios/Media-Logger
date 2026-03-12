import { type ReactNode, useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "../../../lib/utils_ui";
import type { StatItem } from "../../../lib/stats-logic";
import { StatsWidgetShell } from "../StatsWidgetShell";
import { STATS_WIDGET_META, type MainWidgetId, type StatsWidgetDisplayMode } from "../stats-config";

type BreakdownAccentColor = "purple" | "blue" | "amber" | "green" | "pink" | "cyan";

interface BreakdownListWidgetProps {
  widgetId: Extract<MainWidgetId, "platforms" | "franchises" | "studios" | "authors" | "actresses">;
  icon: ReactNode;
  items: StatItem[];
  accentColor: BreakdownAccentColor;
  displayMode: StatsWidgetDisplayMode;
  storageKey?: string;
}

const COLOR_MAP: Record<
  BreakdownAccentColor,
  { bg: string; border: string; bar: string; barBg: string; text: string; glow: string }
> = {
  purple: {
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    bar: "bg-purple-500",
    barBg: "bg-purple-500/20",
    text: "text-purple-400",
    glow: "hover:shadow-purple-500/10",
  },
  blue: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    bar: "bg-blue-500",
    barBg: "bg-blue-500/20",
    text: "text-blue-400",
    glow: "hover:shadow-blue-500/10",
  },
  amber: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    bar: "bg-amber-500",
    barBg: "bg-amber-500/20",
    text: "text-amber-400",
    glow: "hover:shadow-amber-500/10",
  },
  green: {
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    bar: "bg-green-500",
    barBg: "bg-green-500/20",
    text: "text-green-400",
    glow: "hover:shadow-green-500/10",
  },
  pink: {
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
    bar: "bg-pink-500",
    barBg: "bg-pink-500/20",
    text: "text-pink-400",
    glow: "hover:shadow-pink-500/10",
  },
  cyan: {
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    bar: "bg-cyan-500",
    barBg: "bg-cyan-500/20",
    text: "text-cyan-400",
    glow: "hover:shadow-cyan-500/10",
  },
};

const DONUT_PALETTE_MAP: Record<BreakdownAccentColor, string[]> = {
  purple: ["#a855f7", "#c084fc", "#8b5cf6", "#7c3aed", "#d8b4fe", "#6d28d9", "#4c1d95"],
  blue: ["#3b82f6", "#60a5fa", "#2563eb", "#1d4ed8", "#93c5fd", "#1e40af", "#172554"],
  amber: ["#f59e0b", "#fbbf24", "#d97706", "#f97316", "#fde68a", "#b45309", "#78350f"],
  green: ["#22c55e", "#4ade80", "#16a34a", "#15803d", "#86efac", "#166534", "#052e16"],
  pink: ["#ec4899", "#f472b6", "#db2777", "#be185d", "#f9a8d4", "#9d174d", "#500724"],
  cyan: ["#06b6d4", "#22d3ee", "#0891b2", "#0e7490", "#67e8f9", "#155e75", "#083344"],
};

interface BreakdownDonutDatum {
  name: string;
  count: number;
  avgScore?: number;
  [key: string]: string | number | undefined;
}

function buildDonutItems(items: StatItem[]): BreakdownDonutDatum[] {
  const meaningfulItems = items.filter((item) => item.count > 0);
  const topItems = meaningfulItems.slice(0, 6).map((item) => ({
    name: item.name,
    count: item.count,
    avgScore: item.avgScore,
  }));
  const remainingItems = meaningfulItems.slice(6);

  if (remainingItems.length === 0) {
    return topItems;
  }

  const otherCount = remainingItems.reduce((sum, item) => sum + item.count, 0);
  const weightedScore = remainingItems.reduce(
    (sum, item) => sum + (item.avgScore !== undefined ? item.avgScore * item.count : 0),
    0
  );
  const weightedScoreCount = remainingItems.reduce(
    (sum, item) => sum + (item.avgScore !== undefined ? item.count : 0),
    0
  );

  return [
    ...topItems,
    {
      name: "Other",
      count: otherCount,
      avgScore: weightedScoreCount > 0 ? weightedScore / weightedScoreCount : undefined,
    },
  ];
}

function BreakdownDonutTooltip({
  active,
  payload,
  totalCount,
}: {
  active?: boolean;
  payload?: Array<{ payload: BreakdownDonutDatum }>;
  totalCount: number;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const item = payload[0].payload;
  const percentage = totalCount > 0 ? (item.count / totalCount) * 100 : 0;

  return (
    <div className="rounded-xl border border-white/10 bg-[#111318]/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="text-sm font-semibold text-white">{item.name}</p>
      <p className="mt-1 text-xs text-gray-400">
        {item.count} entries • {percentage.toFixed(1)}%
      </p>
      {item.avgScore !== undefined ? (
        <p className="mt-1 text-xs font-medium text-gray-300">Avg score {item.avgScore.toFixed(1)}</p>
      ) : null}
    </div>
  );
}

export function BreakdownListWidget({
  widgetId,
  icon,
  items,
  accentColor,
  displayMode,
  storageKey = widgetId,
}: BreakdownListWidgetProps) {
  const meta = STATS_WIDGET_META[widgetId];
  const colors = COLOR_MAP[accentColor];
  const donutPalette = DONUT_PALETTE_MAP[accentColor];
  const totalCount = items.reduce((sum, item) => sum + item.count, 0);
  const maxCount = items.length > 0 ? items[0].count : 1;
  const [isExpanded, setIsExpanded] = useState(() => localStorage.getItem(`stats-section-${storageKey}`) === "true");

  useEffect(() => {
    localStorage.setItem(`stats-section-${storageKey}`, String(isExpanded));
  }, [isExpanded, storageKey]);

  const previewItems = items.slice(0, 3);
  const displayItems = isExpanded ? items : previewItems;
  const hasMore = items.length > 3;
  const donutItems = buildDonutItems(items);
  const effectiveDisplayMode =
    displayMode === "donut" && donutItems.length >= 2
      ? "donut"
      : "bars";

  return (
    <StatsWidgetShell
      widgetId={widgetId}
      title={meta.title}
      icon={<span className={colors.text}>{icon}</span>}
      subtitle={`${items.length} unique ${meta.title.toLowerCase()}`}
      heightPreset={meta.heightPreset}
      fillBody
      badge={
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", colors.bg, colors.text)}>
          {totalCount}
        </span>
      }
      action={
        effectiveDisplayMode === "bars" ? (
          <div className="rounded-lg p-1 text-gray-400 transition-colors group-hover:bg-white/5 group-hover:text-white">
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        ) : undefined
      }
      className={cn(colors.border, colors.bg, colors.glow, "transition-all duration-300 hover:shadow-lg")}
      headerClassName="p-4"
      bodyClassName="flex min-h-0 flex-1 flex-col px-4 pb-4"
      headerAsButton={effectiveDisplayMode === "bars"}
      onHeaderClick={effectiveDisplayMode === "bars" ? () => setIsExpanded((current) => !current) : undefined}
      isEmpty={items.length === 0}
      emptyState={
        <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-8 text-center">
          <p className="text-sm text-gray-400">No {meta.title.toLowerCase()} matched the current filters.</p>
        </div>
      }
    >
      {effectiveDisplayMode === "donut" ? (
        <div className="flex h-full min-h-0 flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-4">
            <div className="relative mx-auto h-44 w-full max-w-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutItems}
                    dataKey="count"
                    nameKey="name"
                    innerRadius="60%"
                    outerRadius="84%"
                    paddingAngle={2}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={1}
                  >
                    {donutItems.map((item, index) => (
                      <Cell
                        key={`${item.name}-${index}`}
                        fill={donutPalette[index % donutPalette.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    cursor={false}
                    content={<BreakdownDonutTooltip totalCount={totalCount} />}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">Total</span>
                <span className="mt-1 text-2xl font-bold text-white">{totalCount}</span>
              </div>
            </div>
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {donutItems.map((item, index) => {
              const percentage = totalCount > 0 ? (item.count / totalCount) * 100 : 0;

              return (
                <div
                  key={item.name}
                  className="rounded-xl border border-white/8 bg-black/10 px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: donutPalette[index % donutPalette.length] }}
                        />
                        <p className="truncate text-sm font-medium text-white">{item.name}</p>
                      </div>
                      <p className="mt-1 pl-[18px] text-xs text-gray-400">{percentage.toFixed(1)}% of entries</p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-white">{item.count}</p>
                      {item.avgScore !== undefined ? (
                        <p className={cn("mt-1 text-xs font-medium", colors.text)}>⭐ {item.avgScore.toFixed(1)}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-1 min-h-0 flex-col overflow-hidden transition-all duration-300 ease-out",
            isExpanded ? "max-h-[500px]" : "max-h-[180px]"
          )}
        >
          <div className={cn("space-y-2", isExpanded && "custom-scrollbar max-h-[460px] overflow-y-auto")}>
            {displayItems.map((item, index) => {
              const percentage = totalCount > 0 ? (item.count / totalCount) * 100 : 0;
              const barWidth = (item.count / maxCount) * 100;

              return (
                <div
                  key={item.name}
                  className="group rounded-lg p-2 transition-all duration-200 hover:bg-white/5"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="max-w-[60%] truncate text-sm text-gray-300 transition-colors group-hover:text-white">
                      {item.name}
                    </span>
                    <div className="flex items-center gap-2 text-xs">
                      {item.avgScore !== undefined ? (
                        <span className={cn("font-medium", colors.text)}>⭐ {item.avgScore.toFixed(1)}</span>
                      ) : null}
                      <span className="text-gray-400">{percentage.toFixed(1)}%</span>
                      <span className="min-w-[24px] text-right font-bold text-white">{item.count}</span>
                    </div>
                  </div>
                  <div className={cn("h-1.5 w-full rounded-full", colors.barBg)}>
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", colors.bar)}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {!isExpanded && hasMore ? (
              <div className="pt-2 text-center">
                <span className="text-xs text-gray-500">+{items.length - 3} more • Click to expand</span>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </StatsWidgetShell>
  );
}
