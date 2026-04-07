import { Calendar } from "lucide-react";
import { StatsWidgetShell } from "../StatsWidgetShell";
import { STATS_WIDGET_META } from "../stats-config";
import type { DailyCompletion } from "../../../lib/stats-logic";

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

function getColorForCount(count: number): string {
  if (count === 0) return HEATMAP_COLORS[0];
  if (count === 1) return HEATMAP_COLORS[1];
  if (count === 2) return HEATMAP_COLORS[2];
  if (count === 3) return HEATMAP_COLORS[3];
  if (count === 4) return HEATMAP_COLORS[4];
  return HEATMAP_COLORS[5];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function buildHeatmapData(dailyCompletions: DailyCompletion[], activeYear: string) {
  // Determine date range
  let startDate: Date;
  let endDate: Date;

  if (activeYear !== "All Time") {
    startDate = new Date(`${activeYear}-01-01`);
    endDate = new Date(`${activeYear}-12-31`);
  } else {
    // Show last 365 days of data
    const dates = dailyCompletions.map((d) => new Date(d.date));
    const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date();
    endDate = maxDate;
    startDate = new Date(maxDate);
    startDate.setDate(startDate.getDate() - 364);
  }

  // Build completion map
  const completionMap = new Map(dailyCompletions.map((d) => [d.date, d.count]));

  // Build weeks array (each week is an array of 7 days)
  const weeks: Array<{ date: string | null; count: number; dayOfWeek: number }> = [];
  const currentDate = new Date(startDate);

  // Pad start to align with Sunday
  const startDayOfWeek = currentDate.getDay();
  for (let i = 0; i < startDayOfWeek; i++) {
    weeks.push({ date: null, count: 0, dayOfWeek: i });
  }

  // Fill in actual dates
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split("T")[0];
    weeks.push({
      date: dateStr,
      count: completionMap.get(dateStr) ?? 0,
      dayOfWeek: currentDate.getDay(),
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Group into columns (weeks)
  const columns: Array<Array<{ date: string | null; count: number }>> = [];
  for (let i = 0; i < weeks.length; i += 7) {
    columns.push(weeks.slice(i, i + 7).map((day) => ({ date: day.date, count: day.count })));
  }

  // Calculate month positions for labels
  const monthPositions: Array<{ label: string; columnIndex: number }> = [];
  let currentMonth = -1;

  columns.forEach((column, index) => {
    const firstDayWithDate = column.find((day) => day.date);
    if (firstDayWithDate?.date) {
      const month = new Date(firstDayWithDate.date).getMonth();
      if (month !== currentMonth) {
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
        {/* Month labels */}
        <div className="relative h-5">
          {monthPositions.map(({ label, columnIndex }) => (
            <div
              key={`${label}-${columnIndex}`}
              className="absolute text-xs text-gray-400"
              style={{ left: `${columnIndex * 16}px` }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Heatmap grid */}
        <div className="flex gap-1">
          {/* Weekday labels */}
          <div className="flex flex-col gap-1 pr-2">
            {WEEKDAY_LABELS.map((day, index) => (
              <div key={day} className="h-3 text-[10px] leading-3 text-gray-500">
                {index % 2 === 0 ? day : ""}
              </div>
            ))}
          </div>

          {/* Heatmap columns */}
          <div className="flex gap-1 overflow-x-auto pb-2">
            {columns.map((column, colIndex) => (
              <div key={colIndex} className="flex flex-col gap-1">
                {column.map((day, dayIndex) => (
                  <button
                    key={dayIndex}
                    type="button"
                    disabled={!day.date || day.count === 0}
                    onClick={() => day.date && onDateClick(day.date)}
                    className={`h-3 w-3 rounded-sm ${day.date ? getColorForCount(day.count) : "bg-transparent"} ${
                      day.date && day.count > 0
                        ? "cursor-pointer transition-all hover:ring-1 hover:ring-white/30"
                        : "cursor-default"
                    } disabled:opacity-50`}
                    title={
                      day.date
                        ? `${formatDate(day.date)}: ${day.count} ${day.count === 1 ? "entry" : "entries"}`
                        : undefined
                    }
                  />
                ))}
              </div>
            ))}
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
    </StatsWidgetShell>
  );
}
