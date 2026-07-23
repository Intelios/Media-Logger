import type { CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BacklogCase } from "./BacklogCase";
import { cn } from "../lib/utils_ui";
import type { BacklogItem } from "../lib/db";

interface SortableBacklogCaseProps {
  item: BacklogItem;
  index: number;
  /** When true the card can't be dragged (e.g. a type filter is active). */
  disabled?: boolean;
  /** Suppress the hover tooltip (driven by the page-level drag state). */
  suppressTooltip?: boolean;
  onStart: (id: number) => void;
  onPause: (id: number) => void;
  onComplete: (item: BacklogItem) => void;
  onEdit: (item: BacklogItem) => void;
  onRemove: (id: number) => void;
}

// Wraps a BacklogCase so it can be dragged to reorder. The dnd-kit transform
// MUST live on this wrapper, never on the BacklogCase root — that node carries
// the `backlog-case-enter` keyframe animation whose `forwards` fill applies a
// `transform` in a higher cascade origin than inline styles, which would
// silently override an inline transform on the same element.
export function SortableBacklogCase({
  item,
  index,
  disabled,
  suppressTooltip,
  onStart,
  onPause,
  onComplete,
  onEdit,
  onRemove,
}: SortableBacklogCaseProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn("touch-none", !disabled && "cursor-grab active:cursor-grabbing")}
    >
      <BacklogCase
        item={item}
        index={index}
        suppressTooltip={suppressTooltip || isDragging}
        onStart={onStart}
        onPause={onPause}
        onComplete={onComplete}
        onEdit={onEdit}
        onRemove={onRemove}
      />
    </div>
  );
}
