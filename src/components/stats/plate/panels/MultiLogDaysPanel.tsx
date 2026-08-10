import { CalendarDays } from "lucide-react";
import { cn } from "../../../../lib/utils_ui";
import type { StatsEntry } from "../../../../lib/db";
import type { MultiLogDay } from "../../../../lib/stats-logic";
import { CoverImage, PanelEmptyState, PanelFrame } from "../plate-ui";
import { TooltipDetail, TooltipTitle, useHoverTooltip } from "../../../HoverTooltip";

interface MultiLogDaysPanelProps {
  multiLogDays: MultiLogDay[];
  /** Every entry in the selection — MultiLogDayEntry carries no artwork. */
  rangedEntries: StatsEntry[];
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

export function MultiLogDaysPanel({
  multiLogDays,
  rangedEntries,
  variant,
  onDateClick,
  onExpand,
}: MultiLogDaysPanelProps) {
  const { bindTooltip } = useHoverTooltip();
  const isExpanded = variant === "expanded";

  const coverById = new Map(rangedEntries.map((entry) => [entry.id, entry.image_url]));

  const visible = isExpanded ? multiLogDays : multiLogDays.slice(0, 5);
  const maxCovers = isExpanded ? 8 : 4;

  return (
    <PanelFrame
      title="Multiple Logs Per Day"
      subtitle={`${multiLogDays.length} ${multiLogDays.length === 1 ? "day" : "days"} with 2+ logs`}
      accent="cyan"
      icon={<CalendarDays size={13} />}
      onExpand={onExpand}
      bodyClassName="gap-2"
    >
      {multiLogDays.length === 0 ? (
        <PanelEmptyState message="No days with multiple logs in the current selection." />
      ) : (
        <div className={cn("flex min-h-0 flex-1 flex-col gap-1.5", isExpanded && "overflow-y-auto pr-1")}>
          {visible.map((day) => {
            const { day: dayNumber, month, year } = splitDate(day.date);
            const shown = day.entries.slice(0, maxCovers);
            const overflow = day.entries.length - shown.length;

            return (
              <button
                key={day.date}
                type="button"
                onClick={() => onDateClick(day.date)}
                {...bindTooltip(
                  <>
                    <TooltipTitle>
                      {dayNumber} {month} {year}
                    </TooltipTitle>
                    {day.entries.map((entry) => (
                      <TooltipDetail key={entry.id}>
                        {entry.name}
                        {typeof entry.review_score === "number" ? ` · ${entry.review_score}` : ""}
                      </TooltipDetail>
                    ))}
                  </>
                )}
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
                      className={cn(
                        "block shrink-0 overflow-hidden rounded-[3px] border border-white/10 bg-white/[0.04]",
                        isExpanded ? "h-16 w-12" : "h-11 w-8"
                      )}
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
      )}
    </PanelFrame>
  );
}
