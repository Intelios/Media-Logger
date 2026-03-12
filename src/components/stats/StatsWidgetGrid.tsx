import type { ReactNode } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { cn } from "../../lib/utils_ui";
import type { MainWidgetId, StatsWidgetHeightPreset, StatsWidgetLayoutRole, StatsWidgetSize } from "./stats-config";
import { StatsEditableWidgetFrame } from "./StatsEditableWidgetFrame";

interface StatsWidgetGridItem {
  widgetId: MainWidgetId;
  size: Exclude<StatsWidgetSize, "summary">;
  heightPreset: Exclude<StatsWidgetHeightPreset, "summary">;
  layoutRole: Exclude<StatsWidgetLayoutRole, "summary">;
  content: ReactNode;
}

interface StatsWidgetGridProps {
  items: StatsWidgetGridItem[];
  isCustomizing: boolean;
  onReorder: (nextVisibleOrder: MainWidgetId[]) => void;
  onHideWidget: (widgetId: MainWidgetId) => void;
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

function EmptyMainCanvasState({ isCustomizing }: { isCustomizing: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-12 text-center">
      <p className="text-base font-semibold text-white">No main widgets are visible.</p>
      <p className="mt-2 text-sm text-gray-400">
        {isCustomizing ? "Restore widgets from the Customize panel." : "Open Customize to add widgets back to this view."}
      </p>
    </div>
  );
}

export function StatsWidgetGrid({
  items,
  isCustomizing,
  onReorder,
  onHideWidget,
}: StatsWidgetGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const widgetIds = items.map((item) => item.widgetId);

  const handleDragEnd = (event: DragEndEvent) => {
    if (!isCustomizing || !event.over || event.active.id === event.over.id) {
      return;
    }

    const activeIndex = widgetIds.findIndex((widgetId) => widgetId === event.active.id);
    const overIndex = widgetIds.findIndex((widgetId) => widgetId === event.over?.id);

    if (activeIndex === -1 || overIndex === -1) {
      return;
    }

    onReorder(arrayMove(widgetIds, activeIndex, overIndex));
  };

  if (items.length === 0) {
    return <EmptyMainCanvasState isCustomizing={isCustomizing} />;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={widgetIds} strategy={rectSortingStrategy}>
        <div
          className={cn(
            "grid grid-cols-1 items-stretch gap-x-6 gap-y-8 md:grid-cols-12",
            isCustomizing && "rounded-[32px] border border-dashed border-white/10 bg-white/[0.025] p-3"
          )}
        >
          {items.map((item) => (
            <StatsEditableWidgetFrame
              key={item.widgetId}
              widgetId={item.widgetId}
              isCustomizing={isCustomizing}
              onHide={() => onHideWidget(item.widgetId)}
              className={cn("h-full", SIZE_CLASS_MAP[item.size], HEIGHT_CLASS_MAP[item.heightPreset])}
            >
              <div
                data-stats-widget={item.widgetId}
                data-stats-layout-role={item.layoutRole}
                data-stats-height-preset={item.heightPreset}
                className="h-full"
              >
                {item.content}
              </div>
            </StatsEditableWidgetFrame>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
