import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { cn } from "../../../lib/utils_ui";
import type { MostReplayedItem } from "../../../lib/stats-logic";
import { StatsWidgetShell } from "../StatsWidgetShell";
import { STATS_WIDGET_META } from "../stats-config";

interface MostReplayedWidgetProps {
  items: MostReplayedItem[];
}

const AMBER_COLORS = {
  bg: "bg-amber-500/10",
  border: "border-amber-500/20",
  bar: "bg-amber-500",
  barBg: "bg-amber-500/20",
  text: "text-amber-400",
  glow: "hover:shadow-amber-500/10",
};

const TYPE_COLORS: Record<string, string> = {
  game: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  show: "bg-sky-500/15 text-sky-400 border-sky-500/20",
  "k-drama": "bg-rose-500/15 text-rose-400 border-rose-500/20",
  anime: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  book: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  movie: "bg-indigo-500/15 text-indigo-400 border-indigo-500/20",
  jav: "bg-pink-500/15 text-pink-400 border-pink-500/20",
  hentai: "bg-purple-500/15 text-purple-400 border-purple-500/20",
};

function getTypeColor(entryType: string | null): string {
  if (!entryType) return "bg-gray-500/15 text-gray-400 border-gray-500/20";
  const key = entryType.trim().toLowerCase();
  return TYPE_COLORS[key] ?? "bg-gray-500/15 text-gray-400 border-gray-500/20";
}

export function MostReplayedWidget({ items }: MostReplayedWidgetProps) {
  const meta = STATS_WIDGET_META["most-replayed"];
  const totalCount = items.length;
  const maxCompletions = items.length > 0 ? items[0].total_completions : 1;
  const [isExpanded, setIsExpanded] = useState(
    () => localStorage.getItem("stats-section-most-replayed") === "true"
  );

  useEffect(() => {
    localStorage.setItem("stats-section-most-replayed", String(isExpanded));
  }, [isExpanded]);

  const previewItems = items.slice(0, 5);
  const displayItems = isExpanded ? items : previewItems;
  const hasMore = items.length > 5;

  return (
    <StatsWidgetShell
      widgetId={meta.id}
      title={meta.title}
      icon={<RotateCcw className="text-amber-400" size={20} />}
      subtitle="Repeated entries ranked by total completions"
      heightPreset={meta.heightPreset}
      fillBody
      badge={
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            AMBER_COLORS.bg,
            AMBER_COLORS.text
          )}
        >
          {totalCount}
        </span>
      }
      action={
        <div className="rounded-lg p-1 text-gray-400 transition-colors group-hover:bg-white/5 group-hover:text-white">
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      }
      className={cn(AMBER_COLORS.border, AMBER_COLORS.bg, AMBER_COLORS.glow, "transition-all duration-300 hover:shadow-lg", isExpanded && hasMore && "min-h-[440px]")}
      headerClassName="p-4"
      bodyClassName="flex min-h-0 flex-1 flex-col px-4 pb-4"
      headerAsButton
      onHeaderClick={() => setIsExpanded((current) => !current)}
      isEmpty={items.length === 0}
      emptyState={
        <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed border-amber-500/10 bg-black/10 px-4 py-8 text-center">
          <p className="text-sm text-gray-400">
            No replayed entries matched the current filters.
          </p>
        </div>
      }
    >
      <div
        className={cn(
          "flex flex-1 min-h-0 flex-col overflow-hidden transition-all duration-300 ease-out",
          isExpanded ? "max-h-[600px]" : "max-h-[240px]"
        )}
      >
        <div
          className={cn(
            "space-y-0.5",
            isExpanded && "custom-scrollbar max-h-[560px] overflow-y-auto pr-1"
          )}
        >
          {displayItems.map((item, index) => {
            const barWidth = (item.total_completions / maxCompletions) * 100;
            const rank = index + 1;

            return (
              <div
                key={`${item.name}-${index}`}
                className="group rounded-xl border border-transparent p-2.5 transition-all duration-200 hover:border-amber-500/10 hover:bg-amber-500/[0.04]"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start gap-3">
                  {/* Rank */}
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-xs font-bold text-amber-400">
                    {rank}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-gray-200 transition-colors group-hover:text-white">
                        {item.name}
                      </span>
                      {/* Entry type pill */}
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none",
                          getTypeColor(item.entry_type)
                        )}
                      >
                        {item.entry_type ?? "unknown"}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                      {item.rewatch_count > 0 ? (
                        <span className="text-amber-400/80">
                          Rewatched{" "}
                          <strong className="font-semibold text-amber-400">
                            {item.rewatch_count}×
                          </strong>
                        </span>
                      ) : (
                        <span className="text-gray-500">Completed multiple times</span>
                      )}
                      {item.avg_score !== null ? (
                        <>
                          <span className="text-gray-500">·</span>
                          <span>
                            ⭐{" "}
                            <strong className="font-semibold text-gray-300">
                              {item.avg_score.toFixed(1)}
                            </strong>
                          </span>
                        </>
                      ) : null}
                    </div>

                    {/* Progress bar */}
                    <div
                      className={cn("mt-2 h-1 w-full rounded-full", AMBER_COLORS.barBg)}
                    >
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", AMBER_COLORS.bar)}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>

                  {/* Total completions badge */}
                  <div className="flex shrink-0 items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1">
                    <span className="text-xs font-bold text-white">×{item.total_completions}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {!isExpanded && hasMore ? (
            <div className="pt-2 text-center">
              <span className="text-xs text-gray-500">
                +{items.length - 5} more · Click to expand
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </StatsWidgetShell>
  );
}
