import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "../../lib/utils_ui";
import type { CSSProperties, ReactNode } from "react";

interface SortableShelfItemProps {
  id: number;
  disabled?: boolean;
  children: ReactNode;
}

// Drag wrapper for anything standing on a shelf.
//
// The dnd-kit transform MUST live on this wrapper and never on the spine or
// face-out itself: those carry entrance keyframes whose `forwards` fill applies
// a transform from a higher cascade origin than inline styles, which would
// silently swallow the drag transform. The hover lift is a third, inner level
// for the same reason.
export function SortableShelfItem({ id, disabled, children }: SortableShelfItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn("touch-none", !disabled && "cursor-grab active:cursor-grabbing")}
    >
      {children}
    </div>
  );
}
