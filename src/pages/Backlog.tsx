import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Bookmark, Plus, Play, Package, CalendarClock, ChevronDown, ChevronUp } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { BacklogShelf } from "../components/backlog/BacklogShelf";
import { SortableShelfItem } from "../components/backlog/SortableShelfItem";
import { BacklogSpine } from "../components/backlog/BacklogSpine";
import { BacklogFaceout } from "../components/backlog/BacklogFaceout";
import { BacklogItemMenu, type MenuAnchor } from "../components/backlog/BacklogItemMenu";
import {
  FACEOUT_GAP, FACEOUT_WIDTH, SPINE_GAP, SPINE_WIDTH,
} from "../components/backlog/backlog-visuals";
import { BacklogForm } from "../components/BacklogForm";
import { EntryForm } from "../components/EntryForm";
import { backlogLogic, type BacklogItemsByStatus } from "../lib/backlog-logic";
import { dbService, type BacklogItem, type MediaEntry } from "../lib/db";
import { getVisibleEntryTypes, useAdultMediaEnabled } from "../lib/media-config";
import { isUnreleasedSectionCollapsed, setUnreleasedSectionCollapsed } from "../lib/settings";
import { formatDurationLong, getDaysSince, getDaysUntil } from "../lib/dates";
import { cn } from "../lib/utils_ui";

type SectionKey = "inProgress" | "planning" | "unreleased";

const CONTAINER_IDS: Record<SectionKey, string> = {
  inProgress: "section:inProgress",
  planning: "section:planning",
  unreleased: "section:unreleased",
};

const SECTION_STATUS: Record<SectionKey, BacklogItem["status"]> = {
  inProgress: "in_progress",
  planning: "planning",
  unreleased: "unreleased",
};

