import { useState, useEffect, useMemo, useRef, forwardRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X, Save, GripVertical, ArrowUpDown } from "lucide-react";
import { DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";
import { CoverImage } from "./CoverImage";
import { useHoverTooltip, TooltipTitle, TooltipDetail } from "./HoverTooltip";

// Generic item type - works with MediaEntry, AwardCategory, or any object with id and name.
// Covers and era fields are optional: items with an imageUrl show art in the row and the
// order rail; items without one fall back to the placeholder cover / neutral rail swatch.
export interface ReorderItem {
  id: number;
  name: string;
  subtitle?: string;
  imageUrl?: string | null;
  eraColor?: string | null;
  eraName?: string | null;
}

interface ReorderModalProps<T extends ReorderItem> {
  isOpen: boolean;
  onClose: () => void;
  items: T[];
  onSave: (newOrder: T[]) => void;
  title?: string;
  /** Set false to hide the left order rail (e.g. very short lists). Defaults to true. */
  renderRail?: boolean;
}

// Neutral bar colour for items with no era (and for Awards' text-only entries).
const UNGROUPED_COLOR = "rgba(255,255,255,0.18)";

// How the position number changes as it renumbers live during a drag.
function PositionBadge({ index, moved }: { index: number; moved: boolean }) {
  return (
    <span
      className={`w-7 shrink-0 text-right font-mono text-xs tabular-nums transition-colors ${
        moved ? "text-primary font-semibold" : "text-gray-500"
      }`}
    >
      {index + 1}
    </span>
  );
}

// Sub-component for an individual sortable row in the right-hand list.
// Pure visual row — no dnd hooks. Rendered by both the live sortable row and the
// DragOverlay clone, so a drag never re-measures or re-renders the moving element.
function RowContent({ item, index, moved }: { item: ReorderItem; index: number; moved: boolean }) {
  return (
    <>
      <PositionBadge index={index} moved={moved} />

      <CoverImage
        path={item.imageUrl}
        variant="small"
        priority="low"
        containerClassName="h-10 w-[26px] shrink-0 rounded-md overflow-hidden bg-white/5"
        imageClassName="h-full w-full object-cover"
      />

      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium">{item.name}</p>
        {item.subtitle && <p className="truncate text-xs text-gray-500">{item.subtitle}</p>}
      </div>

      {item.eraName && (
        <span
          className="hidden shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium sm:inline-flex"
          style={{
            color: item.eraColor ?? undefined,
            borderColor: `color-mix(in srgb, ${item.eraColor ?? "#888"} 40%, transparent)`,
            backgroundColor: `color-mix(in srgb, ${item.eraColor ?? "#888"} 12%, transparent)`,
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.eraColor ?? "#888" }} />
          {item.eraName}
        </span>
      )}
    </>
  );
}

// A floating clone that follows the cursor during a drag (rendered inside DragOverlay).
// Pointer-events disabled so it never becomes the drop target itself.
function RowOverlay({ item }: { item: ReorderItem }) {
  return (
    <div className="pointer-events-none relative flex w-full items-center gap-3 rounded-xl border border-primary/40 bg-[#202020] p-2.5 shadow-xl shadow-primary/25">
      <span
        className="absolute inset-y-2 left-0 w-[3px] rounded-full"
        style={{ background: "linear-gradient(to bottom, var(--color-primary), var(--color-secondary))" }}
      />
      <GripVertical size={18} className="shrink-0 text-primary" />
      <RowContent item={item} index={0} moved={false} />
    </div>
  );
}

const SortableRow = forwardRef<HTMLDivElement, { item: ReorderItem; index: number; moved: boolean }>(function SortableRow({ item, index, moved }, forwardedRef) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  // Both the modal's jump-to-item refs and dnd-kit's setNodeRef need the same node.
  const setRefs = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : 1,
    position: 'relative' as const,
  };

  return (
    <div
      ref={setRefs}
      style={style}
      className={`relative flex w-full items-center gap-3 rounded-xl border p-2.5 transition-[background-color,border-color] ${
        isDragging
          ? // While the overlay carries the visual, the live row becomes an inert
            // placeholder that only marks the landing slot — never scales or re-measures.
            'border-dashed border-primary/40 bg-primary/[0.06] opacity-60'
          : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
      }`}
    >
      <RowContent item={item} index={index} moved={moved} />

      <div {...attributes} {...listeners} className="cursor-grab touch-none text-gray-500 hover:text-primary active:cursor-grabbing">
        <GripVertical size={18} />
      </div>
    </div>
  );
});

