import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "../../lib/utils_ui";
import type { CSSProperties, ReactNode } from "react";

interface SortableCollectionCardProps {
  id: number;
  children: ReactNode;
}

// Drag wrapper for a collection card under the Custom sort.
//
// As with SortableShelfItem, the dnd-kit transform MUST live on this wrapper
// and never on the card itself: `collection-card-enter` is a `forwards`
// animation with transform keyframes, and an animation's fill applies from a
// higher cascade origin than an inline style, so it would swallow the drag
// transform outright.
export function SortableCollectionCard({ id, children }: SortableCollectionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 30 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "h-full touch-none cursor-grab active:cursor-grabbing",
        // The card follows the pointer rather than sitting in a DragOverlay, so
        // it stays legible — just softened enough to read as "in hand".
        isDragging && "opacity-90"
      )}
    >
      {children}
    </div>
  );
}
