import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X, Save, GripVertical, ArrowUpDown, ChevronUp, ChevronDown, Layers } from "lucide-react";
import { DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEscapeToClose } from "../../lib/useEscapeToClose";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { CoverImage } from "../CoverImage";
import { ENTRY_TYPES, getTypeBadgeStyle } from "../../lib/media-config";
import { cn } from "../../lib/utils_ui";

// Awards reorder is two-level: sections (media types) move as blocks via the
// header arrows, and award rows drag within their own section. The saved order
// flattens back to award_categories.sort_order, so the year view can derive
// group order from the flat order with no extra schema.
export interface AwardReorderItem {
  id: number;
  name: string;
  subtitle?: string;
  imageUrl?: string | null;
}

export interface AwardReorderGroup {
  /** Media-type key ("Movie", "General", a custom tag). */
  key: string;
  items: AwardReorderItem[];
}

interface AwardReorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: AwardReorderGroup[];
  onSave: (groups: AwardReorderGroup[]) => void;
  title?: string;
}

type Sensors = ReturnType<typeof useSensors>;

// Pure visual row shared by the live sortable row and the DragOverlay clone.
function RowContent({ item, index }: { item: AwardReorderItem; index: number }) {
  return (
    <>
      <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500">
        {index + 1}
      </span>
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
    </>
  );
}

function SortableRow({ item, index }: { item: AwardReorderItem; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : 1,
    position: 'relative' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-xl border p-2.5 transition-[background-color,border-color]",
        isDragging
          ? "border-dashed border-primary/40 bg-primary/[0.06] opacity-60"
          : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
      )}
    >
      <RowContent item={item} index={index} />
      <div {...attributes} {...listeners} className="cursor-grab touch-none text-gray-500 hover:text-primary active:cursor-grabbing">
        <GripVertical size={18} />
      </div>
    </div>
  );
}

// One media-type section: header (icon + name + count + move buttons) over a
// self-contained sortable list. Each section gets its own DndContext so a drag
// physically cannot cross into another group.
function GroupSection({
  group,
  index,
  groupCount,
  sensors,
  onMoveGroup,
  onItemsChange,
}: {
  group: AwardReorderGroup;
  index: number;
  groupCount: number;
  sensors: Sensors;
  onMoveGroup: (direction: -1 | 1) => void;
  onItemsChange: (items: AwardReorderItem[]) => void;
}) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const badge = ENTRY_TYPES.includes(group.key) ? getTypeBadgeStyle(group.key) : null;
  const activeItem = activeId === null ? null : group.items.find(i => i.id === activeId) ?? null;

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as number);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIndex = group.items.findIndex(i => i.id === active.id);
    const newIndex = group.items.findIndex(i => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onItemsChange(arrayMove(group.items, oldIndex, newIndex));
  };

  const moveBtn = "flex items-center justify-center rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/10 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500";

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <header className="flex items-center gap-2.5 border-b border-white/5 bg-white/[0.03] px-3.5 py-2.5">
        <span className={cn(
          "flex h-6 w-6 items-center justify-center rounded-lg text-white",
          badge ? badge.bg : "bg-white/10 text-gray-300"
        )}>
          {badge ? badge.icon : <Layers size={12} />}
        </span>
        <span className="text-sm font-semibold text-gray-200">{group.key}</span>
        <span className="text-xs text-gray-500">{group.items.length} award{group.items.length !== 1 ? "s" : ""}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMoveGroup(-1)}
            disabled={index === 0}
            title="Move section up"
            aria-label={`Move ${group.key} up`}
            className={moveBtn}
          >
            <ChevronUp size={15} />
          </button>
          <button
            type="button"
            onClick={() => onMoveGroup(1)}
            disabled={index === groupCount - 1}
            title="Move section down"
            aria-label={`Move ${group.key} down`}
            className={moveBtn}
          >
            <ChevronDown size={15} />
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-2 p-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={group.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {group.items.map((item, itemIndex) => (
              <SortableRow key={item.id} item={item} index={itemIndex} />
            ))}
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeItem ? (
              <div className="pointer-events-none relative flex w-full items-center gap-3 rounded-xl border border-primary/40 bg-[#202020] p-2.5 shadow-xl shadow-primary/25">
                <span
                  className="absolute inset-y-2 left-0 w-[3px] rounded-full"
                  style={{ background: "linear-gradient(to bottom, var(--color-primary), var(--color-secondary))" }}
                />
                <GripVertical size={18} className="shrink-0 text-primary" />
                <RowContent item={activeItem} index={0} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </section>
  );
}

export function AwardReorderModal({
  isOpen,
  onClose,
  groups,
  onSave,
  title = "Reorder Awards",
}: AwardReorderModalProps) {
  const [orderedGroups, setOrderedGroups] = useState<AwardReorderGroup[]>([]);
  // Flat-position snapshot from when the modal opened — a moved group shifts
  // every item inside it, so flat index deltas capture both levels of change.
  const originalIndex = useMemo(() => new Map<number, number>(), []);
  const modalRef = useRef<HTMLDivElement>(null);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  useEffect(() => {
    if (isOpen) {
      setOrderedGroups(groups);
      originalIndex.clear();
      groups.flatMap(g => g.items).forEach((item, index) => originalIndex.set(item.id, index));
    }
    // originalIndex is a stable ref-map; only re-seed when the open flag or groups change.
  }, [isOpen, groups, originalIndex]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const flatIds = useMemo(() => orderedGroups.flatMap(g => g.items.map(i => i.id)), [orderedGroups]);
  const movedCount = useMemo(
    () => flatIds.reduce((count, id, index) => count + (originalIndex.get(id) !== index ? 1 : 0), 0),
    [flatIds, originalIndex]
  );

  const moveGroup = (index: number, direction: -1 | 1) => {
    setOrderedGroups(gs => arrayMove(gs, index, index + direction));
  };

  const setGroupItems = (index: number, items: AwardReorderItem[]) => {
    setOrderedGroups(gs => gs.map((g, i) => (i === index ? { ...g, items } : g)));
  };

  if (!isOpen) return null;

  const itemCount = flatIds.length;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md" onClick={onClose}>
      <motion.div
        ref={modalRef}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-surface flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border shadow-2xl"
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
            <p className="mt-0.5 text-xs text-gray-400">
              {orderedGroups.length} sections · {itemCount} {itemCount === 1 ? "award" : "awards"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-white/10 hover:text-white">
            <X size={20} />
          </button>
        </header>

        {/* Body: one sortable section per media type */}
        <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {orderedGroups.map((group, index) => (
            <GroupSection
              key={group.key}
              group={group}
              index={index}
              groupCount={orderedGroups.length}
              sensors={sensors}
              onMoveGroup={(dir) => moveGroup(index, dir)}
              onItemsChange={(items) => setGroupItems(index, items)}
            />
          ))}
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
              onClick={() => onSave(orderedGroups)}
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
