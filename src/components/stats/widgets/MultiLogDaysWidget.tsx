import { useEffect, useState, type ReactNode } from "react";
import { Calendar, Captions, Check, Clock, RotateCcw, Star, Trophy } from "lucide-react";
import type { MultiLogDay } from "../../../lib/stats-logic";
import { useStatsWidgetEditContext } from "../StatsEditableWidgetFrame";
import { StatsWidgetShell } from "../StatsWidgetShell";
import { STATS_WIDGET_META } from "../stats-config";

interface MultiLogDaysWidgetProps {
  multiLogDays: MultiLogDay[];
  onDayClick: (date: string) => void;
}

const STORAGE_KEY = "stats-section-multi-log-days";
const PREVIEW_DAY_COUNT = 3;

function isGameType(entryType: string | null) {
  return (entryType || "").toLowerCase().includes("game");
}

function Badge({
  title,
  colorClass,
  icon,
}: {
  title: string;
  colorClass: string;
  icon: ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${colorClass}`}
    >
      {icon}
    </span>
  );
}

function formatMultiLogDate(dateString: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) {
    return dateString;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function MultiLogDaysWidget({ multiLogDays, onDayClick }: MultiLogDaysWidgetProps) {
  const meta = STATS_WIDGET_META["multi-log-days"];
  const [isExpanded, setIsExpanded] = useState(() => localStorage.getItem(STORAGE_KEY) === "true");
  const { isCustomizing } = useStatsWidgetEditContext();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isExpanded));
  }, [isExpanded]);

  const hasMore = multiLogDays.length > PREVIEW_DAY_COUNT;
  const visibleDays = isExpanded ? multiLogDays : multiLogDays.slice(0, PREVIEW_DAY_COUNT);

  return (
    <StatsWidgetShell
      widgetId={meta.id}
      title={meta.title}
      icon={<Calendar className="text-sky-400" size={20} />}
      subtitle={`${multiLogDays.length} ${multiLogDays.length === 1 ? "day" : "days"} with 2+ logs`}
      badge={
        <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-200">
          {multiLogDays.length}
        </span>
      }
      action={
        hasMore ? (
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="text-sm font-medium text-sky-300 transition-colors hover:text-sky-200"
          >
            {isExpanded ? "Show less" : `Show all ${multiLogDays.length}`}
          </button>
        ) : null
      }
      heightPreset={meta.heightPreset}
      fillBody
      bodyClassName="flex min-h-0 flex-1 flex-col"
      isEmpty={multiLogDays.length === 0}
      emptyState={
        <div className="flex h-full min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
          <p className="text-sm text-gray-400">No days with multiple logs matched the current filters.</p>
        </div>
      }
    >
      <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {visibleDays.map((day) => (
          <section
            key={day.date}
            className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!isCustomizing) {
                    onDayClick(day.date);
                  }
                }}
                disabled={isCustomizing}
                className="group text-left"
              >
                <time
                  dateTime={day.date}
                  className="text-base font-semibold text-white transition-colors group-hover:text-sky-300"
                >
                  {formatMultiLogDate(day.date)}
                </time>
              </button>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-gray-300">
                {day.entries.length} {day.entries.length === 1 ? "log" : "logs"}
              </span>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {day.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2.5"
                >
                  <div className="truncate text-sm font-medium text-white">{entry.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    {entry.entry_type ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-gray-300">
                        {entry.entry_type}
                      </span>
                    ) : null}
                    {entry.is_rewatch === 1 ? (
                      <Badge
                        title="Replay / Rewatch"
                        colorClass="border-amber-500/40 bg-amber-500/15 text-amber-300"
                        icon={<RotateCcw size={10} />}
                      />
                    ) : null}
                    {entry.own_local_copy === 1 ? (
                      <Badge
                        title="Own Local Copy"
                        colorClass="border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        icon={<Check size={10} />}
                      />
                    ) : null}
                    {entry.has_subtitles === 1 ? (
                      <Badge
                        title="Subtitles"
                        colorClass="border-orange-500/40 bg-orange-500/15 text-orange-300"
                        icon={<Captions size={10} />}
                      />
                    ) : null}
                    {isGameType(entry.entry_type) && entry.is_platinum === 1 ? (
                      <Badge
                        title="Platinum / 100%"
                        colorClass="border-cyan-400/40 bg-cyan-400/15 text-cyan-200"
                        icon={<Trophy size={10} />}
                      />
                    ) : null}
                    {isGameType(entry.entry_type) && entry.is_early_access === 1 ? (
                      <Badge
                        title="Early Access"
                        colorClass="border-violet-500/40 bg-violet-500/15 text-violet-300"
                        icon={<Clock size={10} />}
                      />
                    ) : null}
                    {typeof entry.review_score === "number" ? (
                      <span className="font-medium text-amber-300"><Star size={12} className="inline text-amber-300 align-middle" /> {entry.review_score}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </StatsWidgetShell>
  );
}
