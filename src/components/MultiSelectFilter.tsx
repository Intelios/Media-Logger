import { useState, useRef, useEffect } from "react";
import { Filter, Check, ChevronDown } from "lucide-react";
import { cn } from "../lib/utils_ui";

interface MultiSelectFilterProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  label?: string;
  onSolo?: (option: string) => void;
  /** 'toolbar' is the trigger used in the Year View bar ("Types · All 8"). */
  variant?: "default" | "toolbar";
  /** A colour class (e.g. a type's bg-*) for a dot beside each option. */
  optionDotClass?: (option: string) => string;
}

const SOLO_DOUBLE_CLICK_DELAY = 250;

export function MultiSelectFilter({ options, selected, onChange, label = "Filter", onSolo, variant = "default", optionDotClass }: MultiSelectFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Clear any pending single-click toggle on unmount
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  const toggleOption = (option: string) => {
    const newSelected = selected.includes(option)
      ? selected.filter(item => item !== option)
      : [...selected, option];
    onChange(newSelected);
  };

  const handleOptionClick = (option: string) => {
    if (!onSolo) {
      toggleOption(option);
      return;
    }
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      return;
    }
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      toggleOption(option);
    }, SOLO_DOUBLE_CLICK_DELAY);
  };

  const handleOptionDoubleClick = (option: string) => {
    if (!onSolo) return;
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    onSolo(option);
  };

  const toggleAll = () => {
    if (selected.length === options.length) {
      onChange([]);
    } else {
      onChange([...options]);
    }
  };

  const isAllSelected = selected.length === options.length;
  const isToolbar = variant === "toolbar";
  const toolbarSummary = isAllSelected
    ? `All ${options.length}`
    : selected.length === 0 ? "None" : `${selected.length} of ${options.length}`;

  return (
    <div className="relative" ref={containerRef}>
      {isToolbar ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className={cn(
            "flex h-10 items-center gap-2 rounded-[10px] border px-3.5 text-sm font-medium transition-colors",
            isOpen || !isAllSelected
              ? "border-white/20 bg-white/10 text-white"
              : "border-white/10 text-gray-200 hover:border-white/20 hover:bg-white/5"
          )}
        >
          {optionDotClass && selected.length > 0 && (
            <span aria-hidden className="flex">
              {selected.slice(0, 3).map((option, i) => (
                <span
                  key={option}
                  className={cn("h-2 w-2 rounded-full ring-1 ring-black/40", optionDotClass(option), i > 0 && "-ml-[3px]")}
                />
              ))}
            </span>
          )}
          <span className="whitespace-nowrap">{label} · {toolbarSummary}</span>
          <ChevronDown size={14} className={cn("transition-transform", isOpen && "rotate-180")} />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all",
            selected.length > 0
              ? "bg-white/10 border-white/20 text-white"
              : "bg-transparent border-white/10 text-gray-400 hover:border-white/30"
          )}
        >
          <Filter size={16} />
          <span>{label} {selected.length > 0 && selected.length < options.length && `(${selected.length})`}</span>
          <ChevronDown size={14} className={cn("ml-1 transition-transform", isOpen && "rotate-180")} />
        </button>
      )}

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden backdrop-blur-3xl p-1">
          {/* Header Actions */}
          <div className="p-2 border-b border-white/5 mb-1">
            <button 
              onClick={toggleAll}
              className="w-full text-left px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-primary transition-colors rounded flex justify-between items-center"
            >
              <span>{isAllSelected ? "Deselect All" : "Select All"}</span>
              {isAllSelected && <Check size={14} className="text-primary" />}
            </button>
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1 space-y-0.5">
            {options.map(option => {
              const isSelected = selected.includes(option);
              return (
                <button
                  key={option}
                  onClick={() => handleOptionClick(option)}
                  onDoubleClick={() => handleOptionDoubleClick(option)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left",
                    isSelected 
                      ? "bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] text-primary font-medium" 
                      : "text-gray-300 hover:bg-white/5"
                  )}
                >
                  <span className="flex items-center gap-2">
                    {optionDotClass && (
                      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", optionDotClass(option))} />
                    )}
                    {option}
                  </span>
                  {isSelected && <Check size={14} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}