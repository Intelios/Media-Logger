import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, Star, Trophy, X } from "lucide-react";
import { dbService, type EntryCardSummary } from "../lib/db";
import { formatCardRating, getRatingTextColor } from "../lib/media-config";
import { cn } from "../lib/utils_ui";
import { CoverImage } from "./CoverImage";
import { VirtualizedCardGrid } from "./VirtualizedCardGrid";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";

// Stable empty array so the default parameter doesn't create a new reference
// on every render (which would cause useMemo/useEffect dependency loops).
const EMPTY_IDS: number[] = [];
const getMediaEntryKey = (entry: EntryCardSummary) => entry.id;

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d6ab5c]/60";

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
  /** Client-side filter applied after the year/exclusion filters. */
  entryFilter?: (entry: EntryCardSummary) => boolean;
}

/**
 * Winner / entry picker. A wall of prints in the awards language: each entry is
 * its artwork on a mount with its name and date beneath, every match for the
 * year is listed (not a fixed handful), and the search narrows in place.
 */
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
  excludedIds = EMPTY_IDS,
  entryFilter,
}: WinnerPickerProps) {
  const [query, setQuery] = useState("");
  const [allEntries, setAllEntries] = useState<EntryCardSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const resultsScrollRef = useRef<HTMLDivElement>(null);
  const isMultiSelect = mode === "multiple";
  const excludedIdSet = useMemo(() => new Set(excludedIds), [excludedIds]);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  // Fetch + reset only when the picker opens (or the year changes) — excludedIds
  // is a fresh array on every parent render, so it must not retrigger this effect
  // or query/selection get wiped mid-use. Exclusion is applied below instead.
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setSelectedIds([]);
    setIsSubmitting(false);
    // Summaries only — description/notes prose is never needed for picking.
    dbService.getAllEntrySummaries().then((entries) => {
      setAllEntries(entries);
    });
  }, [isOpen, year]);

  const filteredEntries = useMemo(() => {
    let entries = allEntries.filter((entry) => !excludedIdSet.has(entry.id));
    if (year) entries = entries.filter((entry) => entry.year_completed === year);
    if (entryFilter) entries = entries.filter(entryFilter);
    return entries;
  }, [allEntries, excludedIdSet, year, entryFilter]);

  const results = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return filteredEntries;
    return filteredEntries.filter((entry) => entry.name.toLowerCase().includes(trimmed));
  }, [filteredEntries, query]);

  const toggleSelection = (mediaId: number) => {
    setSelectedIds((current) =>
      current.includes(mediaId)
        ? current.filter((id) => id !== mediaId)
        : [...current, mediaId]
    );
  };

  const handleCardClick = (mediaId: number) => {
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

  const heading = title ?? (isMultiSelect ? "Add collection items" : "Select winner");
  const subtitle = `${filteredEntries.length} ${
    filteredEntries.length === 1 ? "entry" : "entries"
  }${year ? ` from ${year}` : ""}`;

  const emptyMessage =
    filteredEntries.length === 0
      ? excludedIds.length > 0
        ? "Every matching item is already in this collection."
        : year
          ? `Nothing completed in ${year} fits this picker yet.`
          : "No entries match this picker."
      : `No matches for “${query.trim()}”.`;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="winner-picker-title"
        onClick={(event) => event.stopPropagation()}
        className="flex h-[min(84vh,880px)] w-full max-w-4xl flex-col overflow-hidden rounded-[20px] border border-white/10 bg-gradient-to-b from-[#1c1916] to-[#131110] shadow-2xl shadow-black/60"
      >
        <header className="flex items-start gap-3 border-b border-white/5 bg-gradient-to-r from-[#d6ab5c]/[0.08] via-transparent to-transparent px-5 py-4">
          <div className="rounded-[12px] bg-[#d6ab5c]/15 p-2.5 text-[#f0d391]">
            <Trophy size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="winner-picker-title"
              className="truncate text-[17px] font-semibold leading-tight text-white"
            >
              {heading}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-white/45">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn(
              "rounded-lg p-1.5 text-white/45 transition-colors hover:bg-white/10 hover:text-white",
              FOCUS_RING
            )}
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3">
          <div className="relative flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
            />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder ?? `Search for a winner${year ? ` from ${year}` : ""}…`}
              className={cn(
                "h-10 w-full rounded-[10px] border border-white/10 bg-white/[0.04] pl-9 pr-3 text-[13.5px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#d6ab5c]/50 focus:bg-white/[0.06]",
                FOCUS_RING
              )}
            />
          </div>
          <span className="shrink-0 text-[12.5px] tabular-nums text-white/40">
            {query.trim()
              ? `${results.length} match${results.length === 1 ? "" : "es"}`
              : "Most recent first"}
          </span>
        </div>

        <div
          ref={resultsScrollRef}
          className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4"
        >
          <VirtualizedCardGrid
            items={results}
            getItemKey={getMediaEntryKey}
            columns={{ base: 2, md: 3, lg: 4 }}
            gap={16}
            estimatedRowHeight={196}
            scrollContainerRef={resultsScrollRef}
            ariaLabel="Media search results"
            renderItem={(entry) => {
              const selectionIndex = selectedIds.indexOf(entry.id);
              const isSelected = selectionIndex >= 0;
              return (
                <button
                  type="button"
                  onClick={() => handleCardClick(entry.id)}
                  aria-pressed={isMultiSelect ? isSelected : undefined}
                  className={cn(
                    "group flex w-full flex-col gap-2 rounded-[12px] border border-transparent p-2 text-left transition-colors",
                    isSelected
                      ? "border-[#d6ab5c]/40 bg-[#d6ab5c]/[0.10]"
                      : "hover:border-white/10 hover:bg-white/[0.04]",
                    FOCUS_RING
                  )}
                >
                  <span
                    className={cn(
                      "relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-[8px] ring-1",
                      isSelected ? "ring-[#d6ab5c]" : "ring-white/[0.08]"
                    )}
                    style={{ background: "rgba(255, 255, 255, 0.03)" }}
                  >
                    <CoverImage
                      path={entry.image_url}
                      alt=""
                      variant="small"
                      priority="low"
                      containerClassName="flex h-full w-full items-center justify-center p-1.5"
                      imageClassName="max-h-full max-w-full object-contain"
                    />

                    {isMultiSelect && (
                      <span
                        className={cn(
                          "absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold",
                          isSelected
                            ? "bg-[#d6ab5c] text-[#1d150a]"
                            : "bg-black/60 text-white/80 ring-1 ring-white/20"
                        )}
                      >
                        {isSelected ? selectionIndex + 1 : <Plus size={12} />}
                      </span>
                    )}
                  </span>

                  <span className="min-w-0 px-0.5">
                    <span className="block truncate text-[13.5px] font-medium text-white">
                      {entry.name}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[11.5px]">
                      {entry.review_score != null ? (
                        <span
                          className={cn(
                            "flex items-center gap-1 font-medium",
                            getRatingTextColor(entry.review_score)
                          )}
                        >
                          <Star size={9} className="fill-current" />
                          {formatCardRating(entry.review_score)}/10
                        </span>
                      ) : (
                        <span className="text-white/30">Not rated</span>
                      )}
                    </span>
                  </span>
                </button>
              );
            }}
          />

          {results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Trophy size={26} className="text-white/20" />
              <p className="mt-3 text-[13.5px] font-medium text-white/55">{emptyMessage}</p>
            </div>
          )}
        </div>

        {isMultiSelect && (
          <div className="flex items-center justify-between gap-3 border-t border-white/5 bg-black/20 px-5 py-4">
            <p className="text-[12.5px] text-white/40">
              Click multiple entries to queue them in the order you want them added.
            </p>
            <button
              type="button"
              onClick={() => void handleSubmitSelection()}
              disabled={selectedIds.length === 0 || isSubmitting}
              className={cn(
                "h-[38px] shrink-0 rounded-[10px] bg-[#d6ab5c] px-4 text-[13px] font-semibold text-[#1d150a] transition-colors hover:bg-[#e0b76b] disabled:cursor-not-allowed disabled:opacity-40",
                FOCUS_RING
              )}
            >
              {isSubmitting
                ? "Adding…"
                : `${confirmLabel ?? "Add selected"} (${selectedIds.length})`}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
