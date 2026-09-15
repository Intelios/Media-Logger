import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Puzzle, X } from "lucide-react";
import { dbService, type EntryCardSummary, type MediaEntry } from "../lib/db";
import { MediaCard } from "./MediaCard";
import { EntryForm } from "./EntryForm";
import { VirtualizedCardGrid } from "./VirtualizedCardGrid";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";

interface ExpansionsModalProps {
  isOpen: boolean;
  parentId: number;
  parentName: string;
  onClose: () => void;
  onEntriesChange: () => void;
  /** Optional hook for jumping from an expansion card to its base game. */
  onNavigateToParent?: (parentEntryId: number, parentName: string) => void;
}

export function ExpansionsModal({
  isOpen,
  parentId,
  parentName,
  onClose,
  onEntriesChange,
  onNavigateToParent,
}: ExpansionsModalProps) {
  const [entries, setEntries] = useState<EntryCardSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MediaEntry | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  useEffect(() => {
    if (!isOpen) return;
    requestRef.current += 1;
    const requestId = requestRef.current;
    setIsLoading(true);
    dbService.getExpansionsForEntry(parentId)
      .then((rows) => {
        if (requestRef.current !== requestId) return;
        setEntries(rows);
      })
      .catch((error) => {
        if (requestRef.current !== requestId) return;
        console.error("Failed to load expansion entries:", error);
        setEntries([]);
      })
      .finally(() => {
        if (requestRef.current !== requestId) return;
        setIsLoading(false);
      });
  }, [isOpen, parentId]);

  if (!isOpen) return null;

  const handleEdit = (entry: MediaEntry) => {
    setEditingEntry(entry);
    setIsFormOpen(true);
  };

  const handleSave = async (data: Partial<MediaEntry>) => {
    if (editingEntry?.id) {
      await dbService.updateEntry({ ...editingEntry, ...data } as MediaEntry);
      onEntriesChange();
    }
    setIsFormOpen(false);
    setEditingEntry(null);
  };

  const handleDelete = async (id: number) => {
    await dbService.deleteEntry(id);
    onEntriesChange();
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div ref={modalRef} className="glass-surface fixed inset-4 md:inset-10 lg:inset-16 rounded-3xl z-50 flex flex-col overflow-hidden animate-in zoom-in-95 fade-in duration-200">
        {/* Header */}
        <header className="flex items-center justify-between p-6 border-b border-primary/15 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-500/20 rounded-lg">
              <Puzzle size={20} className="text-sky-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-text">Expansions for {parentName}</h2>
              <p className="text-text-muted text-sm mt-1">
                {entries.length} {entries.length === 1 ? 'expansion' : 'expansions'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-primary/10 transition-colors text-text-muted hover:text-primary"
          >
            <X size={24} />
          </button>
        </header>

        {/* Scrollable Content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
              Loading expansion details...
            </div>
          ) : entries.length > 0 ? (
            <VirtualizedCardGrid
              items={entries}
              getItemKey={(entry) => entry.id}
              columns={{ base: 1, sm: 2, md: 3, lg: 4, xl: 5 }}
              gap={24}
              estimatedRowHeight={520}
              scrollContainerRef={scrollRef}
              ariaLabel={`Expansions for ${parentName}`}
              renderItem={(entry) => (
                <MediaCard
                  entry={entry}
                  imagePriority="auto"
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onNavigateToParent={onNavigateToParent}
                />
              )}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-text-subtle">
              <Puzzle size={40} className="mb-3 text-gray-600" />
              <p className="text-lg">No expansions found.</p>
            </div>
          )}
        </div>
      </div>

      {/* Entry Form Modal */}
      <EntryForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingEntry(null);
        }}
        onSave={handleSave}
        initialData={editingEntry}
      />
    </>,
    document.body
  );
}
