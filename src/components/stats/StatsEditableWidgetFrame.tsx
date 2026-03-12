import { createContext, type ReactNode, useContext } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "../../lib/utils_ui";
import type { StatsWidgetId } from "./stats-config";

interface StatsWidgetDragHandleProps {
  ref: (node: HTMLElement | null) => void;
  attributes: Record<string, unknown>;
  listeners: Record<string, (...args: unknown[]) => unknown> | undefined;
}

interface StatsWidgetEditContextValue {
  isCustomizing: boolean;
  isDragging: boolean;
  onHide?: () => void;
  dragHandle?: StatsWidgetDragHandleProps;
}

const DEFAULT_EDIT_CONTEXT: StatsWidgetEditContextValue = {
  isCustomizing: false,
  isDragging: false,
};

const StatsWidgetEditContext = createContext<StatsWidgetEditContextValue>(DEFAULT_EDIT_CONTEXT);

interface StatsEditableWidgetFrameProps {
  widgetId: StatsWidgetId;
  isCustomizing: boolean;
  onHide?: () => void;
  className?: string;
  children: ReactNode;
}

export function StatsEditableWidgetFrame({
  widgetId,
  isCustomizing,
  onHide,
  className,
  children,
}: StatsEditableWidgetFrameProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: widgetId,
    disabled: !isCustomizing,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
  };

  return (
    <StatsWidgetEditContext.Provider
      value={{
        isCustomizing,
        isDragging,
        onHide,
        dragHandle: {
          ref: setActivatorNodeRef,
          attributes: attributes as unknown as Record<string, unknown>,
          listeners: listeners as Record<string, (...args: unknown[]) => unknown> | undefined,
        },
      }}
    >
      <div
        ref={setNodeRef}
        style={style}
        className={cn("h-full min-w-0", isDragging && "opacity-95", className)}
      >
        {children}
      </div>
    </StatsWidgetEditContext.Provider>
  );
}

export function useStatsWidgetEditContext() {
  return useContext(StatsWidgetEditContext);
}
