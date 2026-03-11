import { useState, useEffect, useRef } from "react";
import { Search, X, Plus } from "lucide-react";
import { dbService, type MediaEntry } from "../lib/db";
import { MediaCard } from "./MediaCard"; // Reuse the card!
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";

interface WinnerPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (mediaId: number) => void;
  onSubmitSelection?: (mediaIds: number[]) => void | Promise<void>;
  year?: number; // Optional: filter search by year automatically?
  mode?: "single" | "multiple";
  title?: string;
  searchPlaceholder?: string;
  confirmLabel?: string;
  excludedIds?: number[];
}

export function WinnerPicker({
  isOpen,
  onClose,
  onSelect,
  onSubmitSelection,
  year,
  mode = "single",
  title,
  searchPlaceholder,
  confirmLabel,
  excludedIds = [],
}: WinnerPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaEntry[]>([]);
  const [allEntries, setAllEntries] = useState<MediaEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const isMultiSelect = mode === "multiple";
  const excludedIdSet = new Set(excludedIds);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIds([]);
      setIsSubmitting(false);
      dbService.getAllEntries().then(entries => {
        // Optional: Filter by the award year automatically? 
        // Usually awards are given to things from that year, but sometimes "Late entries" apply.
        // Let's keep it open for now, or filter if year is provided.
        let filteredEntries = entries.filter((entry) => !excludedIdSet.has(entry.id));
        if (year) {
            filteredEntries = filteredEntries.filter(e => e.year_completed === year);
        }

        setAllEntries(filteredEntries);
      });
    }
  }, [isOpen, year, excludedIds]);

  useEffect(() => {
    if (!query) {
        setResults(allEntries.slice(0, 8)); // Show some recent ones
        return;
    }
    const q = query.toLowerCase();
    setResults(allEntries.filter(e => e.name.toLowerCase().includes(q)));
  }, [query, allEntries]);

  const toggleSelection = (mediaId: number) => {
    setSelectedIds((current) => (
      current.includes(mediaId)
        ? current.filter((id) => id !== mediaId)
        : [...current, mediaId]
    ));
  };

  const handleCardClick = async (mediaId: number) => {
    if (isMultiSelect) {
      toggleSelection(mediaId);
      return;
    }

    onSelect?.(mediaId);
  };

  const handleSubmitSelection = async () => {
    if (!isMultiSelect || selectedIds.length === 0 || !onSubmitSelection) return;

    setIsSubmitting(true);
    try {
      await onSubmitSelection(selectedIds);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div ref={modalRef} className="bg-[#1a1a1a] border border-white/10 w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex flex-col">
        
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-white focus:border-primary outline-none"
              placeholder={searchPlaceholder ?? `Search for a winner${year ? ` from ${year}` : ''}...`}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="text-right min-w-[140px]">
            <div className="text-sm font-semibold text-white">
              {title ?? (isMultiSelect ? "Add Collection Items" : "Select Winner")}
            </div>
            <div className="text-xs text-gray-500">
              {isMultiSelect
                ? `${selectedIds.length} selected`
                : `${results.length} match${results.length !== 1 ? "es" : ""}`}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
            <X size={20} />
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {results.map(entry => {
              const selectionIndex = selectedIds.indexOf(entry.id);
              const isSelected = selectionIndex >= 0;

              return (
              <div 
                key={entry.id} 
                onClick={() => void handleCardClick(entry.id)}
                className={`relative cursor-pointer ring-offset-2 ring-offset-[#1a1a1a] rounded-xl transition-all ${
                  isMultiSelect
                    ? isSelected
                      ? "ring-2 ring-primary"
                      : "hover:ring-2 hover:ring-primary/60"
                    : "hover:ring-2 hover:ring-primary"
                }`}
              >
                {isMultiSelect && (
                  <div className={`absolute left-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border text-white shadow-lg transition-all ${
                    isSelected
                      ? "border-primary bg-primary"
                      : "border-white/20 bg-black/55 backdrop-blur-sm"
                  }`}>
                    {isSelected ? (
                      <span className="text-sm font-bold">{selectionIndex + 1}</span>
                    ) : (
                      <Plus size={16} />
                    )}
                  </div>
                )}
                <MediaCard entry={entry} />
              </div>
              );
            })}
          </div>
          {results.length === 0 && (
            <div className="text-center py-20 text-gray-500">
              {allEntries.length === 0 && excludedIds.length > 0
                ? "All available items are already in this collection"
                : "No media found"}
            </div>
          )}
        </div>

        {isMultiSelect && (
          <div className="border-t border-white/5 p-4 flex items-center justify-between gap-3">
            <p className="text-sm text-gray-500">
              Click multiple cards to queue them in the order you want them added.
            </p>
            <button
              type="button"
              onClick={() => void handleSubmitSelection()}
              disabled={selectedIds.length === 0 || isSubmitting}
              className="px-4 py-2.5 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
              style={{ background: "linear-gradient(to right, var(--color-primary), var(--color-secondary))" }}
            >
              {isSubmitting ? "Adding..." : `${confirmLabel ?? "Add Selected"} (${selectedIds.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
