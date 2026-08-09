import { useEffect, useState } from "react";
import { cn } from "../../../lib/utils_ui";
import { isCellInRange, rangeFromCells, type BrushCell, type StatsRange } from "./plate-data";

interface BrushStripProps {
  cells: BrushCell[];
  range: StatsRange | null;
  onRangeChange: (range: StatsRange | null) => void;
}

// Four steps is enough to read density at this size; more just produces bands
// that are indistinguishable on a 14px-tall strip.
function intensityClass(count: number, maxCount: number): string {
  if (count === 0) {
    return "bg-white/[0.05]";
  }

  const ratio = maxCount > 0 ? count / maxCount : 0;
  if (ratio > 0.66) return "bg-purple-500/90";
  if (ratio > 0.33) return "bg-purple-500/60";
  return "bg-purple-500/30";
}

export function BrushStrip({ cells, range, onRangeChange }: BrushStripProps) {
  const [drag, setDrag] = useState<{ anchor: number; head: number } | null>(null);

  // Commit on pointerup anywhere so a drag that leaves the strip still resolves
  // instead of leaving the selection stuck to the cursor.
  useEffect(() => {
    if (!drag) {
      return;
    }

    const handlePointerUp = () => {
      onRangeChange(rangeFromCells(cells, drag.anchor, drag.head));
      setDrag(null);
    };

    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, [drag, cells, onRangeChange]);

  if (cells.length === 0) {
    return null;
  }

  const maxCount = cells.reduce((max, cell) => Math.max(max, cell.count), 0);
  const previewRange = drag ? rangeFromCells(cells, drag.anchor, drag.head) : range;
  const hasSelection = previewRange !== null;

  return (
    <div className="flex shrink-0 flex-col gap-1 select-none">
      <div
        className="flex items-stretch gap-[2px]"
        onDoubleClick={() => onRangeChange(null)}
        role="group"
        aria-label="Select a date range"
      >
        {cells.map((cell, index) => {
          const isSelected = isCellInRange(cell, previewRange);

          return (
            <button
              key={cell.key}
              type="button"
              title={`${cell.label} · ${cell.count} ${cell.count === 1 ? "entry" : "entries"}`}
              onPointerDown={(event) => {
                event.preventDefault();
                setDrag({ anchor: index, head: index });
              }}
              onPointerEnter={() => {
                setDrag((current) => (current ? { ...current, head: index } : null));
              }}
              className={cn(
                "h-3.5 min-w-0 flex-1 rounded-[2px] transition-all",
                cell.hasMultiLog ? "bg-amber-400/90" : intensityClass(cell.count, maxCount),
                // Dimming everything outside the selection reads instantly; an
                // outline alone disappears against a strip of mostly-empty cells.
                hasSelection && !isSelected && "opacity-25",
                isSelected && "ring-1 ring-purple-300/80",
                !hasSelection && "hover:brightness-150"
              )}
            />
          );
        })}
      </div>

    </div>
  );
}
