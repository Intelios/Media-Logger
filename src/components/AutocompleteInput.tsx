import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "../lib/utils_ui";

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  /** If true, treats value as comma-separated and autocompletes the current token */
  multiValue?: boolean;
}

export function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  multiValue = false,
}: AutocompleteInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Parse current token for multi-value fields
  const getCurrentToken = useCallback(() => {
    if (!multiValue) return value;
    const parts = value.split(",");
    return (parts[parts.length - 1] || "").trimStart();
  }, [value, multiValue]);

  // Get already-used tokens for multi-value fields (to avoid re-suggesting)
  const getUsedTokens = useCallback(() => {
    if (!multiValue) return new Set<string>();
    const parts = value.split(",");
    // Exclude the current (last) token
    const used = parts.slice(0, -1).map(p => p.trim().toLowerCase()).filter(Boolean);
    return new Set(used);
  }, [value, multiValue]);

  // Filter suggestions based on current input
  const filtered = (() => {
    const token = getCurrentToken().toLowerCase();
    if (!token) return [];
    const used = getUsedTokens();
    return suggestions.filter(s => {
      const lower = s.toLowerCase();
      // Don't suggest exact match of current token, or already-used tokens
      if (lower === token) return false;
      if (used.has(lower)) return false;
      return lower.includes(token);
    });
  })();

  const isOpen = isFocused && filtered.length > 0;

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(-1);
  }, [filtered.length, value]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const items = listRef.current.children;
      if (items[highlightIndex]) {
        (items[highlightIndex] as HTMLElement).scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightIndex]);

  const selectSuggestion = (suggestion: string) => {
    if (multiValue) {
      const parts = value.split(",");
      parts[parts.length - 1] = (parts.length > 1 ? " " : "") + suggestion;
      onChange(parts.join(",") + ", ");
    } else {
      onChange(suggestion);
    }
    setIsFocused(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex(prev => (prev + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex(prev => (prev <= 0 ? filtered.length - 1 : prev - 1));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      selectSuggestion(filtered[highlightIndex]);
    } else if (e.key === "Escape") {
      setIsFocused(false);
    }
  };

  // Highlight matching substring in suggestion text
  const highlightMatch = (text: string) => {
    const token = getCurrentToken().toLowerCase();
    const idx = text.toLowerCase().indexOf(token);
    if (idx === -1 || !token) return <span>{text}</span>;
    return (
      <>
        {text.slice(0, idx)}
        <span className="text-primary font-semibold">{text.slice(idx, idx + token.length)}</span>
        {text.slice(idx + token.length)}
      </>
    );
  };

  return (
    <div className="relative" ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {isOpen && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 mt-1.5 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden backdrop-blur-3xl p-1"
        >
          <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-0.5">
            {filtered.map((suggestion, i) => (
              <button
                key={suggestion}
                type="button"
                onMouseDown={e => {
                  e.preventDefault(); // Prevent input blur
                  selectSuggestion(suggestion);
                }}
                onMouseEnter={() => setHighlightIndex(i)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                  i === highlightIndex
                    ? "bg-primary/10 text-primary"
                    : "text-gray-300 hover:bg-white/5"
                )}
              >
                {highlightMatch(suggestion)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
