import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, GitCompareArrows, X } from "lucide-react";
import { cn } from "../../../lib/utils_ui";

// Accent colour for every comparison-year overlay. Chosen to read clearly against both the
// violet Monthly Activity area (#8b5cf6) and the emerald Score Trend line (#34d399).
export const COMPARISON_SERIES_COLOR = "#f59e0b";

interface StatsComparePickerProps {
  value: string | null;
  options: string[];
  onChange: (year: string | null) => void;
}

// Compact dropdown for a widget's header `action` slot. Lets the user pick a year to overlay,
// or clear the comparison. Renders nothing when there is nothing to compare against.
export function StatsComparePicker({ value, options, onChange }: StatsComparePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (options.length === 0) {
    return null;
  }

  const isActive = value !== null;

  const handleSelect = (year: string | null) => {
    onChange(year);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors",
          isActive
            ? "border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15"
            : "border-white/10 bg-white/5 text-gray-300 hover:border-white/20 hover:bg-white/10 hover:text-white"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <GitCompareArrows size={15} />
        <span>{isActive ? `vs ${value}` : "Compare"}</span>
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute right-0 top-full z-20 mt-2 max-h-60 min-w-[10rem] overflow-y-auto rounded-xl border border-white/10 bg-gray-900/95 p-1 shadow-2xl backdrop-blur-xl"
        >
          {isActive ? (
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={14} />
              <span>Clear comparison</span>
            </button>
          ) : null}
          {options.map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => handleSelect(year)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                year === value
                  ? "bg-amber-500/10 text-amber-200"
                  : "text-gray-300 hover:bg-white/10 hover:text-white"
              )}
              role="option"
              aria-selected={year === value}
            >
              <span>{year}</span>
              {year === value ? <Check size={14} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface ComparisonLegendProps {
  primaryYear: string;
  primaryColor: string;
  comparisonYear: string;
}

// Small swatch row shown beneath a widget header when a comparison overlay is active.
export function ComparisonLegend({ primaryYear, primaryColor, comparisonYear }: ComparisonLegendProps) {
  return (
    <div className="mb-2 flex shrink-0 items-center gap-4 text-xs text-gray-400">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: primaryColor }} />
        {primaryYear}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COMPARISON_SERIES_COLOR }} />
        {comparisonYear}
      </span>
    </div>
  );
}
