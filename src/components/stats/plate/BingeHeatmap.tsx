import { cn } from "../../../lib/utils_ui";
import type { DailyCompletion } from "../../../lib/stats-logic";
import { formatShortDate } from "../../../lib/dates";
import { TooltipDetail, TooltipTitle, useHoverTooltip } from "../../HoverTooltip";
import { buildColumns } from "./DayHeatmap";

interface BingeHeatmapProps {
  dailyCompletions: DailyCompletion[];
  activeYear: string;
  /** Dates with 2+ logs — the only clickable/locatable cells. */
  multiLogDates: Set<string>;
  /** The date highlighted by the other surface (day list), or null. */
  hoveredDate: string | null;
  onHoverDate: (date: string | null) => void;
  /** Click on a multi-log cell: locate that day in the list below. */
  onLocateDate: (date: string) => void;
}

// Only binge days carry colour: 0–1 log days stay neutral greys so the cyan
// ramp reads exclusively as "multiple logs this day". Index = completion count,
// clamped at the top.
const BINGE_LEVELS = [
  "bg-white/[0.04]",
  "bg-white/[0.10]",
  "bg-cyan-500/30",
  "bg-cyan-500/50",
  "bg-cyan-500/70",
  "bg-cyan-400/90",
  "bg-cyan-300",
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function bingeLevelClass(count: number): string {
  return BINGE_LEVELS[Math.min(count, BINGE_LEVELS.length - 1)];
}

/**
 * The multi-log-days expanded view's landing visual: the same Sunday-aligned
 * calendar as DayHeatmap, restyled so cyan intensity marks binge days. Cells
 * locate the matching day row in the list below instead of opening the date
 * modal — the rows themselves keep that job.
 */
export function BingeHeatmap({
  dailyCompletions,
  activeYear,
  multiLogDates,
  hoveredDate,
  onHoverDate,
  onLocateDate,
}: BingeHeatmapProps) {
  const { bindTooltip } = useHoverTooltip();
  const { columns, monthTicks } = buildColumns(dailyCompletions, activeYear);
  const maxCount = dailyCompletions.reduce((max, day) => Math.max(max, day.count), 0);

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
                  {column.map((day, dayIndex) => {
                    const isBingeDay = !!day.date && multiLogDates.has(day.date);
                    const tooltipProps = bindTooltip(
                      day.date && day.count > 0 ? (
                        <>
                          <TooltipTitle>{formatShortDate(day.date)}</TooltipTitle>
                          <TooltipDetail>
                            {day.count} {day.count === 1 ? "log" : "logs"}
                            {isBingeDay ? " · click to locate below" : ""}
                          </TooltipDetail>
                        </>
                      ) : null
                    );

                    return (
                      <button
                        key={dayIndex}
                        type="button"
                        disabled={!isBingeDay}
                        onClick={() => day.date && onLocateDate(day.date)}
                        {...tooltipProps}
                        onPointerEnter={(event) => {
                          tooltipProps.onPointerEnter(event);
                          if (day.date) {
                            onHoverDate(day.date);
                          }
                        }}
                        onPointerLeave={(event) => {
                          tooltipProps.onPointerLeave(event);
                          onHoverDate(null);
                        }}
                        onFocus={(event) => {
                          tooltipProps.onFocus(event);
                          if (day.date) {
                            onHoverDate(day.date);
                          }
                        }}
                        onBlur={(event) => {
                          tooltipProps.onBlur(event);
                          onHoverDate(null);
                        }}
                        className={cn(
                          "h-3 w-3 shrink-0 rounded-[2px] transition-all duration-100",
                          day.date ? bingeLevelClass(day.count) : "bg-transparent",
                          isBingeDay ? "cursor-pointer" : "cursor-default",
                          day.date && hoveredDate === day.date && "scale-125 ring-1 ring-cyan-300"
                        )}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <span>Less</span>
        <div className="flex gap-1">
          {BINGE_LEVELS.map((level) => (
            <span key={level} className={cn("h-3 w-3 rounded-[2px]", level)} />
          ))}
        </div>
        <span>More</span>
        <span className="text-gray-600">
          · cyan = 2+ logs{maxCount > 6 ? ` · busiest day: ${maxCount}` : ""}
        </span>
      </div>
    </div>
  );
}
