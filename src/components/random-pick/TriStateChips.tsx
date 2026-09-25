import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "../../lib/utils_ui";
import type { ChipState } from "../../lib/random-pick/filters";

const STATE_LABEL: Record<ChipState, string> = {
  off: "not filtered",
  include: "included",
  exclude: "excluded",
};

interface TriStateChipsProps {
  options: string[];
  include: string[];
  exclude: string[];
  onCycle: (value: string) => void;
  emptyHint?: string;
  renderIcon?: (value: string) => ReactNode;
}

/**
 * Chips that cycle off → include → exclude → off. Included chips take the
 * theme accent with a plus; excluded chips turn red, struck through, with a
 * minus — so both sets read at a glance in one list.
 */
export function TriStateChips({ options, include, exclude, onCycle, emptyHint, renderIcon }: TriStateChipsProps) {
  const includeSet = useMemo(() => new Set(include), [include]);
  const excludeSet = useMemo(() => new Set(exclude), [exclude]);

  if (options.length === 0) {
    return emptyHint ? <p className="text-xs italic text-gray-600">{emptyHint}</p> : null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const state: ChipState = includeSet.has(option) ? "include" : excludeSet.has(option) ? "exclude" : "off";
        return (
          <button
            key={option}
            type="button"
            onClick={() => onCycle(option)}
            aria-label={`${option}: ${STATE_LABEL[state]}`}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
              state === "off" && "border-transparent bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200",
              state === "include" && "text-white",
              state === "exclude" && "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/15",
            )}
            style={
              state === "include"
                ? {
                    backgroundColor: "color-mix(in srgb, var(--color-primary) 20%, transparent)",
                    borderColor: "color-mix(in srgb, var(--color-primary) 50%, transparent)",
                  }
                : undefined
            }
          >
            {state === "include" && <Plus size={11} strokeWidth={3} style={{ color: "var(--color-primary)" }} />}
            {state === "exclude" && <Minus size={11} strokeWidth={3} />}
            {renderIcon?.(option)}
            <span className={cn(state === "exclude" && "line-through decoration-red-400/70")}>{option}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SelectionCounts({ include, exclude }: { include: number; exclude: number }) {
  if (include === 0 && exclude === 0) return null;
  return (
    <span className="flex items-center gap-1">
      {include > 0 && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-primary) 20%, transparent)",
            color: "var(--color-primary)",
          }}
        >
          +{include}
        </span>
      )}
      {exclude > 0 && (
        <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
          −{exclude}
        </span>
      )}
    </span>
  );
}

interface TriStateChipSectionProps extends Omit<TriStateChipsProps, "emptyHint"> {
  label: string;
  onClear: () => void;
  defaultOpen?: boolean;
}

/** Collapsible chip list for the Refine column; keeps long option lists folded away. */
export function TriStateChipSection({
  label,
  options,
  include,
  exclude,
  onCycle,
  onClear,
  renderIcon,
  defaultOpen = false,
}: TriStateChipSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const selected = include.length + exclude.length;

  return (
    <div className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-white/5"
      >
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          {label}
          <span className="font-medium normal-case tracking-normal text-gray-600">{options.length}</span>
        </span>
        <span className="flex items-center gap-2">
          <SelectionCounts include={include.length} exclude={exclude.length} />
          <ChevronDown size={14} className={cn("text-gray-500 transition-transform", isOpen && "rotate-180")} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-2.5 px-3.5 pb-3.5 pt-1">
              {options.length > 0 && (
                <div className="flex items-center justify-between gap-3 text-[11px] text-gray-600">
                  <span>Click to include, again to exclude</span>
                  {selected > 0 && (
                    <button
                      type="button"
                      onClick={onClear}
                      className="flex items-center gap-1 text-gray-500 transition-colors hover:text-white"
                    >
                      <RotateCcw size={10} />
                      Clear
                    </button>
                  )}
                </div>
              )}
              <TriStateChips
                options={options}
                include={include}
                exclude={exclude}
                onCycle={onCycle}
                renderIcon={renderIcon}
                emptyHint={`No ${label.toLowerCase()} in your library`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
