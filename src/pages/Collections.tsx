import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Layers, Plus, ChevronLeft, Trash2, X, Sparkles, FolderOpen, Image, Pencil } from "lucide-react";
import { collectionsLogic, type Collection } from "../lib/collections-logic";
import { dbService, type MediaEntry } from "../lib/db";
import { awardsLogic } from "../lib/awards-logic";
import { MediaCard, type MediaAward } from "../components/MediaCard";
import { CollectionModal } from "../components/CollectionModal";
import { WinnerPicker } from "../components/WinnerPicker"; // Reusing the picker for adding items
import { getImageUrl } from "../lib/utils";
import { ArrowUpDown } from "lucide-react"; // Import ArrowUpDown icon
import { ReorderModal } from "../components/ReorderModal"; // Import Modal
import { EntryForm } from "../components/EntryForm"; // Import EntryForm for editing

// Helper for thumbnail grid - Enhanced version
function CollectionThumbnails({ images }: { images: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    Promise.all(images.map(img => getImageUrl(img))).then(setUrls);
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
  const [items, setItems] = useState<MediaEntry[]>([]);
  const [awardsMap, setAwardsMap] = useState<Map<number, MediaAward[]>>(new Map());

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MediaEntry | null>(null);
  const [editCollectionOpen, setEditCollectionOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [collectionToDelete, setCollectionToDelete] = useState<Collection | null>(null);

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = () => collectionsLogic.getAllCollections().then(setCollections);

  const refreshSelectedCollection = async (collection: Collection) => {
    const collectionItems = await collectionsLogic.getCollectionItems(collection.id);
    setItems(collectionItems);
    setSelectedCollection(collection);

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

  const handleRemoveItem = async (mediaId: number) => {
    if (selectedCollection && confirm("Remove from collection?")) {
      await collectionsLogic.removeItem(selectedCollection.id, mediaId);
      await refreshSelectedCollection(selectedCollection);
      await loadCollections();
    }
  };

  const handleReorderSave = async (newOrder: MediaEntry[]) => {
    if (selectedCollection) {
      const ids = newOrder.map(i => i.id);
      await collectionsLogic.updateItemOrder(selectedCollection.id, ids);
      // Refresh local view
      setItems(newOrder);
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {items.map((entry, index) => (
              <div
                key={entry.id}
                className="relative group collection-item-enter"
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
                  onClick={() => handleRemoveItem(entry.id)}
                  className="absolute top-2 left-2 bg-red-600 hover:bg-red-500 p-2 rounded-xl text-white opacity-0 group-hover:opacity-100 transition-all shadow-lg z-30 hover:scale-110"
                  title="Remove from collection"
                >
                  <Trash2 size={14} />
                </button>
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
          allEntries={items}
        />
      </div>
    );
  }

  // --- VIEW 2: LIST (Grid of Collections) ---
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
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
