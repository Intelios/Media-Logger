import { useState, useRef, useEffect } from "react";
import { Filter, Check, ChevronDown } from "lucide-react";
import { cn } from "../lib/utils_ui";

interface MultiSelectFilterProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  label?: string;
}

export function MultiSelectFilter({ options, selected, onChange, label = "Filter" }: MultiSelectFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const toggleOption = (option: string) => {
    const newSelected = selected.includes(option)
      ? selected.filter(item => item !== option)
      : [...selected, option];
    onChange(newSelected);
  };

  const toggleAll = () => {
    if (selected.length === options.length) {
      onChange([]);
    } else {
      onChange([...options]);
    }
  };

  const isAllSelected = selected.length === options.length;

  return (
    <div className="relative" ref={containerRef}>
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
                  onClick={() => toggleOption(option)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left",
                    isSelected 
                      ? "bg-primary/10 text-primary font-medium" 
                      : "text-gray-300 hover:bg-white/5"
                  )}
                >
                  <span>{option}</span>
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