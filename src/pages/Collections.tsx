import { useEffect, useState } from "react";
import { Layers, Plus, ChevronLeft, Trash2 } from "lucide-react";
import { collectionsLogic, type Collection } from "../lib/collections-logic";
import { dbService, type MediaEntry } from "../lib/db";
import { MediaCard } from "../components/MediaCard";
import { CollectionModal } from "../components/CollectionModal";
import { WinnerPicker } from "../components/WinnerPicker"; // Reusing the picker for adding items
import { getImageUrl } from "../lib/utils";
import { ArrowUpDown } from "lucide-react"; // Import ArrowUpDown icon
import { ReorderModal } from "../components/ReorderModal"; // Import Modal
import { EntryForm } from "../components/EntryForm"; // Import EntryForm for editing

// Helper for thumbnail grid
function CollectionThumbnails({ images }: { images: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    Promise.all(images.map(img => getImageUrl(img))).then(setUrls);
  }, [images]);

  if (urls.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white/5 text-gray-500">
        <Layers size={24} />
      </div>
    );
  }

  // Create a 2x2 grid
  return (
    <div className="grid grid-cols-2 gap-0.5 h-full w-full">
      {/* Fill up to 4 slots, use placeholders if needed */}
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="bg-white/5 overflow-hidden relative">
          {urls[i] ? (
            <img src={urls[i]} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-white/5" />
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

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MediaEntry | null>(null);

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = () => collectionsLogic.getAllCollections().then(setCollections);

  const handleSelectCollection = async (col: Collection) => {
    const items = await collectionsLogic.getCollectionItems(col.id);
    setItems(items);
    setSelectedCollection(col);
  };

  const handleCreate = async (name: string, desc: string) => {
    await collectionsLogic.createCollection(name, desc);
    loadCollections();
  };

  const handleDeleteCollection = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm("Delete this collection? Items will not be deleted from library.")) {
      await collectionsLogic.deleteCollection(id);
      loadCollections();
      if (selectedCollection?.id === id) setSelectedCollection(null);
    }
  };

  const handleAddItems = async (mediaId: number) => {
    if (selectedCollection) {
      await collectionsLogic.addItems(selectedCollection.id, [mediaId]);
      // Refresh items
      const newItems = await collectionsLogic.getCollectionItems(selectedCollection.id);
      setItems(newItems);
      // Picker stays open to add more? Or close. Let's keep open for bulk add feel.
      // Actually, for simplicity, close it.
      setPickerOpen(false);
    }
  };

  const handleRemoveItem = async (mediaId: number) => {
    if (selectedCollection && confirm("Remove from collection?")) {
      await collectionsLogic.removeItem(selectedCollection.id, mediaId);
      const newItems = await collectionsLogic.getCollectionItems(selectedCollection.id);
      setItems(newItems);
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
      // Refresh items in collection
      if (selectedCollection) {
        const newItems = await collectionsLogic.getCollectionItems(selectedCollection.id);
        setItems(newItems);
      }
      setEditModalOpen(false);
      setEditingEntry(null);
    }
  };

  // Handle delete from MediaCard dropdown
  const handleDeleteFromCard = async (id: number) => {
    await dbService.deleteEntry(id);
    // Refresh items in collection
    if (selectedCollection) {
      const newItems = await collectionsLogic.getCollectionItems(selectedCollection.id);
      setItems(newItems);
    }
  };

  // --- VIEW 1: DETAIL (Grid of Items) ---
  if (selectedCollection) {
    return (
      <div className="space-y-6">
        <header className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedCollection(null)}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
            <div>
              <h2 className="text-3xl font-bold">{selectedCollection.name}</h2>
              <p className="text-gray-400">{items.length} items • {selectedCollection.description || "No description"}</p>
            </div>
            <div className="ml-auto flex gap-2">
              {/* NEW: Reorder Button */}
              <button
                onClick={() => setReorderOpen(true)}
                disabled={items.length < 2}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowUpDown size={18} />
                Reorder
              </button>

              <button
                onClick={() => setPickerOpen(true)}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 px-4 py-2 rounded-lg font-semibold transition-colors"
              >
                <Plus size={18} />
                Add Items
              </button>
            </div>
          </div>
        </header>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500 border-2 border-dashed border-white/5 rounded-2xl">
            <p className="text-lg">This collection is empty.</p>
            <button onClick={() => setPickerOpen(true)} className="mt-4 text-primary hover:underline">Add your first item</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {items.map(entry => (
              <div key={entry.id} className="relative group">
                <MediaCard
                  entry={entry}
                  onEdit={handleEditFromCard}
                  onDelete={handleDeleteFromCard}
                />
                {/* Hover Remove Button */}
                <button
                  onClick={() => handleRemoveItem(entry.id)}
                  className="absolute top-2 left-2 bg-red-600 p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-30"
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
          onSelect={handleAddItems}
        />

        <ReorderModal
          isOpen={reorderOpen}
          onClose={() => setReorderOpen(false)}
          items={items.map(i => ({ ...i, subtitle: i.entry_type ?? undefined }))}
          onSave={handleReorderSave}
          title="Reorder Collection"
        />

        {/* Edit Entry Modal */}
        <EntryForm
          isOpen={editModalOpen}
          onClose={() => { setEditModalOpen(false); setEditingEntry(null); }}
          onSave={handleEditSave}
          initialData={editingEntry}
        />
      </div>
    );
  }

  // --- VIEW 2: LIST (Grid of Collections) ---
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400 inline-flex items-center gap-3">
            <Layers className="text-blue-500" />
            Collections
          </h2>
          <p className="text-gray-400">Curate your favorite groups of media.</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg font-semibold transition-colors"
        >
          <Plus size={18} />
          New Collection
        </button>
      </header>

      {collections.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          No collections yet. Create one to get started!
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {collections.map(col => (
            <div
              key={col.id}
              onClick={() => handleSelectCollection(col)}
              className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-primary/50 transition-all cursor-pointer group hover:shadow-xl"
            >
              {/* Thumbnail Grid */}
              <div className="aspect-video w-full border-b border-white/5">
                <CollectionThumbnails images={col.thumbnails || []} />
              </div>

              <div className="p-4 flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-lg group-hover:text-primary transition-colors">{col.name}</h3>
                  <p className="text-sm text-gray-400">{col.item_count} items</p>
                </div>
                <button
                  onClick={(e) => handleDeleteCollection(e, col.id)}
                  className="text-gray-600 hover:text-red-400 p-1"
                >
                  <Trash2 size={18} />
                </button>
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
    </div>
  );
}