// The left "order rail" — a compact filmstrip of miniature covers, one per item,
// compressing as the list grows so the full order is visible at a glance with no
// scrolling. Each thumb carries an era-tinted edge. Click to jump the main list to
// that item; during a drag the hovered thumb glows to show the landing slot.
function OrderRail({
  items,
  overId,
  onJump,
}: {
  items: ReorderItem[];
  overId: number | null;
  onJump: (id: number) => void;
}) {
  const { bindTooltip } = useHoverTooltip();

  return (
    <div className="flex w-14 shrink-0 flex-col overflow-hidden border-r border-white/5 py-4 pl-3 pr-2 md:w-16">
      <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-600">Order</p>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        {items.map((item, index) => {
          const isOver = overId === item.id;
          const era = item.eraColor;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onJump(item.id)}
              {...bindTooltip(
                <>
                  <TooltipTitle>{`${index + 1}. ${item.name}`}</TooltipTitle>
                  {item.eraName && <TooltipDetail>{item.eraName}</TooltipDetail>}
                </>,
                { width: "content", className: "rounded-lg px-3 py-1.5 whitespace-nowrap" }
              )}
              className={`relative w-full min-h-[10px] flex-1 overflow-hidden rounded-md transition-all duration-150 ${
                isOver ? "ring-2 ring-primary scale-[1.04]" : "opacity-60 hover:opacity-100 hover:scale-[1.04]"
              }`}
              style={{
                boxShadow: isOver
                  ? "0 0 10px color-mix(in srgb, var(--color-primary) 70%, transparent)"
                  : undefined,
              }}
              aria-label={`Go to ${item.name}`}
            >
              {item.imageUrl ? (
                <CoverImage
                  path={item.imageUrl}
                  variant="small"
                  priority="low"
                  containerClassName="absolute inset-0 h-full w-full"
                  imageClassName="h-full w-full object-cover"
                />
              ) : (
                <span
                  className="absolute inset-0"
                  style={{ backgroundColor: era ?? UNGROUPED_COLOR }}
                />
              )}
              {/* Era tint along the leading edge so bands still read on the filmstrip. */}
              {era && (
                <span
                  className="absolute inset-y-0 left-0 w-[3px]"
                  style={{ backgroundColor: era }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ReorderModal<T extends ReorderItem>({
  isOpen,
  onClose,
  items,
  onSave,
  title = "Reorder Items",
  renderRail = true,
}: ReorderModalProps<T>) {
  const [orderedItems, setOrderedItems] = useState<T[]>([]);
  const [overId, setOverId] = useState<number | null>(null);
  // The item currently being dragged — rendered into the DragOverlay as a floating
  // clone so the live row can stay an inert placeholder (Backlog pattern).
  const [activeId, setActiveId] = useState<number | null>(null);
  // Snapshot of the order when the modal opened, so the footer can report how
  // many items moved and rows/rail can highlight what changed. Position is
  // derived (index + 1), never stored.
  const originalIndex = useMemo(() => new Map<number, number>(), []);
  const modalRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  useEffect(() => {
    if (isOpen) {
      setOrderedItems(items);
      originalIndex.clear();
      items.forEach((item, index) => originalIndex.set(item.id, index));
      rowRefs.current.clear();
      setOverId(null);
      setActiveId(null);
    }
    // originalIndex is a stable ref-map; only re-seed when the open flag or items change.
  }, [isOpen, items, originalIndex]);

  const sensors = useSensors(
    // A small movement threshold before a drag starts keeps a plain click on the
    // grip from twitching the row.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const movedCount = useMemo(
    () => orderedItems.reduce((count, item, index) => count + (originalIndex.get(item.id) !== index ? 1 : 0), 0),
    [orderedItems, originalIndex]
  );

  const activeItem = useMemo(
    () => (activeId === null ? null : orderedItems.find(i => i.id === activeId) ?? null),
    [activeId, orderedItems]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number);
    setOverId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const over = event.over;
    setOverId(over ? (over.id as number) : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);
    if (over && active.id !== over.id) {
      setOrderedItems((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOverId(null);
  };

  const jumpTo = (id: number) => {
    rowRefs.current.get(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  if (!isOpen) return null;

  // Portalled to <body> so a parent's `space-y-*` margin can't offset the
  // fixed overlay — see the note in EntryForm.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md" onClick={onClose}>
      <motion.div
        ref={modalRef}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-surface flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border shadow-2xl"
      >
        {/* Header */}
        <header
          className="flex items-center gap-3 border-b p-5"
          style={{
            borderColor: "var(--color-border-subtle)",
            background: "linear-gradient(to right, color-mix(in srgb, var(--color-primary) 10%, transparent), transparent)",
          }}
        >
          <div
            className="shrink-0 rounded-xl p-2.5"
            style={{
              background: "linear-gradient(to bottom right, color-mix(in srgb, var(--color-primary) 22%, transparent), color-mix(in srgb, var(--color-secondary) 22%, transparent))",
              boxShadow: "0 10px 15px -3px color-mix(in srgb, var(--color-primary) 20%, transparent)",
            }}
          >
            <ArrowUpDown size={20} style={{ color: "var(--color-primary)" }} />
          </div>
          <div className="min-w-0 flex-1">
            <h3
              className="bg-clip-text text-xl font-bold text-transparent"
              style={{ backgroundImage: "linear-gradient(to right, var(--color-primary), var(--color-secondary))" }}
            >
              {title}
            </h3>
            <p className="mt-0.5 text-xs text-gray-400">{orderedItems.length} {orderedItems.length === 1 ? "item" : "items"}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-white/10 hover:text-white">
            <X size={20} />
          </button>
        </header>

        {/* Body: order rail + sortable list */}
        <div className="flex min-h-0 flex-1">
          {renderRail && orderedItems.length > 1 && (
            <OrderRail items={orderedItems} overId={overId} onJump={jumpTo} />
          )}

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext items={orderedItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {orderedItems.map((item, index) => (
                    <SortableRow
                      key={item.id}
                      ref={(el: HTMLDivElement | null) => { if (el) rowRefs.current.set(item.id, el); else rowRefs.current.delete(item.id); }}
                      item={item}
                      index={index}
                      moved={originalIndex.get(item.id) !== index}
                    />
                  ))}
                </div>
              </SortableContext>

              {/* Floating clone follows the cursor; the live rows stay measured & inert. */}
              <DragOverlay dropAnimation={null}>
                {activeItem ? <RowOverlay item={activeItem} /> : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t p-4" style={{ borderColor: "var(--color-border-subtle)" }}>
          <span className={`text-xs font-medium ${movedCount > 0 ? "text-primary" : "text-gray-600"}`}>
            {movedCount > 0 ? `${movedCount} moved` : "No changes"}
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-semibold text-gray-300 transition-colors hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(orderedItems)}
              disabled={movedCount === 0}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-purple-500 px-5 py-2.5 font-bold text-white shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            >
              <Save size={18} />
              Save Order
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
