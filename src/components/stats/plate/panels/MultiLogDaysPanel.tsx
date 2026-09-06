import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarDays, Flame } from "lucide-react";
import { cn } from "../../../../lib/utils_ui";
import type { StatsEntry } from "../../../../lib/db";
import { formatShortDate } from "../../../../lib/dates";
import type { DailyCompletion, MultiLogDay } from "../../../../lib/stats-logic";
import { BingeHeatmap } from "../BingeHeatmap";
import { CoverImage, PanelEmptyState, PanelFrame } from "../plate-ui";
import { TooltipTitle, useHoverTooltip } from "../../../HoverTooltip";

interface MultiLogDaysPanelProps {
  multiLogDays: MultiLogDay[];
  /** Every entry in the selection — MultiLogDayEntry carries no artwork. */
  rangedEntries: StatsEntry[];
  /** Completion counts per calendar day — feeds the expanded binge map. */
  dailyCompletions: DailyCompletion[];
  /** Calendar window for the binge map; matches the timeline overlay. */
  activeYear: string;
  variant: "compact" | "expanded";
  onDateClick: (date: string) => void;
  onExpand?: () => void;
}

const MONTH_ABBREVIATIONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function splitDate(date: string) {
  return {
    day: date.slice(8, 10),
    month: MONTH_ABBREVIATIONS[Number(date.slice(5, 7)) - 1] ?? "",
    year: date.slice(0, 4),
  };
}

// Perfect 10s pop bright; the rest of the ramp stays quiet.
function scoreChipClass(score: number): string {
  if (score >= 10) return "bg-cyan-400 font-bold text-[#0b0b12]";
  if (score >= 8) return "bg-cyan-500/25 text-cyan-200";
  if (score >= 6) return "bg-white/10 text-gray-300";
  return "bg-white/5 text-gray-500";
}

function describeEntry(entry: MultiLogDay["entries"][number]): string {
  const parts: string[] = [];
  if (entry.entry_type) {
    parts.push(entry.entry_type);
  }
  if (entry.is_rewatch) {
    parts.push("Rewatch");
  }
  if (entry.is_platinum) {
    parts.push("Platinum");
  }
  if (entry.is_early_access) {
    parts.push("Early access");
  }
  return parts.join(" · ");
}

const PULSE_DURATION_MS = 1600;

