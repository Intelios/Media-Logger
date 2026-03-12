import { type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../lib/utils_ui";
import type { SummaryWidgetId } from "./stats-config";

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

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      data-stats-widget={widgetId}
      className={cn(
        "flex flex-col gap-2 rounded-2xl border p-4 transition-all duration-300 hover:scale-[1.02]",
        palette.border,
        palette.background,
        onClick && "cursor-pointer hover:ring-2 hover:ring-white/20"
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className={cn("w-fit rounded-xl bg-white/5 p-2", palette.text)}>{icon}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  );
}
