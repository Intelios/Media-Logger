import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, X } from "lucide-react";
import { dbService, type EntryCardSummary } from "../../lib/db";
import { useEscapeToClose } from "../../lib/useEscapeToClose";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { cn } from "../../lib/utils_ui";
import { MediaCard } from "../MediaCard";
import { VirtualizedCardGrid } from "../VirtualizedCardGrid";

const getMediaEntryKey = (entry: EntryCardSummary) => entry.id;

interface CollectionItemPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitSelection: (mediaIds: number[]) => void | Promise<void>;
  excludedIds: number[];
}

// Collections keep the library-card picker independently of the Awards styling.
export function CollectionItemPicker({
  isOpen,
  onClose,
  onSubmitSelection,
  excludedIds,
}: CollectionItemPickerProps) {
  const [query, setQuery] = useState("");
  const [allEntries, setAllEntries] = useState<EntryCardSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const resultsScrollRef = useRef<HTMLDivElement>(null);
  const excludedIdSet = useMemo(() => new Set(excludedIds), [excludedIds]);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setSelectedIds([]);
    setIsSubmitting(false);
    // Fetch summaries only when opened; changing exclusions must not reset the queue.
    dbService.getAllEntrySummaries().then(setAllEntries);
  }, [isOpen]);

  const filteredEntries = useMemo(
    () => allEntries.filter((entry) => !excludedIdSet.has(entry.id)),
    [allEntries, excludedIdSet]
  );

  const results = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return filteredEntries.slice(0, 8);
    return filteredEntries.filter((entry) => entry.name.toLowerCase().includes(trimmed));
  }, [filteredEntries, query]);

  const toggleSelection = (mediaId: number) => {
    setSelectedIds((current) =>
      current.includes(mediaId)
        ? current.filter((id) => id !== mediaId)
        : [...current, mediaId]
    );
  };

  const handleSubmitSelection = async () => {
    if (selectedIds.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmitSelection(selectedIds);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-item-picker-title"
        className="bg-[#1a1a1a] border border-white/10 w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex flex-col"
      >
        <div className="p-4 border-b border-white/5 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              autoFocus
              aria-label="Search your library"
              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-white focus:border-primary outline-none"
              placeholder="Search your library to add multiple items..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="text-right min-w-[140px]">
            <h2 id="collection-item-picker-title" className="text-sm font-semibold text-white">
              Add Collection Items
            </h2>
            <div className="text-xs text-gray-500">{selectedIds.length} selected</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 hover:bg-white/10 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X size={20} />
          </button>
        </div>

        <div ref={resultsScrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
          <VirtualizedCardGrid
            items={results}
            getItemKey={getMediaEntryKey}
            columns={{ base: 2, md: 4 }}
            gap={16}
            estimatedRowHeight={420}
            scrollContainerRef={resultsScrollRef}
            ariaLabel="Media search results"
            renderItem={(entry) => {
              const selectionIndex = selectedIds.indexOf(entry.id);
              const isSelected = selectionIndex >= 0;

              return (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={entry.name}
                  aria-pressed={isSelected}
                  onClick={() => toggleSelection(entry.id)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleSelection(entry.id);
                    }
                  }}
                  className={cn(
                    "relative cursor-pointer ring-offset-2 ring-offset-[#1a1a1a] rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    isSelected ? "ring-2 ring-primary" : "hover:ring-2 hover:ring-primary/60"
                  )}
                >
                  <div
                    className={cn(
                      "absolute left-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border text-white shadow-lg transition-all",
                      isSelected ? "border-primary bg-primary" : "border-white/20 bg-black/55 backdrop-blur-sm"
                    )}
                  >
                    {isSelected ? (
                      <span className="text-sm font-bold">{selectionIndex + 1}</span>
                    ) : (
                      <Plus size={16} />
                    )}
                  </div>
                  <MediaCard entry={entry} imagePriority="auto" />
                </div>
              );
            }}
          />
          {results.length === 0 && (
            <div className="text-center py-20 text-gray-500">
              {filteredEntries.length === 0 && excludedIds.length > 0
                ? "All available items are already in this collection"
                : "No media found"}
            </div>
          )}
        </div>

        <div className="border-t border-white/5 p-4 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            Click multiple cards to queue them in the order you want them added.
          </p>
          <button
            type="button"
            onClick={() => void handleSubmitSelection()}
            disabled={selectedIds.length === 0 || isSubmitting}
            className="px-4 py-2.5 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={{ background: "linear-gradient(to right, var(--color-primary), var(--color-secondary))" }}
          >
            {isSubmitting ? "Adding..." : `Add Items (${selectedIds.length})`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
