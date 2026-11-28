import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Puzzle } from "lucide-react";
import { dbService, type EntryCardSummary, type MediaEntry } from "../lib/db";
import { MediaCard } from "./MediaCard";
import { EntryForm } from "./EntryForm";
import { VirtualizedCardGrid } from "./VirtualizedCardGrid";
import { IndexTabPanel } from "./IndexTabPanel";
import { castsCardLight } from "../lib/card-light";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";
import { reportMutationError } from "./MutationErrorToast";

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
    try {
      await dbService.deleteEntry(id);
      onEntriesChange();
    } catch (error) {
      console.error("Failed to delete entry:", error);
      reportMutationError("Could not delete this entry.", error);
    }
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <IndexTabPanel
        ref={modalRef}
        size="sheet"
        tab="Expansions"
        tone="sky"
        title={parentName}
        meta={`${entries.length} ${entries.length === 1 ? 'expansion' : 'expansions'}`}
        onClose={onClose}
        closeLabel="Close expansions"
        className="fixed inset-4 md:inset-10 lg:inset-16 z-50 animate-in zoom-in-95 fade-in duration-200"
      >
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
              columns={{ base: 1, sm: 2, md: 3, lg: 4, xl: 5, '2xl': 6 }}
              gap={24}
              estimatedRowHeight={420}
              scrollContainerRef={scrollRef}
              ariaLabel={`Expansions for ${parentName}`}
              lightSource={castsCardLight}
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
      </IndexTabPanel>

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
