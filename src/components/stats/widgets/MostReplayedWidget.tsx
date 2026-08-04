import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw, Star } from "lucide-react";
import { cn } from "../../../lib/utils_ui";
import type { MostReplayedItem, MostReplayedLog } from "../../../lib/stats-logic";
import { useStatsWidgetEditContext } from "../StatsEditableWidgetFrame";
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

function formatEventDate(dateString: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return dateString;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) return dateString;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatStripDate(dateString: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return dateString;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) return dateString;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(date);
}

function ReplayStrip({ logs }: { logs: MostReplayedLog[] }) {
  const datedLogs = useMemo(
    () =>
      logs
        .filter((log): log is MostReplayedLog & { completion_date: string } => log.completion_date !== null)
        .sort((left, right) => left.completion_date.localeCompare(right.completion_date)),
    [logs]
  );

  const firstTime = logs.filter((log) => !log.is_rewatch).length;

  return (
    <div>
      <div className="relative mt-2 h-1 w-full rounded-full bg-white/5">
        <div
          className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-gradient-to-r from-white/5 via-white/15 to-white/5"
          aria-hidden
        />
        {datedLogs.map((log, index) => {
          const first = datedLogs[0];
          const last = datedLogs[datedLogs.length - 1];
          const span = new Date(last.completion_date).getTime() - new Date(first.completion_date).getTime();
          const position =
            span === 0
              ? 50
              : ((new Date(log.completion_date).getTime() - new Date(first.completion_date).getTime()) / span) * 100;

          return (
            <div
              key={`${log.completion_date}-${index}`}
              className="group/dot absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${position}%` }}
            >
              <div
                className={cn(
                  "h-2.5 w-2.5 rounded-full border transition-transform duration-150 group-hover/dot:scale-125",
                  log.is_rewatch
                    ? "border-amber-400/60 bg-amber-400"
                    : "border-gray-400/60 bg-transparent"
                )}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2 py-1 text-[11px] font-medium text-gray-200 opacity-0 shadow-lg transition-opacity duration-150 group-hover/dot:opacity-100">
                {log.is_rewatch ? "Rewatch" : "First watch"} · {formatStripDate(log.completion_date)}
                {log.review_score !== null ? (
                  <>
                    {" · "}
                    <span className="text-amber-400">★{log.review_score}</span>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full border border-gray-400/60" />
          {firstTime} {firstTime === 1 ? "first" : "firsts"}
        </span>
        <span className="flex items-center gap-1.5 text-amber-400/70">
          <span className="inline-block h-1.5 w-1.5 rounded-full border border-amber-400/60 bg-amber-400" />
          {logs.filter((log) => log.is_rewatch).length} {logs.filter((log) => log.is_rewatch).length === 1 ? "rewatch" : "rewatches"}
        </span>
      </div>
    </div>
  );
}

export function MostReplayedWidget({ items }: MostReplayedWidgetProps) {
  const meta = STATS_WIDGET_META["most-replayed"];
  const totalCount = items.length;
  const { isCustomizing } = useStatsWidgetEditContext();
  const [isExpanded, setIsExpanded] = useState(
    () => localStorage.getItem("stats-section-most-replayed") === "true"
  );
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("stats-section-most-replayed", String(isExpanded));
  }, [isExpanded]);

  const previewItems = items.slice(0, 5);
  const displayItems = isExpanded ? items : previewItems;
  const hasMore = items.length > 5;

  const handleRowClick = (name: string) => {
    if (isCustomizing) return;
    setExpandedItem((current) => (current === name ? null : name));
  };

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
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto pr-1 space-y-2">
          {displayItems.map((item, index) => {
            const rank = index + 1;
            const isRowExpanded = expandedItem === item.name;
            const rewatchCount = item.logs.filter((log) => log.is_rewatch).length;

            return (
              <div
                key={`${item.name}-${index}`}
                className={cn(
                  "rounded-xl border transition-all duration-200",
                  isRowExpanded
                    ? "border-amber-500/15 bg-amber-500/[0.05]"
                    : "border-transparent hover:border-amber-500/10 hover:bg-amber-500/[0.04]"
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <button
                  type="button"
                  onClick={() => handleRowClick(item.name)}
                  disabled={isCustomizing}
                  className={cn(
                    "flex w-full items-start gap-3 p-2.5 text-left",
                    isCustomizing && "cursor-default opacity-75"
                  )}
                >
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
                      {rewatchCount > 0 ? (
                        <span className="text-amber-400/80">
                          <strong className="font-semibold text-amber-400">
                            {rewatchCount}×
                          </strong>{" "}
                          rewatched
                        </span>
                      ) : (
                        <span className="text-gray-500">Completed multiple times</span>
                      )}
                      {item.avg_score !== null ? (
                        <>
                          <span className="text-gray-500">·</span>
                          <span>
                            <Star size={12} className="inline text-amber-400 align-middle" />{" "}
                            <strong className="font-semibold text-gray-300">
                              {item.avg_score.toFixed(1)}
                            </strong>{" "}
                            avg
                          </span>
                        </>
                      ) : null}
                      <span className="ml-auto flex items-center gap-0.5 text-gray-500 transition-colors group-hover:text-amber-300/80">
                        {isRowExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {item.logs.length}×
                      </span>
                    </div>

                    <ReplayStrip logs={item.logs} />
                  </div>
                </button>

                {/* Expanded event log */}
                {isRowExpanded ? (
                  <div className="custom-scrollbar max-h-44 overflow-y-auto px-2.5 pb-2.5">
                    <div className="overflow-hidden rounded-lg border border-white/5 bg-black/20">
                      {item.logs.map((log, logIndex) => {
                        const rewatchOrdinal = item.logs
                          .slice(0, logIndex + 1)
                          .filter((candidate) => candidate.is_rewatch).length;
                        const label = log.is_rewatch
                          ? `Rewatch (${rewatchOrdinal}×)`
                          : "First watch";

                        return (
                          <div
                            key={`${item.name}-log-${logIndex}`}
                            className="flex items-center gap-3 px-3 py-1.5 text-xs transition-colors odd:bg-white/[0.02] hover:bg-white/5"
                          >
                            <span className="w-24 shrink-0 text-gray-400">
                              {log.completion_date ? formatEventDate(log.completion_date) : "No date"}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
                                log.is_rewatch
                                  ? "border-amber-400/20 bg-amber-500/10 text-amber-300"
                                  : "border-white/10 bg-white/5 text-gray-400"
                              )}
                            >
                              {label}
                            </span>
                            <span className="ml-auto flex items-center gap-1 font-semibold text-gray-300">
                              {log.review_score !== null ? (
                                <>
                                  <Star size={11} className="text-amber-400" />
                                  {log.review_score}
                                </>
                              ) : (
                                <span className="font-normal text-gray-500">Unrated</span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
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