export function MultiLogDaysPanel({
  multiLogDays,
  rangedEntries,
  dailyCompletions,
  activeYear,
  variant,
  onDateClick,
  onExpand,
}: MultiLogDaysPanelProps) {
  const { bindTooltip } = useHoverTooltip();
  const prefersReducedMotion = useReducedMotion();
  const isExpanded = variant === "expanded";

  // Shared between the binge map and the day list: hovering either surface
  // highlights the other, and locating a day pulses its row.
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [pulseDate, setPulseDate] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pulseTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (pulseTimerRef.current !== null) {
        window.clearTimeout(pulseTimerRef.current);
      }
    },
    []
  );

  const coverById = new Map(rangedEntries.map((entry) => [entry.id, entry.image_url]));

  const locateDay = (date: string) => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-date="${date}"]`)
      ?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
    setPulseDate(date);
    if (pulseTimerRef.current !== null) {
      window.clearTimeout(pulseTimerRef.current);
    }
    pulseTimerRef.current = window.setTimeout(() => setPulseDate(null), PULSE_DURATION_MS);
  };

  const renderDayTooltip = (day: MultiLogDay) => {
    const { day: dayRaw, month, year } = splitDate(day.date);
    const dayNumber = String(Number(dayRaw));
    const shown = day.entries.slice(0, 6);
    const overflow = day.entries.length - shown.length;

    return (
      <>
        <TooltipTitle>
          {dayNumber} {month} {year} · {day.entries.length} {day.entries.length === 1 ? "log" : "logs"}
        </TooltipTitle>
        <div className="mt-1.5 flex flex-col gap-1.5">
          {shown.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2">
              <span className="block h-10 w-7 shrink-0 overflow-hidden rounded-[3px] border border-white/10 bg-white/[0.04]">
                <CoverImage path={coverById.get(entry.id) ?? null} className="h-full w-full" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium leading-tight text-text">{entry.name}</span>
                <span className="block truncate text-[10.5px] leading-tight text-gray-500">
                  {describeEntry(entry)}
                </span>
              </span>
              {typeof entry.review_score === "number" ? (
                <span
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] tabular-nums",
                    scoreChipClass(entry.review_score)
                  )}
                >
                  {entry.review_score}
                </span>
              ) : null}
            </div>
          ))}
          {overflow > 0 ? <span className="text-[11px] text-gray-500">+{overflow} more</span> : null}
        </div>
      </>
    );
  };

  if (multiLogDays.length === 0) {
    return (
      <PanelFrame
        title="Multiple Logs Per Day"
        subtitle="0 days with 2+ logs"
        accent="cyan"
        icon={<CalendarDays size={13} />}
        onExpand={onExpand}
      >
        <PanelEmptyState message="No days with multiple logs in the current selection." />
      </PanelFrame>
    );
  }

  if (!isExpanded) {
    return (
      <PanelFrame
        title="Multiple Logs Per Day"
        subtitle={`${multiLogDays.length} ${multiLogDays.length === 1 ? "day" : "days"} with 2+ logs`}
        accent="cyan"
        icon={<CalendarDays size={13} />}
        onExpand={onExpand}
        bodyClassName="gap-2"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          {multiLogDays.slice(0, 5).map((day) => {
            const { day: dayNumber, month } = splitDate(day.date);
            const shown = day.entries.slice(0, 4);
            const overflow = day.entries.length - shown.length;

            return (
              <button
                key={day.date}
                type="button"
                onClick={() => onDateClick(day.date)}
                {...bindTooltip(renderDayTooltip(day), { width: 320 })}
                className="group flex shrink-0 items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5 text-left transition-colors hover:border-white/15 hover:bg-white/[0.06]"
              >
                <span className="flex w-9 shrink-0 flex-col items-center">
                  <span className="text-[15px] font-bold leading-none text-white">{dayNumber}</span>
                  <span className="mt-0.5 text-[8.5px] font-medium uppercase tracking-[0.1em] text-gray-500">
                    {month}
                  </span>
                </span>

                <span className="flex min-w-0 flex-1 items-center gap-1">
                  {shown.map((entry) => (
                    <span
                      key={entry.id}
                      className="block h-11 w-8 shrink-0 overflow-hidden rounded-[3px] border border-white/10 bg-white/[0.04]"
                    >
                      <CoverImage
                        path={coverById.get(entry.id) ?? null}
                        className="h-full w-full"
                        imageClassName="transition-transform duration-200 group-hover:scale-[1.06]"
                      />
                    </span>
                  ))}
                  {overflow > 0 ? (
                    <span className="shrink-0 text-[9px] font-medium text-gray-500">+{overflow}</span>
                  ) : null}
                </span>

                <span className="shrink-0 rounded bg-cyan-500/15 px-1.5 py-px text-[9px] font-semibold tabular-nums text-cyan-300">
                  {day.entries.length}
                </span>
              </button>
            );
          })}
        </div>
      </PanelFrame>
    );
  }

  const multiLogDates = new Set(multiLogDays.map((day) => day.date));
  const busiestDay = multiLogDays.reduce<MultiLogDay | null>(
    (busiest, day) => (!busiest || day.entries.length > busiest.entries.length ? day : busiest),
    null
  );

  // Mount-only stagger — opening the overlay fires it once; never keyed to the
  // range, so it cannot re-animate on selection changes.
  const reveal = (order: number) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.3, delay: Math.min(order * 0.04, 0.5), ease: "easeOut" as const },
        };

  return (
    <div className="flex flex-col gap-4">
      <motion.section
        {...reveal(0)}
        className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-4"
      >
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-white">
            <Flame size={14} className="text-cyan-300" />
            Binge map
          </h3>
          <p className="text-[12px] text-gray-500">
            {multiLogDays.length} {multiLogDays.length === 1 ? "day" : "days"} with 2+ logs
            {busiestDay ? ` · busiest: ${busiestDay.entries.length} on ${formatShortDate(busiestDay.date)}` : ""}.
            Click a cyan cell to locate the day below.
          </p>
        </div>
        <BingeHeatmap
          dailyCompletions={dailyCompletions}
          activeYear={activeYear}
          multiLogDates={multiLogDates}
          hoveredDate={hoveredDate}
          onHoverDate={setHoveredDate}
          onLocateDate={locateDay}
        />
      </motion.section>

      <div ref={listRef} className="flex flex-col gap-2">
        {multiLogDays.map((day, index) => {
          const { day: dayRaw, month, year } = splitDate(day.date);
          const dayNumber = String(Number(dayRaw));
          const shown = day.entries.slice(0, 10);
          const overflow = day.entries.length - shown.length;
          const scores = day.entries
            .map((entry) => entry.review_score)
            .filter((score): score is number => typeof score === "number")
            .slice(0, 10);
          const dimmed = hoveredDate !== null && hoveredDate !== day.date;
          const tooltipProps = bindTooltip(renderDayTooltip(day), { width: 320 });

          return (
            <div
              key={day.date}
              data-date={day.date}
              className={cn(
                "rounded-xl transition-opacity duration-150",
                pulseDate === day.date && "ring-1 ring-cyan-300/70"
              )}
              style={{ opacity: dimmed ? 0.45 : 1 }}
            >
              <motion.button
                type="button"
                onClick={() => onDateClick(day.date)}
                {...tooltipProps}
                onPointerEnter={(event) => {
                  tooltipProps.onPointerEnter(event);
                  setHoveredDate(day.date);
                }}
                onPointerLeave={(event) => {
                  tooltipProps.onPointerLeave(event);
                  setHoveredDate(null);
                }}
                onFocus={(event) => {
                  tooltipProps.onFocus(event);
                  setHoveredDate(day.date);
                }}
                onBlur={(event) => {
                  tooltipProps.onBlur(event);
                  setHoveredDate(null);
                }}
                {...reveal(index + 1)}
                className="group flex w-full items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-colors hover:border-cyan-400/30 hover:bg-cyan-500/[0.05]"
              >
                <span className="flex w-14 shrink-0 flex-col items-center border-r border-white/[0.06] pr-3">
                  <span className="text-[24px] font-bold leading-none text-white">{dayNumber}</span>
                  <span className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-cyan-300/80">
                    {month}
                  </span>
                  <span className="mt-0.5 text-[9px] text-gray-600">{year}</span>
                </span>

                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  {shown.map((entry) => (
                    <span
                      key={entry.id}
                      className="block h-16 w-12 shrink-0 overflow-hidden rounded-[4px] border border-white/10 bg-white/[0.04]"
                    >
                      <CoverImage
                        path={coverById.get(entry.id) ?? null}
                        className="h-full w-full"
                        imageClassName="transition-transform duration-200 group-hover:scale-[1.06]"
                      />
                    </span>
                  ))}
                  {overflow > 0 ? (
                    <span className="shrink-0 text-[10px] font-medium text-gray-500">+{overflow}</span>
                  ) : null}
                </span>

                {scores.length > 0 ? (
                  <span className="flex max-w-[13rem] shrink-0 flex-wrap items-center justify-end gap-1">
                    {scores.map((score, scoreIndex) => (
                      <span
                        key={`${score}-${scoreIndex}`}
                        className={cn(
                          "min-w-[1.5rem] rounded-md px-1 py-0.5 text-center text-[10px] tabular-nums",
                          scoreChipClass(score)
                        )}
                      >
                        {score}
                      </span>
                    ))}
                  </span>
                ) : null}

                <span className="flex shrink-0 flex-col items-center">
                  <span className="rounded-lg border border-cyan-400/20 bg-cyan-500/15 px-2 py-1 text-[13px] font-bold tabular-nums text-cyan-200">
                    {day.entries.length}
                  </span>
                  <span className="mt-0.5 text-[8px] font-medium uppercase tracking-[0.14em] text-gray-600">
                    {day.entries.length === 1 ? "log" : "logs"}
                  </span>
                </span>
              </motion.button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
