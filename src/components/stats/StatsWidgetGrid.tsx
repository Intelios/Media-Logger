import type { ReactNode } from "react";
import type { MainWidgetId, StatsWidgetSize } from "./stats-config";

interface StatsWidgetGridItem {
  widgetId: MainWidgetId;
  size: Exclude<StatsWidgetSize, "summary">;
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

export function StatsWidgetGrid({ items }: StatsWidgetGridProps) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-12">
      {items.map((item) => (
        <div key={item.widgetId} className={SIZE_CLASS_MAP[item.size]}>
          {item.content}
        </div>
      ))}
    </div>
  );
}
