import { useEffect, useRef, useState } from "react";
import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils_ui";
import { useEscapeToClose } from "../../lib/useEscapeToClose";
import {
  COLLECTION_SORT_OPTIONS,
  getCollectionSortLabel,
  type CollectionSortMode,
} from "../../lib/collections/sorting";

interface CollectionSortMenuProps {
  mode: CollectionSortMode;
  onChange: (mode: CollectionSortMode) => void;
}

/**
 * Sort picker for the Collections index. Follows the MultiSelectFilter dropdown
 * idiom (anchored panel, close on outside mousedown) rather than a native
 * <select>, which can't be themed to match the rest of the header.
 */
export function CollectionSortMenu({ mode, onChange }: CollectionSortMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEscapeToClose(isOpen, () => setIsOpen(false));

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(open => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all",
          isOpen
            ? "bg-white/10 border-white/20 text-white"
            : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20"
        )}
      >
        <ArrowUpDown size={16} />
        <span>
          Sort: <span className="text-white">{getCollectionSortLabel(mode)}</span>
        </span>
        <ChevronDown size={14} className={cn("transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden backdrop-blur-3xl p-1.5 space-y-0.5"
        >
          {COLLECTION_SORT_OPTIONS.map(option => {
            const isActive = option.mode === mode;
            return (
              <button
                key={option.mode}
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  onChange(option.mode);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-start justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                  isActive ? "bg-primary/10 text-primary font-medium" : "text-gray-300 hover:bg-white/5"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  <span
                    className={cn(
                      "block text-xs mt-0.5",
                      isActive ? "text-primary/70" : "text-gray-500"
                    )}
                  >
                    {option.hint}
                  </span>
                </span>
                {isActive && <Check size={14} className="mt-0.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