/** Compact plank label date, e.g. "14 Sep". */
const formatRailDate = (dateString: string | null): string => {
  if (!dateString) return "TBA";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "TBA";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const HEADING_TONES = {
  amber: { icon: "text-amber-400", badge: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  neutral: { icon: "text-gray-400", badge: "bg-white/10 text-gray-400 border-white/10" },
  sky: { icon: "text-sky-400", badge: "bg-sky-500/15 text-sky-400 border-sky-500/20" },
};

function ShelfHeading({
  icon,
  label,
  count,
  total,
  tone,
  hint,
  onToggle,
  collapsed,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  total: number;
  tone: keyof typeof HEADING_TONES;
  hint?: string;
  onToggle?: () => void;
  collapsed?: boolean;
}) {
  const toneStyle = HEADING_TONES[tone];

  const heading = (
    <>
      <span className={cn("flex items-center gap-2", toneStyle.icon)}>{icon}</span>
      <h2 className="text-lg font-bold text-white">{label}</h2>
      <span className={cn("rounded-md border px-2 py-0.5 text-xs font-bold tabular-nums", toneStyle.badge)}>
        {count === total ? total : `${count}/${total}`}
      </span>
    </>
  );

  return (
    <div className="mb-3 flex items-center gap-3">
      {onToggle ? (
        <button type="button" onClick={onToggle} aria-expanded={!collapsed} className="group flex items-center gap-3">
          {heading}
          <span className="text-gray-500 transition-colors group-hover:text-white">
            {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </span>
        </button>
      ) : (
        heading
      )}
      <span className="h-px flex-1 bg-white/[0.07]" />
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </div>
  );
}

function EmptyShelf({
  icon,
  message,
  highlighted = false,
}: {
  icon: ReactNode;
  message: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border border-dashed border-white/10 py-10 text-center transition-[border-color,background-color] duration-200"
      style={
        highlighted
          ? {
              backgroundColor: "color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))",
              borderColor: "color-mix(in srgb, var(--color-primary) 50%, transparent)",
            }
          : { backgroundColor: "var(--color-surface)" }
      }
    >
      <div className="mx-auto mb-2 flex justify-center text-gray-600">{icon}</div>
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

export default function Backlog() {
  const adultEnabled = useAdultMediaEnabled();
  const [items, setItems] = useState<BacklogItemsByStatus>({ inProgress: [], planning: [], unreleased: [] });
  const [activeFilter, setActiveFilter] = useState("All");
  const [unreleasedCollapsed, setUnreleasedCollapsed] = useState(() => isUnreleasedSectionCollapsed());
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<BacklogItem | null>(null);
  const [completingItem, setCompletingItem] = useState<BacklogItem | null>(null);
  const [completionInitialData, setCompletionInitialData] = useState<Partial<MediaEntry> | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  // Section the dragged item is currently over. dnd-kit's per-droppable isOver
  // only lights the shelf container, but during a drag the cursor usually sits
  // over a sortable item — so the shelf glow is driven from this instead.
  const [overSection, setOverSection] = useState<SectionKey | null>(null);
  // Items that arrived via a cross-section drop this session. The marker is
  // deliberately never cleared: un-marking a live element would swap its
  // settle class for the entrance class, replaying a fade from opacity 0 —
  // the "cover vanishes then animates back in" flash.
  const [landedIds, setLandedIds] = useState<ReadonlySet<number>>(() => new Set());
  const loadIdRef = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const loadItems = useCallback(async () => {
    const id = ++loadIdRef.current;
    const result = await backlogLogic.getAllItems();
    if (id === loadIdRef.current) {
      setItems(result);
    }
  }, []);

  // Load on mount, and re-fetch (now adult-filtered) with any stale adult
  // filter cleared when the Adult Media setting is toggled, so the backlog
  // updates without a restart.
  useEffect(() => {
    setActiveFilter("All");
    loadItems();
  }, [adultEnabled, loadItems]);

  const allItems = useMemo(
    () => [...items.inProgress, ...items.planning, ...items.unreleased],
    [items]
  );

  const availableTypes = useMemo(() => {
    const present = new Set(allItems.map((item) => item.entry_type));
    return ["All", ...getVisibleEntryTypes().filter((type) => present.has(type))];
  }, [allItems]);

  // A type filter dims non-matching spines in place rather than removing them.
  // The shelf stays intact, the queue keeps its numbering, and — unlike the old
  // grid — reordering stays safe while a filter is on, because no item is ever
  // hidden from the list being reordered.
  const isFiltering = activeFilter !== "All";
  const matches = useCallback(
    (item: BacklogItem) => !isFiltering || item.entry_type === activeFilter,
    [isFiltering, activeFilter]
  );
  const countMatching = (list: BacklogItem[]) => (isFiltering ? list.filter(matches).length : list.length);

  const totalCount = allItems.length;
  const isEmpty = totalCount === 0;
  const isDragging = activeId !== null;

  // Resolve a dnd id to its section: a section droppable id (string) or, for an
  // item id (number), whichever list currently holds it.
  const findContainer = (id: string | number): SectionKey | null => {
    const asSection = (Object.keys(CONTAINER_IDS) as SectionKey[]).find((key) => CONTAINER_IDS[key] === id);
    if (asSection) return asSection;
    const numId = typeof id === "number" ? id : Number(id);
    if (items.inProgress.some((item) => item.id === numId)) return "inProgress";
    if (items.planning.some((item) => item.id === numId)) return "planning";
    if (items.unreleased.some((item) => item.id === numId)) return "unreleased";
    return null;
  };

  // The item under the cursor, rendered into the DragOverlay so a drag has a
  // visible subject. Without it the source just dims in place and a
  // cross-section move gives no feedback at all.
  const dragged = useMemo(() => {
    if (activeId === null) return null;
    const faceout = items.inProgress.find((item) => item.id === activeId);
    if (faceout) return { item: faceout, kind: "faceout" as const, rank: null };
    const planningIndex = items.planning.findIndex((item) => item.id === activeId);
    if (planningIndex !== -1) {
      return { item: items.planning[planningIndex], kind: "spine" as const, rank: planningIndex + 1 };
    }
    const unreleased = items.unreleased.find((item) => item.id === activeId);
    if (unreleased) return { item: unreleased, kind: "spine" as const, rank: null };
    return null;
  }, [activeId, items]);

  const stats = useMemo(() => {
    const waits = items.planning
      .map((item) => getDaysSince(item.added_date))
      .filter((days): days is number => days !== null && days > 0);
    const upcoming = items.unreleased
      .map((item) => getDaysUntil(item.release_date))
      .filter((days): days is number => days !== null && days >= 0);
    return {
      oldestWait: waits.length > 0 ? Math.max(...waits) : null,
      nextRelease: upcoming.length > 0 ? Math.min(...upcoming) : null,
    };
  }, [items]);

  const toggleUnreleasedCollapsed = () => {
    setUnreleasedCollapsed((prev) => {
      const next = !prev;
      setUnreleasedSectionCollapsed(next);
      return next;
    });
  };

  const handleAddSave = async (data: { name: string; entry_type: string; genre: string | null; image_url: string | null; release_date: string | null; is_unreleased: boolean }) => {
    const { is_unreleased, ...fields } = data;
    if (editingItem) {
      await backlogLogic.updateItem(editingItem.id, fields);
      // Only touch status when the unreleased toggle actually changed, so
      // editing an in-progress item leaves it in progress.
      if (is_unreleased && editingItem.status !== "unreleased") {
        await backlogLogic.moveToUnreleased(editingItem.id);
      } else if (!is_unreleased && editingItem.status === "unreleased") {
        await backlogLogic.moveToPlanning(editingItem.id);
      }
    } else {
      await backlogLogic.addItem(
        fields.name,
        fields.entry_type,
        fields.genre,
        fields.image_url,
        is_unreleased ? "unreleased" : "planning",
        fields.release_date
      );
    }
    setShowForm(false);
    setEditingItem(null);
    await loadItems();
  };

  const handleStart = async (id: number) => {
    await backlogLogic.moveToInProgress(id);
    await loadItems();
  };

  const handlePause = async (id: number) => {
    await backlogLogic.moveToPlanning(id);
    await loadItems();
  };

  const handleComplete = (item: BacklogItem) => {
    const prefilled = backlogLogic.prepareForCompletion(item);
    setCompletingItem(item);
    setCompletionInitialData(prefilled);
  };

  const handleCompletionSave = async (entryData: Partial<MediaEntry>) => {
    if (!completingItem) return;

    try {
      // EntryForm has already committed any newly picked image via the native image service
      // before onSave fires, so image_url is final here.
      let yearCompleted = entryData.year_completed;
      if (entryData.completion_date) {
        const year = parseInt(entryData.completion_date.split("-")[0], 10);
        if (!isNaN(year)) yearCompleted = year;
      }

      await dbService.addEntry({
        ...entryData,
        image_url: entryData.image_url ?? null,
        year_completed: yearCompleted ?? null,
      } as Omit<MediaEntry, "id">);

      await backlogLogic.removeItem(completingItem.id);

      setCompletingItem(null);
      setCompletionInitialData(null);

      window.dispatchEvent(new CustomEvent("entry-added", { detail: { year: yearCompleted } }));
      await loadItems();
    } catch (error) {
      console.error("Failed to complete backlog item:", error);
    }
  };

  const handleEdit = (item: BacklogItem) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const confirmRemove = async () => {
    if (showDeleteConfirm !== null) {
      await backlogLogic.removeItem(showDeleteConfirm);
      setShowDeleteConfirm(null);
      await loadItems();
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setMenuAnchor(null);
    setActiveId(Number(event.active.id));
    setOverSection(null);
  };

  // Tracks the section under the dragged item — container or item, whichever
  // dnd-kit reports — so shelf highlights always match where a drop would land.
  const handleDragOver = (event: DragOverEvent) => {
    setOverSection(event.over ? findContainer(event.over.id) : null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOverSection(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    setOverSection(null);
    const { active, over } = event;
    if (!over) return;

    const from = findContainer(active.id);
    const to = findContainer(over.id);
    if (!from || !to) return;

    const activeItemId = Number(active.id);

    if (from === to) {
      // Unreleased is auto-sorted by release date, so reordering within it is a
      // no-op — it would just snap back to the release-date order on next load.
      if (from === "unreleased" || active.id === over.id) return;
      const list = items[from];
      const oldIndex = list.findIndex((item) => item.id === activeItemId);
      const newIndex = list.findIndex((item) => item.id === Number(over.id));
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(list, oldIndex, newIndex);
      setItems((current) => ({ ...current, [from]: newOrder })); // optimistic
      backlogLogic
        .updateItemOrder(SECTION_STATUS[from], newOrder.map((item) => item.id))
        .catch(() => loadItems());
      return;
    }

    // Cross-section: change the item's status. Dropping into Unreleased isn't
    // supported (an unreleased item is defined by a release date, set in the
    // form), so ignore those drops.
    if (to === "unreleased") return;

    // Optimistically move the item and mark it as landed in the SAME commit,
    // so the instant the drag overlay disappears the item is already standing
    // on its new shelf — no flash back to the source shelf, and the settle
    // plays exactly once on the fresh mount. The marker stays applied for the
    // element's lifetime so the entrance class never takes over mid-flight.
    const moving = items[from].find((item) => item.id === activeItemId);
    if (moving) {
      setItems((current) => ({
        ...current,
        [from]: current[from].filter((item) => item.id !== activeItemId),
        [to]: [...current[to], moving],
      }));
      setLandedIds((prev) => {
        const next = new Set(prev);
        next.add(activeItemId);
        return next;
      });
    }
    try {
      if (to === "inProgress") await backlogLogic.moveToInProgress(activeItemId);
      else await backlogLogic.moveToPlanning(activeItemId);
    } catch (error) {
      console.error("Failed to move backlog item between sections:", error);
    }
    await loadItems();
  };

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="backlog-header-enter flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg"
            style={{
              background: `linear-gradient(to bottom right, var(--color-primary), var(--color-secondary))`,
              boxShadow: `0 10px 15px -3px color-mix(in srgb, var(--color-primary) 20%, transparent)`,
            }}
          >
            <Bookmark size={24} style={{ color: "white" }} />
          </div>
          <div>
            <h1
              className="bg-clip-text text-2xl font-bold text-transparent"
              style={{ backgroundImage: `linear-gradient(to right, var(--color-primary), var(--color-secondary))` }}
            >
              Backlog
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              Your watchlist, playlist, and reading queue
            </p>
          </div>
        </div>

        <button
          onClick={() => { setEditingItem(null); setShowForm(true); }}
          className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
          style={{ background: `linear-gradient(to right, var(--color-primary), var(--color-secondary))` }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = `0 10px 15px -3px color-mix(in srgb, var(--color-primary) 25%, transparent)`;
          }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ""; }}
        >
          <Plus size={16} />
          <span>Add to Backlog</span>
        </button>
      </div>

      {/* Stat line — the sentence that used to require reading the whole page. */}
      {!isEmpty && (
        <div
          className="backlog-header-enter mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500"
          style={{ animationDelay: "60ms" }}
        >
          <span><b className="font-semibold tabular-nums text-gray-200">{items.inProgress.length}</b> in progress</span>
          <span className="text-gray-700">·</span>
          <span><b className="font-semibold tabular-nums text-gray-200">{items.planning.length}</b> planned</span>
          {items.unreleased.length > 0 && (
            <>
              <span className="text-gray-700">·</span>
              <span><b className="font-semibold tabular-nums text-gray-200">{items.unreleased.length}</b> unreleased</span>
            </>
          )}
          {stats.oldestWait !== null && (
            <>
              <span className="text-gray-700">·</span>
              <span>oldest has waited <span className="text-amber-400">{formatDurationLong(stats.oldestWait)}</span></span>
            </>
          )}
          {stats.nextRelease !== null && (
            <>
              <span className="text-gray-700">·</span>
              <span>
                next release{" "}
                <span className="text-sky-400">
                  {stats.nextRelease === 0 ? "today" : `in ${formatDurationLong(stats.nextRelease)}`}
                </span>
              </span>
            </>
          )}
        </div>
      )}

      {/* Type filter — dims rather than removes, so the shelf keeps its shape. */}
      {!isEmpty && availableTypes.length > 1 && (
        <div className="backlog-header-enter mt-5 flex flex-wrap gap-2" style={{ animationDelay: "90ms" }}>
          {availableTypes.map((type) => (
            <button
              key={type}
              onClick={() => setActiveFilter(type)}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all",
                activeFilter === type
                  ? "border border-amber-500/40 bg-amber-500/20 text-amber-400"
                  : "border border-white/5 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-300"
              )}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div
          className="backlog-header-enter flex flex-col items-center justify-center py-24 text-center"
          style={{ animationDelay: "80ms" }}
        >
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-orange-500/10">
            <Package size={36} className="text-amber-500/50" />
          </div>
          <h2 className="mb-2 text-xl font-bold text-white">Nothing in your backlog yet</h2>
          <p className="mb-6 max-w-sm text-sm text-gray-400">
            Add movies, games, shows, books, and more that you've been meaning to get to.
          </p>
          <button
            onClick={() => { setEditingItem(null); setShowForm(true); }}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-500/25 active:scale-[0.98]"
          >
            <Plus size={16} />
            <span>Add Your First Item</span>
          </button>
        </div>
      )}

      {/* All three shelves share one DndContext so an item can be dragged along
          its own shelf (re-rank) or onto another one (change status). */}
      {!isEmpty && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {/* ── Off the shelf ─────────────────────────────────────────── */}
          <section className="backlog-section-enter mt-8" style={{ animationDelay: "120ms" }}>
            <ShelfHeading
              icon={<Play size={16} fill="currentColor" />}
              label="In Progress"
              count={countMatching(items.inProgress)}
              total={items.inProgress.length}
              tone="amber"
            />
            <BacklogShelf
              containerId={CONTAINER_IDS.inProgress}
              items={items.inProgress}
              itemWidth={FACEOUT_WIDTH}
              itemGap={FACEOUT_GAP}
              dropTarget
              isDragging={isDragging}
              overOverride={overSection === "inProgress"}
              renderItem={(item, index) => (
                <SortableShelfItem key={item.id} id={item.id}>
                  <BacklogFaceout
                    item={item}
                    index={index}
                    dimmed={!matches(item)}
                    suppressTooltip={isDragging}
                    land={landedIds.has(item.id)}
                    onOpenMenu={setMenuAnchor}
                  />
                </SortableShelfItem>
              )}
              renderLabel={(item) => {
                // Age of the current In-Progress stint, not time since the
                // item was added — a long wait in Planning shouldn't masquerade
                // as months of progress. NULL means the item predates tracking.
                const inProgress = getDaysSince(item.in_progress_since ?? null);
                const label =
                  inProgress === null
                    ? "Started before tracking"
                    : inProgress <= 0
                      ? "Just started"
                      : `${formatDurationLong(inProgress)} in progress`;
                return (
                  <span className="text-[10px] text-amber-500/85">{label}</span>
                );
              }}
              renderEmptyState={(over) => (
                <EmptyShelf
                  highlighted={over}
                  icon={<Play size={22} />}
                  message="Nothing in progress yet. Start something from your planning list."
                />
              )}
            />
          </section>

          {/* ── The rack ──────────────────────────────────────────────── */}
          <section className="backlog-section-enter mt-8" style={{ animationDelay: "200ms" }}>
            <ShelfHeading
              icon={<Bookmark size={16} />}
              label="Planning"
              count={countMatching(items.planning)}
              total={items.planning.length}
              tone="neutral"
              hint={items.planning.length > 1 ? "Drag to reorder" : undefined}
            />
            <BacklogShelf
              containerId={CONTAINER_IDS.planning}
              items={items.planning}
              itemWidth={SPINE_WIDTH}
              itemGap={SPINE_GAP}
              dropTarget
              isDragging={isDragging}
              overOverride={overSection === "planning"}
              renderItem={(item, index) => (
                <SortableShelfItem key={item.id} id={item.id}>
                  <BacklogSpine
                    item={item}
                    rank={index + 1}
                    index={index}
                    dimmed={!matches(item)}
                    suppressTooltip={isDragging}
                    land={landedIds.has(item.id)}
                    onOpenMenu={setMenuAnchor}
                  />
                </SortableShelfItem>
              )}
              renderEmptyState={(over) => (
                <EmptyShelf
                  highlighted={over}
                  icon={<Bookmark size={22} />}
                  message="Your planning list is empty. Add something you've been meaning to get to."
                />
              )}
            />
          </section>

          {/* ── Shrink-wrapped ────────────────────────────────────────── */}
          {items.unreleased.length > 0 && (
            <section className="backlog-section-enter mt-8" style={{ animationDelay: "280ms" }}>
              <ShelfHeading
                icon={<CalendarClock size={16} />}
                label="Unreleased"
                count={countMatching(items.unreleased)}
                total={items.unreleased.length}
                tone="sky"
                onToggle={toggleUnreleasedCollapsed}
                collapsed={unreleasedCollapsed}
              />
              <BacklogShelf
                containerId={CONTAINER_IDS.unreleased}
                items={items.unreleased}
                itemWidth={SPINE_WIDTH}
                itemGap={SPINE_GAP}
                collapsed={unreleasedCollapsed}
                dropTarget={false}
                isDragging={isDragging}
                renderItem={(item, index) => (
                  <SortableShelfItem key={item.id} id={item.id} disabled>
                    <BacklogSpine
                      item={item}
                      rank={null}
                      index={index}
                      dimmed={!matches(item)}
                      wrapped
                      suppressTooltip={isDragging}
                      onOpenMenu={setMenuAnchor}
                    />
                  </SortableShelfItem>
                )}
                renderLabel={(item) => {
                  const days = getDaysUntil(item.release_date);
                  return (
                    <>
                      <span className="text-[11px] font-bold leading-none tabular-nums text-sky-400">
                        {days === null ? "TBA" : days < 0 ? "Out" : days === 0 ? "Today" : `${days}d`}
                      </span>
                      <span className="text-[8px] leading-none text-gray-500">
                        {formatRailDate(item.release_date)}
                      </span>
                    </>
                  );
                }}
                renderEmptyState={(over) => (
                  <EmptyShelf highlighted={over} icon={<CalendarClock size={22} />} message="Nothing awaiting release." />
                )}
              />
            </section>
          )}

          {/* No drop animation: it flies the copy toward a pre-move rect and
              fights the optimistic remount + settle below. */}
          <DragOverlay dropAnimation={null}>
            {dragged?.kind === "faceout" && (
              <BacklogFaceout
                item={dragged.item}
                index={0}
                dimmed={false}
                suppressTooltip
                preview
                onOpenMenu={() => {}}
              />
            )}
            {dragged?.kind === "spine" && (
              <BacklogSpine
                item={dragged.item}
                rank={dragged.rank}
                index={0}
                dimmed={false}
                wrapped={dragged.item.status === "unreleased"}
                suppressTooltip
                preview
                onOpenMenu={() => {}}
              />
            )}
          </DragOverlay>
        </DndContext>
      )}

      {menuAnchor && (
        <BacklogItemMenu
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          onStart={handleStart}
          onPause={handlePause}
          onComplete={handleComplete}
          onEdit={handleEdit}
          onRemove={(id) => setShowDeleteConfirm(id)}
        />
      )}

      {/* Backlog Add/Edit Form */}
      <BacklogForm
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditingItem(null); }}
        onSave={handleAddSave}
        initialData={editingItem}
      />

      {/* Completion EntryForm */}
      {completionInitialData && (
        <EntryForm
          isOpen={!!completingItem}
          onClose={() => { setCompletingItem(null); setCompletionInitialData(null); }}
          onSave={handleCompletionSave}
          initialData={completionInitialData as MediaEntry}
        />
      )}

      {/* Delete Confirmation — portalled to <body> so the page's layout can't
          offset the fixed overlay (see the note in EntryForm). */}
      {showDeleteConfirm !== null && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 p-6 shadow-2xl"
            style={{ backgroundColor: "var(--color-surface)" }}
          >
            <h3 className="mb-2 text-lg font-bold text-white">Remove from Backlog?</h3>
            <p className="mb-6 text-sm text-gray-400">
              This item will be removed from your backlog. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemove}
                className="rounded-xl border border-red-500/30 bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/30"
              >
                Remove
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
