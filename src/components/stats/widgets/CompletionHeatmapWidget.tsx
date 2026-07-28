import { Calendar } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StatsWidgetShell } from "../StatsWidgetShell";
import { STATS_WIDGET_META } from "../stats-config";
import type { DailyCompletion } from "../../../lib/stats-logic";
import { formatShortDate } from "../../../lib/dates";

interface CompletionHeatmapWidgetProps {
  dailyCompletions: DailyCompletion[];
  activeYear: string;
  onDateClick: (date: string) => void;
}

const HEATMAP_COLORS = [
  "bg-gray-800", // 0 entries
  "bg-emerald-900/50", // 1 entry
  "bg-emerald-700/60", // 2 entries
  "bg-emerald-600/70", // 3 entries
  "bg-emerald-500/80", // 4 entries
  "bg-emerald-400", // 5+ entries
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HEATMAP_COLUMN_WIDTH = 16;
const HEATMAP_COLUMN_GAP = 4;

type HeatmapDay = { date: string | null; count: number };

function getColorForCount(count: number): string {
  if (count === 0) return HEATMAP_COLORS[0];
  if (count === 1) return HEATMAP_COLORS[1];
  if (count === 2) return HEATMAP_COLORS[2];
  if (count === 3) return HEATMAP_COLORS[3];
  if (count === 4) return HEATMAP_COLORS[4];
  return HEATMAP_COLORS[5];
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

function getMonthIndex(date: string): number {
  return Number(date.slice(5, 7)) - 1;
}

function buildHeatmapData(dailyCompletions: DailyCompletion[], activeYear: string) {
  // Determine date range
  let startDate: Date;
  let endDate: Date;

  if (activeYear !== "All Time") {
    const year = Number(activeYear);
    startDate = new Date(year, 0, 1);
    endDate = new Date(year, 11, 31);
  } else {
    // Show last 365 days of data
    const timestamps = dailyCompletions
      .map((d) => parseCalendarDate(d.date).getTime())
      .filter(Number.isFinite);
    const maxDate = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : new Date();
    endDate = maxDate;
    startDate = new Date(maxDate);
    startDate.setDate(startDate.getDate() - 364);
  }

  // Build completion map
  const completionMap = new Map(dailyCompletions.map((d) => [d.date, d.count]));

  // Build weeks array (each week is an array of 7 days)
  const weeks: HeatmapDay[] = [];
  const currentDate = new Date(startDate);

  // Pad start to align with Sunday
  const startDayOfWeek = currentDate.getDay();
  for (let i = 0; i < startDayOfWeek; i++) {
    weeks.push({ date: null, count: 0 });
  }

  // Fill in actual dates
  while (currentDate <= endDate) {
    const dateStr = formatCalendarDate(currentDate);
    weeks.push({
      date: dateStr,
      count: completionMap.get(dateStr) ?? 0,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Group into columns (weeks)
  const columns: HeatmapDay[][] = [];
  for (let i = 0; i < weeks.length; i += 7) {
    columns.push(weeks.slice(i, i + 7));
  }

  // Calculate month positions for labels
  const monthPositions: Array<{ label: string; columnIndex: number }> = [];
  let currentMonth = -1;

  columns.forEach((column, index) => {
    const firstDayWithDate = column.find((day) => day.date);
    if (firstDayWithDate?.date) {
      const month = getMonthIndex(firstDayWithDate.date);
      if (month >= 0 && month < MONTH_LABELS.length && month !== currentMonth) {
        currentMonth = month;
        monthPositions.push({ label: MONTH_LABELS[month], columnIndex: index });
      }
    }
  });

  return { columns, monthPositions };
}

export function CompletionHeatmapWidget({ dailyCompletions, activeYear, onDateClick }: CompletionHeatmapWidgetProps) {
  const meta = STATS_WIDGET_META["completion-heatmap"];
  const { columns, monthPositions } = buildHeatmapData(dailyCompletions, activeYear);

  const hasData = dailyCompletions.length > 0;
  const maxCount = hasData ? Math.max(...dailyCompletions.map((d) => d.count)) : 0;
  const heatmapWidth = columns.length > 0 ? columns.length * HEATMAP_COLUMN_WIDTH - HEATMAP_COLUMN_GAP : 0;

  // Single shared hover tooltip for the whole heatmap. Tracking one hovered
  // day (plus its anchor rect) avoids creating a portal element per cell —
  // important since a year renders ~365 tiny buttons.
  const [hoveredDay, setHoveredDay] = useState<{ day: HeatmapDay; rect: DOMRect } | null>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const clearHover = useCallback(() => {
    clearTimeout(tooltipTimeoutRef.current);
    setHoveredDay(null);
  }, []);

  useEffect(() => {
    return () => clearTimeout(tooltipTimeoutRef.current);
  }, []);

  // Dismiss the tooltip on any scroll or resize so it never floats away from
  // its anchor cell (the heatmap body scrolls horizontally, and the page
  // scrolls vertically). Re-positioning would be misleading since the cell
  // under the cursor changes; just hide it.
  useEffect(() => {
    if (!hoveredDay) return;
    const handle = () => clearHover();
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [hoveredDay, clearHover]);

  const handleCellEnter = useCallback((day: HeatmapDay, el: HTMLButtonElement) => {
    if (!day.date || day.count === 0) return;
    clearTimeout(tooltipTimeoutRef.current);
    tooltipTimeoutRef.current = setTimeout(() => {
      setHoveredDay({ day, rect: el.getBoundingClientRect() });
    }, 200);
  }, []);

  const handleCellLeave = useCallback(() => {
    clearTimeout(tooltipTimeoutRef.current);
    setHoveredDay(null);
  }, []);

  // Compute portal position — centered above the cell, flipped below when
  // there isn't enough headroom. Mirrors the BacklogTooltip placement logic.
  const tooltipPos = (() => {
    if (!hoveredDay) return null;
    const { rect } = hoveredDay;
    const tooltipWidth = 180;
    const tooltipHeight = 64;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));
    const spaceAbove = rect.top;
    const placeBelow = spaceAbove < tooltipHeight + 8;
    const top = placeBelow ? rect.bottom + 8 : rect.top - 8;
    return { top, left, placeBelow, tooltipWidth };
  })();

  return (
    <StatsWidgetShell
      widgetId={meta.id}
      title={meta.title}
      icon={<Calendar className="text-emerald-400" size={20} />}
      subtitle={activeYear === "All Time" ? "Last 365 days" : activeYear}
      heightPreset={meta.heightPreset}
      fillBody
      isEmpty={!hasData}
      emptyState={
        <div className="flex h-full min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
          <p className="text-sm text-gray-400">
            No completion data available for the selected filters.
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Heatmap grid */}
        <div className="flex gap-1">
          {/* Weekday labels */}
          <div className="flex shrink-0 flex-col gap-1 pr-2 pt-9">
            {WEEKDAY_LABELS.map((day, index) => (
              <div key={day} className="h-3 text-[10px] leading-3 text-gray-500">
                {index % 2 === 0 ? day : ""}
              </div>
            ))}
          </div>

          <div className="min-w-0 overflow-x-auto pb-2">
            <div style={{ width: `${heatmapWidth}px` }}>
              {/* Month labels */}
              <div className="relative mb-4 h-5">
                {monthPositions.map(({ label, columnIndex }) => (
                  <div
                    key={`${label}-${columnIndex}`}
                    className="absolute text-xs text-gray-400"
                    style={{ left: `${columnIndex * HEATMAP_COLUMN_WIDTH}px` }}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Heatmap columns */}
              <div className="flex gap-1">
                {columns.map((column, colIndex) => (
                  <div key={colIndex} className="flex flex-col gap-1">
                    {column.map((day, dayIndex) => (
                      <button
                        key={dayIndex}
                        type="button"
                        disabled={!day.date || day.count === 0}
                        onClick={() => {
                          handleCellLeave();
                          if (day.date) onDateClick(day.date);
                        }}
                        onMouseEnter={(e) => handleCellEnter(day, e.currentTarget)}
                        onMouseLeave={handleCellLeave}
                        className={`h-3 w-3 rounded-sm ${day.date ? getColorForCount(day.count) : "bg-transparent"} ${
                          day.date && day.count > 0
                            ? "cursor-pointer transition-all hover:ring-1 hover:ring-white/30"
                            : "cursor-default"
                        } disabled:opacity-50`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>Less</span>
          <div className="flex gap-1">
            {HEATMAP_COLORS.map((color, index) => (
              <div key={index} className={`h-3 w-3 rounded-sm ${color}`} />
            ))}
          </div>
          <span>More</span>
          {maxCount > 5 && <span className="text-gray-500">(max: {maxCount})</span>}
        </div>
      </div>
      {hoveredDay && tooltipPos && hoveredDay.day.date && createPortal(
        <div
          className="glass-tooltip fixed z-[9999] rounded-xl px-4 py-3"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            width: tooltipPos.tooltipWidth,
            transform: tooltipPos.placeBelow ? undefined : "translateY(-100%)",
          }}
        >
          <div className="text-sm font-semibold text-text leading-tight">
            {formatShortDate(hoveredDay.day.date)}
          </div>
          <div className="mt-1 text-sm text-text-muted">
            {hoveredDay.day.count} {hoveredDay.day.count === 1 ? "entry" : "entries"}
          </div>
        </div>,
        document.body
      )}
    </StatsWidgetShell>
  );
}
