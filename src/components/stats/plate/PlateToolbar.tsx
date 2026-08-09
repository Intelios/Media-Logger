import { motion } from "framer-motion";
import { ChevronDown, GitCompareArrows, SlidersHorizontal } from "lucide-react";
import { cn } from "../../../lib/utils_ui";
import type { MediaFilterPreset } from "../../../lib/media-config";
import { PlatePill } from "./plate-ui";

interface PlateToolbarProps {
  activeYear: string;
  yearOptions: string[];
  onActiveYearChange: (year: string) => void;
  entryTypes: string[];
  typeCounts: Map<string, number>;
  selectedTypes: string[];
  onSelectedTypesChange: (types: string[]) => void;
  presets: MediaFilterPreset[];
  activePreset: string | null;
  onPresetClick: (presetKey: string) => void;
  compareEnabled: boolean;
  compareYear: string | null;
  comparisonYearOptions: string[];
  onToggleCompare: () => void;
  onCompareYearChange: (year: string) => void;
  isCustomizing: boolean;
  onToggleCustomize: () => void;
}

export function PlateToolbar({
  activeYear,
  yearOptions,
  onActiveYearChange,
  entryTypes,
  typeCounts,
  selectedTypes,
  onSelectedTypesChange,
  presets,
  activePreset,
  onPresetClick,
  compareEnabled,
  compareYear,
  comparisonYearOptions,
  onToggleCompare,
  onCompareYearChange,
  isCustomizing,
  onToggleCustomize,
}: PlateToolbarProps) {
  const canCompare = comparisonYearOptions.length > 0;

  const toggleType = (type: string) => {
    const isSelected = selectedTypes.includes(type);
    // Never allow an empty selection — an empty plate is a dead end, not a filter.
    if (isSelected && selectedTypes.length === 1) {
      return;
    }

    onSelectedTypesChange(
      isSelected ? selectedTypes.filter((candidate) => candidate !== type) : [...selectedTypes, type]
    );
  };

  return (
    <header className="flex shrink-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2
          className="bg-clip-text text-xl font-bold text-transparent"
          style={{ backgroundImage: "linear-gradient(to right, var(--color-primary), var(--color-secondary))" }}
        >
          Statistics
        </h2>

        <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/5 p-0.5">
          {yearOptions.map((year) => {
            const isActive = activeYear === year;

            return (
              <button
                key={year}
                type="button"
                onClick={() => onActiveYearChange(year)}
                className={cn(
                  "relative whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                  isActive ? "text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="stats-plate-year-active"
                    className="absolute inset-0 rounded-md bg-primary"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{year}</span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1">
            <PlatePill
              active={compareEnabled}
              accent="green"
              disabled={!canCompare}
              onClick={onToggleCompare}
              title={canCompare ? "Overlay a second period" : "Pick a specific year to compare against"}
            >
              <GitCompareArrows size={13} />
              <span>Compare</span>
              {compareEnabled && compareYear ? <span className="opacity-80">· {compareYear}</span> : null}
            </PlatePill>

            {compareEnabled && canCompare ? (
              <div className="relative">
                <select
                  value={compareYear ?? ""}
                  onChange={(event) => onCompareYearChange(event.target.value)}
                  aria-label="Comparison year"
                  className="appearance-none rounded-lg border border-emerald-400/40 bg-emerald-500/15 py-1 pl-2.5 pr-6 text-[11px] font-medium text-emerald-200 outline-none"
                >
                  {comparisonYearOptions.map((year) => (
                    <option key={year} value={year} className="bg-surface text-white">
                      {year}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-emerald-200"
                />
              </div>
            ) : null}
          </div>

          <PlatePill active={isCustomizing} onClick={onToggleCustomize}>
            <SlidersHorizontal size={13} />
            <span>{isCustomizing ? "Done" : "Customise"}</span>
          </PlatePill>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {presets.map((preset) => {
          const Icon = preset.icon;
          const isActive = activePreset === preset.key;

          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => onPresetClick(preset.key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all",
                isActive
                  ? `bg-gradient-to-r ${preset.gradient} text-white`
                  : "border border-white/10 bg-white/[0.04] text-gray-400 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon size={13} />
              <span>{preset.label}</span>
            </button>
          );
        })}

        {presets.length > 0 ? <span className="h-4 w-px bg-white/10" /> : null}

        {entryTypes.map((type) => {
          const isSelected = selectedTypes.includes(type);
          const count = typeCounts.get(type) ?? 0;

          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition-colors",
                isSelected
                  ? "border-primary/50 bg-primary/15 font-semibold text-white"
                  : "border-white/10 bg-white/[0.03] text-gray-500 hover:border-white/20 hover:text-gray-300"
              )}
            >
              <span>{type}</span>
              <span className={cn("tabular-nums text-[10px]", isSelected ? "text-white/60" : "text-gray-600")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
