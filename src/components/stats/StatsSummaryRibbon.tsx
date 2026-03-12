import type { ReactNode } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { cn } from "../../lib/utils_ui";
import type { SummaryWidgetId } from "./stats-config";
import { StatsEditableWidgetFrame } from "./StatsEditableWidgetFrame";

interface StatsSummaryRibbonItem {
  widgetId: SummaryWidgetId;
  content: ReactNode;
}

interface StatsSummaryRibbonProps {
  items: StatsSummaryRibbonItem[];
  isCustomizing: boolean;
  onReorder: (nextVisibleOrder: SummaryWidgetId[]) => void;
  onHideWidget: (widgetId: SummaryWidgetId) => void;
}

function EmptySummaryRibbonState({ isCustomizing }: { isCustomizing: boolean }) {
  if (!isCustomizing) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-8 text-center text-sm text-gray-400">
      No summary widgets are visible. Restore them from the Customize panel.
    </div>
  );
}

export function StatsSummaryRibbon({
  items,
  isCustomizing,
  onReorder,
  onHideWidget,
}: StatsSummaryRibbonProps) {
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
    return <EmptySummaryRibbonState isCustomizing={isCustomizing} />;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={widgetIds} strategy={rectSortingStrategy}>
        <div
          className={cn(
            "grid grid-cols-2 items-stretch gap-4 md:grid-cols-3 lg:grid-cols-6",
            isCustomizing && "rounded-[28px] border border-dashed border-white/10 bg-white/[0.025] p-3"
          )}
        >
          {items.map((item) => (
            <StatsEditableWidgetFrame
              key={item.widgetId}
              widgetId={item.widgetId}
              isCustomizing={isCustomizing}
              onHide={() => onHideWidget(item.widgetId)}
            >
              {item.content}
            </StatsEditableWidgetFrame>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
