import { useEffect, useState, useRef, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Layers, Plus, ChevronLeft, Trash2, X, Sparkles, FolderOpen, Image, Pencil } from "lucide-react";
import { collectionsLogic, type Collection, type Era, type CollectionItemView } from "../lib/collections-logic";
import { dbService, type MediaEntry } from "../lib/db";
import { awardsLogic } from "../lib/awards-logic";
import { MediaCard, type MediaAward } from "../components/MediaCard";
import { CollectionModal } from "../components/CollectionModal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { WinnerPicker } from "../components/WinnerPicker"; // Reusing the picker for adding items
import { getImageUrl, releaseImageUrl } from "../lib/utils";
import { ArrowUpDown } from "lucide-react"; // Import ArrowUpDown icon
import { ReorderModal } from "../components/ReorderModal"; // Import Modal
import { EntryForm } from "../components/EntryForm"; // Import EntryForm for editing
import { ErasModal } from "../components/ErasModal";
import { EraAssignMenu } from "../components/EraAssignMenu";
import { hexToRgb } from "../lib/themes";

// A bracket rectangle drawn behind a run of era members on one visual row of
// the grid. Era members that wrap to a second row produce one bracket per row.
interface EraBracket {
  key: string;
  eraId: number;
  eraName: string;
  eraColor: string;
  left: number;
  top: number;
  width: number;
  height: number;
  firstRow: boolean;
}

function bracketsEqual(left: EraBracket[], right: EraBracket[]): boolean {
  return left.length === right.length && left.every((item, index) => {
    const other = right[index];
    return item.key === other.key
      && item.eraName === other.eraName
      && item.eraColor === other.eraColor
      && Math.abs(item.left - other.left) < 0.5
      && Math.abs(item.top - other.top) < 0.5
      && Math.abs(item.width - other.width) < 0.5
      && Math.abs(item.height - other.height) < 0.5;
  });
}

