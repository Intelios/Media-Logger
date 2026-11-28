import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { createPortal } from "react-dom";
import { type MediaEntry } from "../lib/db";
import { MediaCard } from "./MediaCard";
import { EntryForm } from "./EntryForm";
import { dbService } from "../lib/db";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";
import { VirtualizedCardGrid } from "./VirtualizedCardGrid";
import { IndexTabPanel } from "./IndexTabPanel";
import { castsCardLight } from "../lib/card-light";
import { reportMutationError } from "./MutationErrorToast";

interface StatsEntriesModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** What kind of list this is ("Genre", "Perfect 10s"), shown on the index tab. */
    tab: string;
    /** The specific subject ("Action", "2025"). */
    title: string;
    entries: MediaEntry[];
    isLoading?: boolean;
    onEntriesChange: () => void;
}

export function StatsEntriesModal({ isOpen, onClose, tab, title, entries, isLoading = false, onEntriesChange }: StatsEntriesModalProps) {
    const [editingEntry, setEditingEntry] = useState<MediaEntry | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEscapeToClose(isOpen, onClose);
    useFocusTrap(isOpen, modalRef);

    // Let an expansion card inside this modal jump straight to its parent game.
    // Hooks stay above the early return below, or opening the modal changes
    // the hook count and React throws.
    const navigate = useNavigate();
    const handleNavigateToParent = useCallback(async (parentEntryId: number) => {
        const parent = await dbService.getEntryById(parentEntryId);
        if (!parent?.year_completed) return;
        navigate(`/year/${parent.year_completed}?highlight=${parentEntryId}&type=${encodeURIComponent(parent.entry_type || "")}`);
    }, [navigate]);

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
                tab={tab}
                title={title}
                meta={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
                onClose={onClose}
                className="fixed inset-4 md:inset-10 lg:inset-16 z-50 animate-in zoom-in-95 fade-in duration-200"
            >
                {/* Scrollable Content */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
                    {isLoading ? (
                        <div className="flex h-full items-center justify-center text-sm text-text-muted">
                            Loading entry details...
                        </div>
                    ) : entries.length > 0 ? (
                        <VirtualizedCardGrid
                            items={entries}
                            getItemKey={(entry) => entry.id}
                            columns={{ base: 1, sm: 2, md: 3, lg: 4, xl: 5, '2xl': 6 }}
                            gap={24}
                            estimatedRowHeight={420}
                            scrollContainerRef={scrollRef}
                            ariaLabel={`${tab}: ${title}`}
                            lightSource={castsCardLight}
                            renderItem={(entry) => (
                <MediaCard
                  entry={entry}
                  imagePriority="auto"
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onNavigateToParent={handleNavigateToParent}
                />
                            )}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-text-subtle">
                            <p className="text-lg">No entries found.</p>
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
