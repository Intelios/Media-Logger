import { type KeyboardEvent, type ReactNode } from "react";
import { EyeOff, GripVertical } from "lucide-react";
import { cn } from "../../lib/utils_ui";
import type { SummaryWidgetId } from "./stats-config";
import { useStatsWidgetEditContext } from "./StatsEditableWidgetFrame";

export type SummaryCardColor = "blue" | "amber" | "green" | "purple" | "pink" | "cyan";

interface SummaryColorPalette {
  border: string;
  background: string;
  text: string;
}

interface StatsSummaryCardProps {
  widgetId: SummaryWidgetId;
  icon: ReactNode;
  label: string;
  value: string | number;
  color: SummaryCardColor;
  onClick?: () => void;
}

const COLOR_PALETTES: Record<SummaryCardColor, SummaryColorPalette> = {
  blue: {
    border: "border-blue-500/20",
    background: "bg-blue-500/10",
    text: "text-blue-400",
  },
  amber: {
    border: "border-amber-500/20",
    background: "bg-amber-500/10",
    text: "text-amber-400",
  },
  green: {
    border: "border-green-500/20",
    background: "bg-green-500/10",
    text: "text-green-400",
  },
  purple: {
    border: "border-purple-500/20",
    background: "bg-purple-500/10",
    text: "text-purple-400",
  },
  pink: {
    border: "border-pink-500/20",
    background: "bg-pink-500/10",
    text: "text-pink-400",
  },
  cyan: {
    border: "border-cyan-500/20",
    background: "bg-cyan-500/10",
    text: "text-cyan-400",
  },
};

export function StatsSummaryCard({
  widgetId,
  icon,
  label,
  value,
  color,
  onClick,
}: StatsSummaryCardProps) {
  const palette = COLOR_PALETTES[color];
  const { dragHandle, isCustomizing, isDragging, onHide } = useStatsWidgetEditContext();
  const isInteractive = Boolean(onClick) && !isCustomizing;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive || !onClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      data-stats-widget={widgetId}
      data-stats-layout-role="summary"
      data-stats-customizing={isCustomizing ? "true" : "false"}
      className={cn(
        "relative flex h-full min-h-[148px] flex-col justify-between gap-5 rounded-2xl border p-4 transition-all duration-300",
        palette.border,
        palette.background,
        isInteractive && "cursor-pointer hover:scale-[1.02] hover:ring-2 hover:ring-white/20",
        isCustomizing && "border-white/15 bg-white/[0.06] pr-20",
        isDragging && "ring-2 ring-white/20"
      )}
      onClick={isInteractive ? onClick : undefined}
      onKeyDown={handleKeyDown}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      {isCustomizing ? (
        <div className="absolute right-3 top-3 flex items-center gap-2">
          <button
            type="button"
            ref={dragHandle?.ref}
            {...(dragHandle?.attributes ?? {})}
            {...(dragHandle?.listeners ?? {})}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-gray-400 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
            aria-label={`Drag ${label}`}
          >
            <GripVertical size={15} />
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onHide?.();
            }}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-gray-400 transition-colors hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-200"
            aria-label={`Hide ${label}`}
          >
            <EyeOff size={15} />
          </button>
        </div>
      ) : null}

      <div className="space-y-5">
        <div className={cn("w-fit rounded-xl bg-white/5 p-2", palette.text)}>{icon}</div>
        <div className="text-3xl font-bold leading-none text-white">{value}</div>
      </div>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  );
}
