import { type ReactNode, useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../../lib/utils_ui";
import type { StatItem } from "../../../lib/stats-logic";
import { StatsWidgetShell } from "../StatsWidgetShell";
import { STATS_WIDGET_META, type MainWidgetId } from "../stats-config";

type BreakdownAccentColor = "purple" | "blue" | "amber" | "green" | "pink" | "cyan";

interface BreakdownListWidgetProps {
  widgetId: Extract<MainWidgetId, "platforms" | "franchises" | "studios" | "authors" | "actresses">;
  icon: ReactNode;
  items: StatItem[];
  accentColor: BreakdownAccentColor;
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

export function BreakdownListWidget({
  widgetId,
  icon,
  items,
  accentColor,
  storageKey = widgetId,
}: BreakdownListWidgetProps) {
  const meta = STATS_WIDGET_META[widgetId];
  const colors = COLOR_MAP[accentColor];
  const totalCount = items.reduce((sum, item) => sum + item.count, 0);
  const maxCount = items.length > 0 ? items[0].count : 1;
  const [isExpanded, setIsExpanded] = useState(() => localStorage.getItem(`stats-section-${storageKey}`) === "true");

  useEffect(() => {
    localStorage.setItem(`stats-section-${storageKey}`, String(isExpanded));
  }, [isExpanded, storageKey]);

  const previewItems = items.slice(0, 3);
  const displayItems = isExpanded ? items : previewItems;
  const hasMore = items.length > 3;

  return (
    <StatsWidgetShell
      widgetId={widgetId}
      title={meta.title}
      icon={<span className={colors.text}>{icon}</span>}
      subtitle={`${items.length} unique ${meta.title.toLowerCase()}`}
      badge={
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", colors.bg, colors.text)}>
          {totalCount}
        </span>
      }
      action={
        <div className="rounded-lg p-1 text-gray-400 transition-colors group-hover:bg-white/5 group-hover:text-white">
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      }
      className={cn(colors.border, colors.bg, colors.glow, "rounded-2xl transition-all duration-300 hover:shadow-lg")}
      headerClassName="p-4"
      bodyClassName="px-4 pb-4"
      headerAsButton
      onHeaderClick={() => setIsExpanded((current) => !current)}
      isEmpty={items.length === 0}
      emptyState={
        <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-8 text-center">
          <p className="text-sm text-gray-400">No {meta.title.toLowerCase()} matched the current filters.</p>
        </div>
      }
    >
      <div className={cn("overflow-hidden transition-all duration-300 ease-out", isExpanded ? "max-h-[500px]" : "max-h-[180px]")}>
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
    </StatsWidgetShell>
  );
}
