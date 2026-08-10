import { cn } from "../../../lib/utils_ui";
import type { DailyCompletion } from "../../../lib/stats-logic";
import { formatShortDate } from "../../../lib/dates";
import { TooltipDetail, TooltipTitle, useHoverTooltip } from "../../HoverTooltip";

interface DayHeatmapProps {
  dailyCompletions: DailyCompletion[];
  activeYear: string;
  onDateClick: (date: string) => void;
}

const HEATMAP_LEVELS = [
  "bg-white/[0.05]",
  "bg-purple-500/25",
  "bg-purple-500/45",
  "bg-purple-500/65",
  "bg-purple-500/85",
  "bg-purple-400",
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type HeatmapDay = { date: string | null; count: number };

function levelClass(count: number): string {
  return HEATMAP_LEVELS[Math.min(count, HEATMAP_LEVELS.length - 1)];
}

function parseCalendarDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Sunday-aligned columns spanning either the active calendar year or, on All
// Time, the 365 days ending at the most recent completion.
function buildColumns(dailyCompletions: DailyCompletion[], activeYear: string) {
  let startDate: Date;
  let endDate: Date;

  if (activeYear !== "All Time") {
    const year = Number(activeYear);
    startDate = new Date(year, 0, 1);
    endDate = new Date(year, 11, 31);
  } else {
    const timestamps = dailyCompletions.map((day) => parseCalendarDate(day.date).getTime()).filter(Number.isFinite);
    endDate = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : new Date();
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 364);
  }

  const counts = new Map(dailyCompletions.map((day) => [day.date, day.count]));
  const days: HeatmapDay[] = [];
  const cursor = new Date(startDate);

  for (let index = 0; index < cursor.getDay(); index += 1) {
    days.push({ date: null, count: 0 });
  }

  while (cursor <= endDate) {
    const date = formatCalendarDate(cursor);
    days.push({ date, count: counts.get(date) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const columns: HeatmapDay[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    columns.push(days.slice(index, index + 7));
  }

  const monthTicks: Array<{ label: string; columnIndex: number }> = [];
  let lastMonth = -1;

  columns.forEach((column, columnIndex) => {
    const firstDated = column.find((day) => day.date);
    if (!firstDated?.date) {
      return;
    }

    const month = Number(firstDated.date.slice(5, 7)) - 1;
    if (month !== lastMonth) {
      lastMonth = month;
      monthTicks.push({ label: MONTH_LABELS[month], columnIndex });
    }
  });

  return { columns, monthTicks };
}

export function DayHeatmap({ dailyCompletions, activeYear, onDateClick }: DayHeatmapProps) {
  const { bindTooltip } = useHoverTooltip();
  const { columns, monthTicks } = buildColumns(dailyCompletions, activeYear);
  const maxCount = dailyCompletions.reduce((max, day) => Math.max(max, day.count), 0);

  if (dailyCompletions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
        <p className="text-sm text-gray-500">No completion dates in the current selection.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        <div className="flex shrink-0 flex-col gap-[3px] pr-1 pt-[22px]">
          {WEEKDAY_LABELS.map((label, index) => (
            <span key={label} className="h-3 text-[10px] leading-3 text-gray-600">
              {index % 2 === 1 ? label : ""}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto pb-1">
          <div className="inline-flex flex-col gap-1">
            <div className="relative h-4">
              {monthTicks.map(({ label, columnIndex }) => (
                <span
                  key={`${label}-${columnIndex}`}
                  className="absolute text-[10px] text-gray-500"
                  style={{ left: `${columnIndex * 15}px` }}
                >
                  {label}
                </span>
              ))}
            </div>

            <div className="flex gap-[3px]">
              {columns.map((column, columnIndex) => (
                <div key={columnIndex} className="flex flex-col gap-[3px]">
                  {column.map((day, dayIndex) => (
                    <button
                      key={dayIndex}
                      type="button"
                      disabled={!day.date || day.count === 0}
                      onClick={() => day.date && onDateClick(day.date)}
                      {...bindTooltip(
                        day.date && day.count > 0 ? (
                          <>
                            <TooltipTitle>{formatShortDate(day.date)}</TooltipTitle>
                            <TooltipDetail>
                              {day.count} {day.count === 1 ? "entry" : "entries"} · click to open
                            </TooltipDetail>
                          </>
                        ) : null
                      )}
                      className={cn(
                        "h-3 w-3 rounded-[2px]",
                        day.date ? levelClass(day.count) : "bg-transparent",
                        day.date && day.count > 0
                          ? "cursor-pointer transition-shadow hover:ring-1 hover:ring-white/40"
                          : "cursor-default"
                      )}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <span>Less</span>
        <div className="flex gap-1">
          {HEATMAP_LEVELS.map((level) => (
            <span key={level} className={cn("h-3 w-3 rounded-[2px]", level)} />
          ))}
        </div>
        <span>More</span>
        {maxCount > 5 ? <span className="text-gray-600">(busiest day: {maxCount})</span> : null}
      </div>
    </div>
  );
}