// Helper for thumbnail grid - Enhanced version
function CollectionThumbnails({ images }: { images: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const acquiredImages: string[] = [];

    if (images.length === 0) {
      setUrls([]);
      return;
    }

    Promise.all(images.map(async (img) => {
      const url = await getImageUrl(img, { variant: 'thumbnail' });
      if (cancelled) {
        releaseImageUrl(img, 'thumbnail');
      } else {
        acquiredImages.push(img);
      }
      return url;
    })).then((nextUrls) => {
      if (!cancelled) {
        setUrls(nextUrls);
      }
    });

    return () => {
      cancelled = true;
      acquiredImages.forEach((image) => releaseImageUrl(image, 'thumbnail'));
    };
  }, [images]);

  if (urls.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-white/5 to-white/[0.02] text-gray-600">
        <div className="flex flex-col items-center gap-2">
          <Image size={32} className="opacity-50" />
          <span className="text-xs opacity-50">No items</span>
        </div>
      </div>
    );
  }

  // Create a 2x2 grid with enhanced styling
  return (
    <div className="grid grid-cols-2 gap-1 h-full w-full p-1">
      {/* Fill up to 4 slots, use placeholders if needed */}
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="bg-white/5 overflow-hidden relative rounded-md group/thumb">
          {urls[i] ? (
            <img
              src={urls[i]}
              className="w-full h-full object-cover transition-transform duration-500 group-hover/thumb:scale-110"
              alt=""
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-white/[0.03] to-transparent" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<CollectionItemView[]>([]);
  const [awardsMap, setAwardsMap] = useState<Map<number, MediaAward[]>>(new Map());

  // Eras
  const [eras, setEras] = useState<Era[]>([]);
  const [erasOpen, setErasOpen] = useState(false);
  const [brackets, setBrackets] = useState<EraBracket[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const cardElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const bracketFrameRef = useRef<number | null>(null);

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MediaEntry | null>(null);
  const [editCollectionOpen, setEditCollectionOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [collectionToDelete, setCollectionToDelete] = useState<Collection | null>(null);
  const [itemToRemove, setItemToRemove] = useState<MediaEntry | null>(null);

  // Measure era member cards and compute bracket rects (one per era per visual
  // row). Eras are a pure overlay: this only reads DOM positions.
  const computeBrackets = useCallback(() => {
    if (eras.length === 0) {
      setBrackets((current) => current.length === 0 ? current : []);
      return;
    }
    const grid = gridRef.current;
    if (!grid) return;
    const gridRect = grid.getBoundingClientRect();

    const membersByEra = new Map<number, HTMLDivElement[]>();
    for (const [, el] of cardElsRef.current) {
      const raw = el.dataset.eraId;
      if (!raw) continue;
      const eraId = Number(raw);
      if (!eraId) continue;
      const list = membersByEra.get(eraId) ?? [];
      list.push(el);
      membersByEra.set(eraId, list);
    }

    const next: EraBracket[] = [];
    for (const [eraId, els] of membersByEra) {
      const era = eras.find(e => e.id === eraId);
      if (!era) continue;

      const measured = els.map(el => ({ el, rect: el.getBoundingClientRect() }));
      measured.sort((a, b) => (a.rect.top - b.rect.top) || (a.rect.left - b.rect.left));

      // Cluster into visual rows (same top within a small tolerance).
      const rows: { rects: typeof measured }[] = [];
      for (const item of measured) {
        const row = rows.find(r => Math.abs(r.rects[0].rect.top - item.rect.top) < 12);
        if (row) row.rects.push(item);
        else rows.push({ rects: [item] });
      }

      rows.forEach((row, rowIndex) => {
        const left = Math.min(...row.rects.map(r => r.rect.left));
        const right = Math.max(...row.rects.map(r => r.rect.right));
        const top = Math.min(...row.rects.map(r => r.rect.top));
        const bottom = Math.max(...row.rects.map(r => r.rect.bottom));
        const pad = 6;
        next.push({
          key: `${eraId}-${rowIndex}`,
          eraId,
          eraName: era.name,
          eraColor: era.color,
          left: left - pad - gridRect.left,
          top: top - pad - gridRect.top,
          width: right - left + pad * 2,
          height: bottom - top + pad * 2,
          firstRow: rowIndex === 0,
        });
      });
    }
    setBrackets((current) => bracketsEqual(current, next) ? current : next);
  }, [eras]);

  const scheduleBracketComputation = useCallback(() => {
    if (bracketFrameRef.current !== null) return;
    bracketFrameRef.current = window.requestAnimationFrame(() => {
      bracketFrameRef.current = null;
      computeBrackets();
    });
  }, [computeBrackets]);

  // Recompute whenever items/eras change (runs after DOM commit, so refs are live).
  useLayoutEffect(() => {
    scheduleBracketComputation();
  }, [items, scheduleBracketComputation]);

  // Recompute on container/card resize (window resizes, image loads reflowing
  // the grid). The observer reads the live refs each time it fires.
  useEffect(() => {
    if (eras.length === 0) return;
    const grid = gridRef.current;
    if (!grid) return;
    const ro = new ResizeObserver(scheduleBracketComputation);
    ro.observe(grid);
    return () => {
      ro.disconnect();
      if (bracketFrameRef.current !== null) {
        window.cancelAnimationFrame(bracketFrameRef.current);
        bracketFrameRef.current = null;
      }
    };
  }, [eras.length, scheduleBracketComputation]);

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = () => collectionsLogic.getAllCollections().then(setCollections);

  const refreshSelectedCollection = async (collection: Collection) => {
    const collectionItems = await collectionsLogic.getCollectionItems(collection.id);
    setItems(collectionItems);
    setSelectedCollection(collection);
    setEras(await collectionsLogic.getEras(collection.id));

    const mediaIds = collectionItems.map(e => e.id).filter((id): id is number => id !== undefined);
    if (mediaIds.length > 0) {
      const awards = await awardsLogic.getAwardsForMediaBatch(mediaIds);
      setAwardsMap(awards);
    } else {
      setAwardsMap(new Map());
    }
  };

  const handleSelectCollection = async (col: Collection) => {
    await refreshSelectedCollection(col);
  };

  const handleCreate = async (name: string, desc: string) => {
    await collectionsLogic.createCollection(name, desc);
    loadCollections();
  };

  const handleEditCollection = async (name: string, desc: string) => {
    if (selectedCollection) {
      await collectionsLogic.updateCollection(selectedCollection.id, name, desc);
      setSelectedCollection({ ...selectedCollection, name, description: desc || null });
      loadCollections();
    }
  };

  const handleDeleteCollection = (e: React.MouseEvent, col: Collection) => {
    e.stopPropagation();
    setCollectionToDelete(col);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteCollection = async () => {
    if (collectionToDelete) {
      await collectionsLogic.deleteCollection(collectionToDelete.id);
      loadCollections();
      if (selectedCollection?.id === collectionToDelete.id) setSelectedCollection(null);
    }
    setDeleteConfirmOpen(false);
    setCollectionToDelete(null);
  };

  const handleAddItems = async (mediaIds: number[]) => {
    if (selectedCollection) {
      await collectionsLogic.addItems(selectedCollection.id, mediaIds);
      await refreshSelectedCollection(selectedCollection);
      await loadCollections();
    }
  };

  const confirmRemoveItem = async () => {
    if (selectedCollection && itemToRemove?.id) {
      await collectionsLogic.removeItem(selectedCollection.id, itemToRemove.id);
      await refreshSelectedCollection(selectedCollection);
      await loadCollections();
    }
    setItemToRemove(null);
  };

  const handleReorderSave = async (newOrder: MediaEntry[]) => {
    if (selectedCollection) {
      const ids = newOrder.map(i => i.id);
      await collectionsLogic.updateItemOrder(selectedCollection.id, ids);
      // Refetch instead of setItems(newOrder): the reorder objects carry the
      // ReorderModal `subtitle` decoration and must not become entry state.
      await refreshSelectedCollection(selectedCollection);
      setReorderOpen(false);
    }
  };

  // Handle editing from MediaCard dropdown
  const handleEditFromCard = (entry: MediaEntry) => {
    setEditingEntry(entry);
    setEditModalOpen(true);
  };

  // Handle save from edit modal
  const handleEditSave = async (data: Partial<MediaEntry>) => {
    if (editingEntry) {
      await dbService.updateEntry({ ...editingEntry, ...data } as MediaEntry);
      if (selectedCollection) {
        await refreshSelectedCollection(selectedCollection);
      }
      setEditModalOpen(false);
      setEditingEntry(null);
    }
  };

  const handleErasSave = async (updatedEras: Era[]) => {
    if (!selectedCollection) return;
    await collectionsLogic.saveEras(selectedCollection.id, updatedEras);
    setEras(await collectionsLogic.getEras(selectedCollection.id));
    await refreshSelectedCollection(selectedCollection);
  };

  const handleAssignEra = async (entryId: number, eraId: number | null) => {
    if (!selectedCollection) return;
    await collectionsLogic.setItemEra(selectedCollection.id, entryId, eraId);
    await refreshSelectedCollection(selectedCollection);
  };

  // Handle delete from MediaCard dropdown
  const handleDeleteFromCard = async (id: number) => {
    await dbService.deleteEntry(id);
    if (selectedCollection) {
      await refreshSelectedCollection(selectedCollection);
      await loadCollections();
    }
  };

  // --- VIEW 1: DETAIL (Grid of Items) ---
  if (selectedCollection) {
    return (
      <div className="space-y-6">
        {/* Enhanced Header with gradient background */}
        <header className="relative overflow-hidden rounded-2xl border border-white/10 p-6 collection-header-enter" style={{ background: `linear-gradient(to right, color-mix(in srgb, var(--color-primary) 10%, transparent), color-mix(in srgb, var(--color-secondary) 5%, transparent))` }}>
          {/* Decorative background elements */}
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl" style={{ background: `color-mix(in srgb, var(--color-primary) 10%, transparent)` }} />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full blur-3xl" style={{ background: `color-mix(in srgb, var(--color-secondary) 10%, transparent)` }} />

          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedCollection(null)}
                className="p-2.5 hover:bg-white/10 rounded-xl transition-all border border-white/10 hover:border-white/20 hover:scale-105"
              >
                <ChevronLeft size={22} />
              </button>
              <div className="flex-1">
                <h2 className="text-3xl font-bold bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(to right, var(--color-primary), var(--color-secondary))` }}>
                  {selectedCollection.name}
                </h2>
                <p className="text-gray-400 mt-1">{selectedCollection.description || "Your curated collection"}</p>
              </div>

              {/* Stats badges */}
              <div className="flex items-center gap-3">
                <div className="collection-stat-badge px-4 py-2 rounded-xl flex items-center gap-2">
                  <FolderOpen size={16} style={{ color: 'var(--color-primary)' }} />
                  <span className="font-bold text-white">{items.length}</span>
                  <span className="text-gray-400 text-sm">items</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              {/* Edit Button */}
              <button
                onClick={() => setEditCollectionOpen(true)}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 px-4 py-2.5 rounded-xl font-semibold transition-all"
              >
                <Pencil size={18} />
                Edit
              </button>

              {/* Reorder Button */}
              <button
                onClick={() => setReorderOpen(true)}
                disabled={items.length < 2}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 px-4 py-2.5 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowUpDown size={18} />
                Reorder
              </button>

              {/* Eras Button */}
              <button
                onClick={() => setErasOpen(true)}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 px-4 py-2.5 rounded-xl font-semibold transition-all"
              >
                <Layers size={18} />
                Eras
              </button>

              <button
                onClick={() => setPickerOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all hover:scale-[1.02] hover:brightness-110 text-white"
                style={{ background: `linear-gradient(to right, var(--color-primary), var(--color-secondary))`, boxShadow: `0 10px 15px -3px color-mix(in srgb, var(--color-primary) 20%, transparent)` }}
              >
                <Plus size={18} />
                Add Items
              </button>
            </div>
          </div>
        </header>

        {items.length === 0 ? (
          <div className="relative flex flex-col items-center justify-center py-24 border-2 border-dashed border-white/10 rounded-2xl bg-gradient-to-br from-white/[0.02] to-transparent overflow-hidden">
            {/* Floating decorations */}
            <div className="absolute top-10 left-10 w-20 h-20 rounded-full blur-2xl animate-float-decoration" style={{ background: `color-mix(in srgb, var(--color-primary) 10%, transparent)` }} />
            <div className="absolute bottom-10 right-10 w-16 h-16 rounded-full blur-2xl animate-float-decoration" style={{ background: `color-mix(in srgb, var(--color-secondary) 10%, transparent)`, animationDelay: '-2s' }} />

            <div className="relative z-10 flex flex-col items-center">
              <div className="p-4 rounded-2xl mb-4" style={{ background: `linear-gradient(to bottom right, color-mix(in srgb, var(--color-primary) 20%, transparent), color-mix(in srgb, var(--color-secondary) 20%, transparent))` }}>
                <Layers size={40} style={{ color: 'var(--color-primary)' }} />
              </div>
              <p className="text-lg text-gray-400 mb-2">This collection is empty</p>
              <p className="text-sm text-gray-500 mb-6">Start building your collection by adding items</p>
              <button
                onClick={() => setPickerOpen(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all hover:brightness-110 text-white"
                style={{ background: `linear-gradient(to right, var(--color-primary), var(--color-secondary))`, boxShadow: `0 10px 15px -3px color-mix(in srgb, var(--color-primary) 20%, transparent)` }}
              >
                <Plus size={18} />
                Add your first item
              </button>
            </div>
          </div>
        ) : (
          <div ref={gridRef} className="relative grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {/* Era bracket backgrounds (behind cards) */}
            {brackets.map(b => (
              <div
                key={`bg-${b.key}`}
                className="absolute pointer-events-none rounded-2xl"
                style={{
                  left: b.left,
                  top: b.top,
                  width: b.width,
                  height: b.height,
                  zIndex: 0,
                  background: `rgba(${hexToRgb(b.eraColor)}, 0.035)`,
                  border: `1px solid rgba(${hexToRgb(b.eraColor)}, 0.20)`,
                }}
              />
            ))}
            {/* Era labels (above cards, only on each era's first row) */}
            {brackets.filter(b => b.firstRow).map(b => (
              <div
                key={`label-${b.key}`}
                className="absolute pointer-events-none z-20 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap"
                style={{
                  left: b.left + 8,
                  top: b.top - 10,
                  color: b.eraColor,
                  background: "rgba(12, 12, 12, 0.70)",
                  border: `1px solid rgba(${hexToRgb(b.eraColor)}, 0.28)`,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.20)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <span className="w-1 h-1 rounded-full" style={{ background: b.eraColor }} />
                {b.eraName}
              </div>
            ))}
            {items.map((entry, index) => (
              <div
                key={entry.id}
                ref={(el) => {
                  if (el) cardElsRef.current.set(entry.id, el);
                  else cardElsRef.current.delete(entry.id);
                }}
                data-era-id={entry.era_id ?? ""}
                className="relative z-10 group collection-item-enter"
                style={{ animationDelay: `${Math.min(index * 50, 500)}ms` }}
              >
                <MediaCard
                  entry={entry}
                  onEdit={handleEditFromCard}
                  onDelete={handleDeleteFromCard}
                  awards={entry.id ? awardsMap.get(entry.id) : undefined}
                />
                {/* Hover Remove Button */}
                <button
                  onClick={() => setItemToRemove(entry)}
                  className="absolute top-2 left-2 bg-red-600 hover:bg-red-500 p-2 rounded-xl text-white opacity-0 group-hover:opacity-100 transition-all shadow-lg z-30 hover:scale-110"
                  title="Remove from collection"
                >
                  <Trash2 size={14} />
                </button>
                {/* Era assignment (hover) */}
                <EraAssignMenu
                  eras={eras}
                  currentEraId={entry.era_id}
                  onAssign={(eraId) => handleAssignEra(entry.id, eraId)}
                />
              </div>
            ))}
          </div>
        )}

        <WinnerPicker
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
          mode="multiple"
          title="Add Collection Items"
          searchPlaceholder="Search your library to add multiple items..."
          confirmLabel="Add Items"
          excludedIds={items.map((entry) => entry.id)}
          onSubmitSelection={handleAddItems}
        />

        <ReorderModal
          isOpen={reorderOpen}
          onClose={() => setReorderOpen(false)}
          items={items.map(i => ({ ...i, subtitle: i.entry_type ?? undefined }))}
          onSave={handleReorderSave}
          title="Reorder Collection"
        />

        {/* Manage Eras Modal */}
        <ErasModal
          isOpen={erasOpen}
          onClose={() => setErasOpen(false)}
          eras={eras}
          onSave={handleErasSave}
        />

        {/* Edit Collection Modal */}
        <CollectionModal
          isOpen={editCollectionOpen}
          onClose={() => setEditCollectionOpen(false)}
          onSubmit={handleEditCollection}
          initialName={selectedCollection.name}
          initialDesc={selectedCollection.description ?? ""}
          mode="edit"
        />

        {/* Edit Entry Modal */}
        <EntryForm
          isOpen={editModalOpen}
          onClose={() => { setEditModalOpen(false); setEditingEntry(null); }}
          onSave={handleEditSave}
          initialData={editingEntry}
        />

        <ConfirmDialog
          isOpen={itemToRemove !== null}
          onClose={() => setItemToRemove(null)}
          onConfirm={confirmRemoveItem}
          title="Remove Collection Item"
          confirmLabel="Remove"
          detail="The entry will stay in your library; it will only be removed from this collection."
        >
          Remove <span className="font-semibold text-white">"{itemToRemove?.name}"</span> from <span className="font-semibold text-white">"{selectedCollection.name}"</span>?
        </ConfirmDialog>
      </div>
    );
  }

  // --- VIEW 2: LIST (Grid of Collections) ---
  return (
    <div className="space-y-8">
      {/* Enhanced Header */}
      <header className="flex items-center justify-between collection-header-enter">
        <div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent inline-flex items-center gap-3" style={{ backgroundImage: `linear-gradient(to right, var(--color-primary), var(--color-secondary))` }}>
            <div className="p-2 rounded-xl" style={{ background: `linear-gradient(to bottom right, color-mix(in srgb, var(--color-primary) 20%, transparent), color-mix(in srgb, var(--color-secondary) 20%, transparent))` }}>
              <Layers style={{ color: 'var(--color-primary)' }} size={24} />
            </div>
            Collections
          </h2>
          <p className="text-gray-400 mt-1">Curate and organize your favorite media groups</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all hover:scale-[1.02] hover:brightness-110 text-white"
                style={{ background: `linear-gradient(to right, var(--color-primary), var(--color-secondary))`, boxShadow: `0 10px 15px -3px color-mix(in srgb, var(--color-primary) 20%, transparent)` }}
        >
          <Plus size={18} />
          New Collection
        </button>
      </header>

      {collections.length === 0 ? (
        <div className="relative text-center py-24 border-2 border-dashed border-white/10 rounded-2xl bg-gradient-to-br from-white/[0.02] to-transparent overflow-hidden">
          {/* Floating decorations */}
          <div className="absolute top-10 left-1/4 w-24 h-24 rounded-full blur-3xl animate-float" style={{ background: `color-mix(in srgb, var(--color-primary) 10%, transparent)` }} />
          <div className="absolute bottom-10 right-1/4 w-20 h-20 rounded-full blur-3xl animate-float-delayed" style={{ background: `color-mix(in srgb, var(--color-secondary) 10%, transparent)` }} />

          <div className="relative z-10">
            <div className="inline-block p-4 rounded-2xl mb-4" style={{ background: `linear-gradient(to bottom right, color-mix(in srgb, var(--color-primary) 20%, transparent), color-mix(in srgb, var(--color-secondary) 20%, transparent))` }}>
              <Sparkles size={40} style={{ color: 'var(--color-primary)' }} />
            </div>
            <p className="text-lg text-gray-400 mb-2">No collections yet</p>
            <p className="text-sm text-gray-500 mb-6">Create your first collection to start organizing</p>
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all hover:brightness-110 text-white"
              style={{ background: `linear-gradient(to right, var(--color-primary), var(--color-secondary))`, boxShadow: `0 10px 15px -3px color-mix(in srgb, var(--color-primary) 20%, transparent)` }}
            >
              <Plus size={18} />
              Create your first collection
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {collections.map((col, index) => (
            <div
              key={col.id}
              onClick={() => handleSelectCollection(col)}
              className="relative collection-card-gradient border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer group hover:shadow-2xl card-shine collection-card-enter"
              style={{ animationDelay: `${Math.min(index * 60, 480)}ms` }}
            >
              {/* Watermark number */}
              <div className="collection-watermark -top-4 -right-2 group-hover:text-white/[0.04] transition-all">
                #{index + 1}
              </div>

              {/* Glow effect on hover */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-500 z-0" style={{ background: `linear-gradient(to bottom right, color-mix(in srgb, var(--color-primary) 10%, transparent), color-mix(in srgb, var(--color-secondary) 5%, transparent))` }} />

              {/* Thumbnail Grid */}
              <div className="aspect-video w-full border-b border-white/5 collection-thumbnails relative z-10">
                <CollectionThumbnails images={col.thumbnails || []} />

                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>

              <div className="relative z-10 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg text-white transition-all truncate">
                      {col.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="collection-stat-badge px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                        <FolderOpen size={12} style={{ color: 'var(--color-primary)' }} />
                        <span className="text-sm font-semibold text-white">{col.item_count}</span>
                        <span className="text-xs text-gray-400">items</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteCollection(e, col)}
                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Description if available */}
                {col.description && (
                  <p className="text-sm text-gray-500 mt-2 line-clamp-2">{col.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <CollectionModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />

      {/* Delete Collection Confirmation Modal */}
      {deleteConfirmOpen && collectionToDelete && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={() => {
            setDeleteConfirmOpen(false);
            setCollectionToDelete(null);
          }}
        >
          <div
            className="collection-modal-glass border border-white/10 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-white/5 bg-gradient-to-r from-red-500/10 via-transparent to-transparent">
              <div className="p-2.5 bg-red-500/20 rounded-xl">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">Delete Collection</h3>
                <p className="text-xs text-gray-400">This action cannot be undone</p>
              </div>
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setCollectionToDelete(null);
                }}
                className="ml-auto p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-5">
              <p className="text-gray-200 text-sm leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-white">"{collectionToDelete.name}"</span>?
              </p>
              <p className="text-gray-500 text-xs mt-2">
                Items in this collection will not be deleted from your library.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 p-5 pt-0">
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setCollectionToDelete(null);
                }}
                className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCollection}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl font-semibold text-white transition-colors shadow-lg shadow-red-500/25"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
