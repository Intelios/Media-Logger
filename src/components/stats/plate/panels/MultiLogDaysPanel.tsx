import { CalendarDays } from "lucide-react";
import { cn } from "../../../../lib/utils_ui";
import type { MultiLogDay } from "../../../../lib/stats-logic";
import { formatShortDate } from "../../../../lib/dates";
import { PanelEmptyState, PanelFrame } from "../plate-ui";
import { TooltipDetail, TooltipTitle, useHoverTooltip } from "../PlateTooltip";

interface MultiLogDaysPanelProps {
  multiLogDays: MultiLogDay[];
  variant: "compact" | "expanded";
  onDateClick: (date: string) => void;
  onExpand?: () => void;
}

export function MultiLogDaysPanel({ multiLogDays, variant, onDateClick, onExpand }: MultiLogDaysPanelProps) {
  const { bindTooltip, tooltip } = useHoverTooltip();
  const isExpanded = variant === "expanded";
  const visible = isExpanded ? multiLogDays : multiLogDays.slice(0, 4);

  return (
    <PanelFrame
      title="Multiple Logs Per Day"
      subtitle={`${multiLogDays.length} ${multiLogDays.length === 1 ? "day" : "days"} with 2+ logs`}
      accent="cyan"
      icon={<CalendarDays size={13} />}
      onExpand={onExpand}
      bodyClassName="gap-1.5"
    >
      {tooltip}
      {multiLogDays.length === 0 ? (
        <PanelEmptyState message="No days with multiple logs in the current selection." />
      ) : (
        <div className={cn("flex min-h-0 flex-1 flex-col gap-1.5", isExpanded && "overflow-y-auto pr-1")}>
          {visible.map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => onDateClick(day.date)}
              {...bindTooltip(
                <>
                  <TooltipTitle>{formatShortDate(day.date)}</TooltipTitle>
                  {day.entries.map((entry) => (
                    <TooltipDetail key={entry.id}>{entry.name}</TooltipDetail>
                  ))}
                </>
              )}
              className="flex items-center gap-2 rounded-md px-1 py-[3px] text-[11px] transition-colors hover:bg-white/5"
            >
              <span className="shrink-0 text-gray-400">{formatShortDate(day.date)}</span>
              <span className="min-w-0 flex-1 truncate text-left text-[10px] text-gray-600">
                {day.entries.map((entry) => entry.name).join(", ")}
              </span>
              <span className="shrink-0 rounded bg-cyan-500/15 px-1.5 py-px text-[9px] font-semibold text-cyan-300">
                {day.entries.length}
              </span>
            </button>
          ))}
        </div>
      )}
    </PanelFrame>
  );
}
