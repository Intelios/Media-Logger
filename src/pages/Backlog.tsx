import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowUpDown, Bookmark, Plus, Play, Clock, Package, CalendarClock, ChevronDown, ChevronUp } from "lucide-react";
import { BacklogCase } from "../components/BacklogCase";
import { BacklogForm } from "../components/BacklogForm";
import { EntryForm } from "../components/EntryForm";
import { ReorderModal } from "../components/ReorderModal";
import { backlogLogic, type BacklogItemsByStatus } from "../lib/backlog-logic";
import { dbService, type BacklogItem, type MediaEntry } from "../lib/db";
import { getVisibleEntryTypes, useAdultMediaEnabled } from "../lib/media-config";
import { isUnreleasedSectionCollapsed, setUnreleasedSectionCollapsed } from "../lib/settings";
import { cn } from "../lib/utils_ui";

export default function Backlog() {
  const adultEnabled = useAdultMediaEnabled();
  const TYPE_FILTERS = ["All", ...getVisibleEntryTypes()];
  const [items, setItems] = useState<BacklogItemsByStatus>({ inProgress: [], planning: [], unreleased: [] });
  const [activeFilter, setActiveFilter] = useState("All");
  const [unreleasedCollapsed, setUnreleasedCollapsed] = useState(() => isUnreleasedSectionCollapsed());
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<BacklogItem | null>(null);
  const [completingItem, setCompletingItem] = useState<BacklogItem | null>(null);
  const [completionInitialData, setCompletionInitialData] = useState<Partial<MediaEntry> | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [reorderStatus, setReorderStatus] = useState<BacklogItem['status'] | null>(null);
  const loadIdRef = useRef(0);

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

  const availableTypes = (() => {
    const allItems = [...items.inProgress, ...items.planning, ...items.unreleased];
    const types = new Set(allItems.map(i => i.entry_type));
    return TYPE_FILTERS.filter(t => t === "All" || types.has(t));
  })();

  const filterItems = (list: BacklogItem[]) => {
    if (activeFilter === "All") return list;
    return list.filter(i => i.entry_type === activeFilter);
  };

  const filteredInProgress = filterItems(items.inProgress);
  const filteredPlanning = filterItems(items.planning);
  const filteredUnreleased = filterItems(items.unreleased);
  const totalCount = items.inProgress.length + items.planning.length + items.unreleased.length;
  const isEmpty = totalCount === 0;
  const isFiltering = activeFilter !== "All";
  const reorderItems = reorderStatus === "in_progress"
    ? items.inProgress
    : reorderStatus === "planning"
      ? items.planning
      : [];

  const getStatusLabel = (status: BacklogItem['status']) =>
    status === "in_progress" ? "In Progress" : status === "unreleased" ? "Unreleased" : "Planning";

  const toggleUnreleasedCollapsed = () => {
    setUnreleasedCollapsed(prev => {
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
      if (is_unreleased && editingItem.status !== 'unreleased') {
        await backlogLogic.moveToUnreleased(editingItem.id);
      } else if (!is_unreleased && editingItem.status === 'unreleased') {
        await backlogLogic.moveToPlanning(editingItem.id);
      }
    } else {
      await backlogLogic.addItem(
        fields.name,
        fields.entry_type,
        fields.genre,
        fields.image_url,
        is_unreleased ? 'unreleased' : 'planning',
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
      // EntryForm has already persisted any newly picked image via saveImage()
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

  const handleRemove = (id: number) => {
    setShowDeleteConfirm(id);
  };

  const confirmRemove = async () => {
    if (showDeleteConfirm !== null) {
      await backlogLogic.removeItem(showDeleteConfirm);
      setShowDeleteConfirm(null);
      await loadItems();
    }
  };

  const handleReorderSave = async (newOrder: BacklogItem[]) => {
    if (!reorderStatus) return;

    await backlogLogic.updateItemOrder(reorderStatus, newOrder.map(item => item.id));
    setItems((current) => reorderStatus === "in_progress"
      ? { ...current, inProgress: newOrder }
      : { ...current, planning: newOrder }
    );
    setReorderStatus(null);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between backlog-header-enter">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
            style={{
              background: `linear-gradient(to bottom right, var(--color-primary), var(--color-secondary))`,
              boxShadow: `0 10px 15px -3px color-mix(in srgb, var(--color-primary) 20%, transparent)`,
            }}
          >
            <Bookmark size={24} style={{ color: 'white' }} />
          </div>
          <div>
            <h1
              className="text-2xl font-bold bg-clip-text text-transparent"
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
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: `linear-gradient(to right, var(--color-primary), var(--color-secondary))`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = `0 10px 15px -3px color-mix(in srgb, var(--color-primary) 25%, transparent)`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '';
          }}
        >
          <Plus size={16} />
          <span>Add to Backlog</span>
        </button>
      </div>

      {/* Filter Chips */}
      {!isEmpty && (
        <div className="flex flex-wrap gap-2">
          {availableTypes.map(type => (
            <button
              key={type}
              onClick={() => setActiveFilter(type)}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                activeFilter === type
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                  : "bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10 hover:text-gray-300"
              )}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-24 text-center backlog-header-enter" style={{ animationDelay: '80ms' }}>
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 flex items-center justify-center mb-6">
            <Package size={36} className="text-amber-500/50" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Nothing in your backlog yet</h2>
          <p className="text-sm text-gray-400 mb-6 max-w-sm">
            Add movies, games, shows, books, and more that you've been meaning to get to.
          </p>
          <button
            onClick={() => { setEditingItem(null); setShowForm(true); }}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-lg hover:shadow-amber-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Plus size={16} />
            <span>Add Your First Item</span>
          </button>
        </div>
      )}

      {/* In Progress Section */}
      {!isEmpty && (
        <section className="backlog-section-enter" style={{ animationDelay: '120ms' }}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Play size={16} className="text-amber-400" fill="currentColor" />
                <h2 className="text-lg font-bold text-white">In Progress</h2>
              </div>
              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                {filteredInProgress.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReorderStatus("in_progress")}
              disabled={items.inProgress.length < 2 || isFiltering}
              title={isFiltering ? "Clear the type filter to reorder all in-progress items" : undefined}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/5 disabled:hover:text-gray-400"
            >
              <ArrowUpDown size={14} />
              Reorder
            </button>
          </div>

          {filteredInProgress.length > 0 ? (
            <div className="flex flex-wrap gap-4">
              {filteredInProgress.map((item, i) => (
                <BacklogCase
                  key={item.id}
                  item={item}
                  index={i}
                  onStart={handleStart}
                  onPause={handlePause}
                  onComplete={handleComplete}
                  onEdit={handleEdit}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center rounded-2xl border border-dashed border-white/10"
              style={{ backgroundColor: "var(--color-surface)" }}
            >
              <Clock size={24} className="mx-auto text-gray-600 mb-2" />
              <p className="text-sm text-gray-500">
                {activeFilter !== "All"
                  ? `No ${activeFilter} items in progress`
                  : "Nothing in progress yet. Start something from your planning queue!"}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Planning Section */}
      {!isEmpty && (
        <section className="backlog-section-enter" style={{ animationDelay: '220ms' }}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Bookmark size={16} className="text-gray-400" />
                <h2 className="text-lg font-bold text-white">Planning</h2>
              </div>
              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-white/10 text-gray-400">
                {filteredPlanning.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReorderStatus("planning")}
              disabled={items.planning.length < 2 || isFiltering}
              title={isFiltering ? "Clear the type filter to reorder all planning items" : undefined}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/5 disabled:hover:text-gray-400"
            >
              <ArrowUpDown size={14} />
              Reorder
            </button>
          </div>

          {filteredPlanning.length > 0 ? (
            <div className="flex flex-wrap gap-4">
              {filteredPlanning.map((item, i) => (
                <BacklogCase
                  key={item.id}
                  item={item}
                  index={i}
                  onStart={handleStart}
                  onPause={handlePause}
                  onComplete={handleComplete}
                  onEdit={handleEdit}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center rounded-2xl border border-dashed border-white/10"
              style={{ backgroundColor: "var(--color-surface)" }}
            >
              <Bookmark size={24} className="mx-auto text-gray-600 mb-2" />
              <p className="text-sm text-gray-500">
                {activeFilter !== "All"
                  ? `No ${activeFilter} items in your planning queue`
                  : "Your planning queue is empty. Add something you've been meaning to get to!"}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Unreleased Section */}
      {items.unreleased.length > 0 && (
        <section className="backlog-section-enter" style={{ animationDelay: '320ms' }}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <button
              type="button"
              onClick={toggleUnreleasedCollapsed}
              className="flex items-center gap-3 group"
            >
              <div className="flex items-center gap-2">
                <CalendarClock size={16} className="text-sky-400" />
                <h2 className="text-lg font-bold text-white">Unreleased</h2>
              </div>
              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-sky-500/15 text-sky-400 border border-sky-500/20">
                {filteredUnreleased.length}
              </span>
              <span className="text-gray-500 group-hover:text-white transition-colors">
                {unreleasedCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
              </span>
            </button>
          </div>

          <div className={cn(
            "overflow-hidden transition-all duration-300 ease-out",
            unreleasedCollapsed ? "max-h-0" : "max-h-[2000px]"
          )}>
            {filteredUnreleased.length > 0 ? (
              <div className="flex flex-wrap gap-4">
                {filteredUnreleased.map((item, i) => (
                  <BacklogCase
                    key={item.id}
                    item={item}
                    index={i}
                    onStart={handleStart}
                    onPause={handlePause}
                    onComplete={handleComplete}
                    onEdit={handleEdit}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            ) : (
              <div className="py-8 text-center rounded-2xl border border-dashed border-white/10"
                style={{ backgroundColor: "var(--color-surface)" }}
              >
                <CalendarClock size={24} className="mx-auto text-gray-600 mb-2" />
                <p className="text-sm text-gray-500">
                  {`No ${activeFilter} items awaiting release`}
                </p>
              </div>
            )}
          </div>
        </section>
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

      <ReorderModal
        isOpen={reorderStatus !== null}
        onClose={() => setReorderStatus(null)}
        items={reorderItems}
        onSave={handleReorderSave}
        title={reorderStatus ? `Reorder ${getStatusLabel(reorderStatus)} Backlog` : "Reorder Backlog"}
      />

      {/* Delete Confirmation — portalled to <body> so the page's `space-y-6`
          margin can't offset the fixed overlay (see the note in EntryForm). */}
      {showDeleteConfirm !== null && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl p-6"
            style={{ backgroundColor: "var(--color-surface)" }}
          >
            <h3 className="text-lg font-bold text-white mb-2">Remove from Backlog?</h3>
            <p className="text-sm text-gray-400 mb-6">
              This item will be removed from your backlog. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemove}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
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
