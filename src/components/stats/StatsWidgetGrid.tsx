import type { ReactNode } from "react";
import { cn } from "../../lib/utils_ui";
import type { MainWidgetId, StatsWidgetHeightPreset, StatsWidgetLayoutRole, StatsWidgetSize } from "./stats-config";

interface StatsWidgetGridItem {
  widgetId: MainWidgetId;
  size: Exclude<StatsWidgetSize, "summary">;
  heightPreset: Exclude<StatsWidgetHeightPreset, "summary">;
  layoutRole: Exclude<StatsWidgetLayoutRole, "summary">;
  content: ReactNode;
}

interface StatsWidgetGridProps {
  items: StatsWidgetGridItem[];
}

const SIZE_CLASS_MAP: Record<StatsWidgetGridItem["size"], string> = {
  small: "col-span-1 md:col-span-4",
  half: "col-span-1 md:col-span-6",
  full: "col-span-1 md:col-span-12",
};

const HEIGHT_CLASS_MAP: Record<StatsWidgetGridItem["heightPreset"], string> = {
  compact: "min-h-[240px]",
  standard: "min-h-[320px]",
  tall: "min-h-[440px]",
  hero: "min-h-[300px] lg:min-h-[320px]",
};

export function StatsWidgetGrid({ items }: StatsWidgetGridProps) {
  return (
    <div className="grid grid-cols-1 items-stretch gap-x-6 gap-y-8 md:grid-cols-12">
      {items.map((item) => (
        <div
          key={item.widgetId}
          data-stats-widget={item.widgetId}
          data-stats-layout-role={item.layoutRole}
          data-stats-height-preset={item.heightPreset}
          className={cn("h-full", SIZE_CLASS_MAP[item.size], HEIGHT_CLASS_MAP[item.heightPreset])}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
