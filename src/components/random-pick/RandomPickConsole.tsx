import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Link2, ListFilter, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type { RandomPickFilterOptions, RandomPickFilters } from "../../lib/db";
import { getTypeBadgeStyle } from "../../lib/media-config";
import {
  applySearchFilters,
  clearChipField,
  cycleChip,
  hasActiveRandomPickFilters,
  hasSearchFilters,
  searchFiltersApplied,
  type ChipField,
  type SearchFilterSnapshot,
} from "../../lib/random-pick/filters";
import { cn } from "../../lib/utils_ui";
import { ScoreRangeSlider } from "../ScoreRangeSlider";
import { SelectionCounts, TriStateChips, TriStateChipSection } from "./TriStateChips";

type FiltersUpdater = (update: (current: RandomPickFilters) => RandomPickFilters) => void;

interface RandomPickConsoleProps {
  filters: RandomPickFilters;
  filterOptions: RandomPickFilterOptions | null;
  matchCount: number | null;
  searchFilters: SearchFilterSnapshot | null;
  onFiltersChange: FiltersUpdater;
  onReset: () => void;
  onDeal: () => void;
}

// Pill toggle for 2-4 options
function PillToggle({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex gap-1 rounded-xl border border-white/5 bg-white/5 p-1">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              active ? "bg-white/15 text-white shadow-sm" : "text-gray-400 hover:text-gray-200",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Themed dropdown — uses CSS vars for surface/border to match the rest of the app
function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  ariaLabel?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className={cn(
          "flex min-w-[110px] items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all",
          value ? "border-white/20 bg-white/10 text-white" : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20",
        )}
        style={{ borderColor: value ? undefined : "var(--color-border)" }}
      >
        <span className="flex-1 truncate text-left">{selected?.label || placeholder}</span>
        <ChevronDown size={14} className={cn("shrink-0 transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div
          className="absolute left-0 z-[60] mt-2 w-full min-w-[140px] overflow-hidden rounded-xl p-1 shadow-2xl backdrop-blur-3xl"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <div role="listbox" className="custom-scrollbar max-h-48 space-y-0.5 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  opt.value === value ? "bg-white/10 font-medium text-white" : "text-gray-300 hover:bg-white/5",
                )}
              >
                <span>{opt.label}</span>
                {opt.value === value && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterField({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

function ConsolePanel({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section
      className="flex min-h-0 flex-col overflow-hidden rounded-2xl border"
      style={{
        borderColor: "var(--color-border)",
        background:
          "linear-gradient(to bottom, color-mix(in srgb, var(--color-surface) 55%, transparent), color-mix(in srgb, var(--color-background-alt) 35%, transparent))",
      }}
    >
      <header
        className="flex shrink-0 items-center gap-3 border-b px-5 py-3.5"
        style={{ borderColor: "var(--color-border-subtle)" }}
      >
        <span
          className="rounded-lg p-1.5"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-primary) 16%, transparent)",
            color: "var(--color-primary)",
          }}
        >
          {icon}
        </span>
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="text-[11px] text-gray-500">{subtitle}</p>
        </div>
      </header>
      <div className="custom-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto p-5">{children}</div>
    </section>
  );
}

/** Small stacked-cards glyph for the Pick button. */
function DeckGlyph() {
  return (
    <span className="relative inline-block h-[18px] w-[14px]" aria-hidden="true">
      <span className="absolute inset-0 -rotate-[14deg] rounded-[3px] border border-white/50 bg-white/15" />
      <span className="absolute inset-0 rotate-[2deg] rounded-[3px] border border-white/70 bg-white/25" />
      <span className="absolute inset-0 rotate-[16deg] rounded-[3px] border border-white bg-white/40" />
    </span>
  );
}

const PEOPLE_FIELDS = [
  { key: "actresses", label: "Actress" },
  { key: "directors", label: "Director" },
  { key: "authors", label: "Author" },
] as const;

export function RandomPickConsole({
  filters,
  filterOptions,
  matchCount,
  searchFilters,
  onFiltersChange,
  onReset,
  onDeal,
}: RandomPickConsoleProps) {
  const update = <K extends keyof RandomPickFilters>(key: K, value: RandomPickFilters[K]) =>
    onFiltersChange((current) => ({ ...current, [key]: value }));
  const cycle = (field: ChipField) => (value: string) => onFiltersChange((current) => cycleChip(current, field, value));
  const clear = (field: ChipField) => () => onFiltersChange((current) => clearChipField(current, field));

  const yearOptions = (filterOptions?.years ?? []).map((y) => ({ value: String(y), label: String(y) }));
  const noMatches = matchCount === 0;
  const canDeal = matchCount !== null && matchCount > 0;
  const canApplySearch = hasSearchFilters(searchFilters) && !searchFiltersApplied(filters, searchFilters);
  const peopleChips = PEOPLE_FIELDS.flatMap(({ key, label }) =>
    filters[key].map((value) => ({ key, label, value })),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="custom-scrollbar grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-visible">
        <ConsolePanel icon={<SlidersHorizontal size={16} />} title="Basics" subtitle="Type, rating, year and status">
          <FilterField
            label="Type"
            aside={<SelectionCounts include={filters.entryTypes.length} exclude={filters.excludedEntryTypes.length} />}
          >
            {filterOptions ? (
              <TriStateChips
                options={filterOptions.entryTypes}
                include={filters.entryTypes}
                exclude={filters.excludedEntryTypes}
                onCycle={cycle("entryTypes")}
                renderIcon={(type) => <span className="opacity-70">{getTypeBadgeStyle(type).icon}</span>}
                emptyHint="No types in your library"
              />
            ) : (
              <div className="h-8 w-48 animate-pulse rounded-xl bg-white/5" />
            )}
          </FilterField>

          <FilterField
            label="Rating"
            aside={
              filters.scoreRange ? (
                <button
                  type="button"
                  onClick={() => update("scoreRange", null)}
                  className="flex items-center gap-1 text-[11px] text-gray-500 transition-colors hover:text-white"
                >
                  <RotateCcw size={10} />
                  Any rating
                </button>
              ) : (
                <span className="text-[11px] text-gray-600">Any rating</span>
              )
            }
          >
            <div className={cn("transition-opacity", !filters.scoreRange && "opacity-60 hover:opacity-100")}>
              <ScoreRangeSlider
                value={filters.scoreRange ?? { min: 0, max: 10 }}
                onChange={(range) => update("scoreRange", range)}
              />
            </div>
            <p className="text-[11px] text-gray-600">
              {filters.scoreRange
                ? "Only scored entries in this range are included."
                : "Any score, including unscored entries."}
            </p>
          </FilterField>

          <FilterField label="Year Completed">
            <div className="space-y-2.5">
              <PillToggle
                ariaLabel="Year mode"
                value={filters.yearMode}
                onChange={(v) => update("yearMode", v as RandomPickFilters["yearMode"])}
                options={[
                  { value: "any", label: "Any" },
                  { value: "exact", label: "Exact" },
                  { value: "range", label: "Range" },
                ]}
              />
              {filters.yearMode === "exact" && (
                <CustomSelect
                  ariaLabel="Year"
                  value={filters.yearExact != null ? String(filters.yearExact) : ""}
                  onChange={(v) => update("yearExact", v ? parseInt(v) : null)}
                  options={yearOptions}
                  placeholder="Select year"
                />
              )}
              {filters.yearMode === "range" && (
                <div className="flex flex-wrap items-center gap-2">
                  <CustomSelect
                    ariaLabel="From year"
                    value={filters.yearFrom != null ? String(filters.yearFrom) : ""}
                    onChange={(v) => update("yearFrom", v ? parseInt(v) : null)}
                    options={[...yearOptions].reverse()}
                    placeholder="From"
                  />
                  <span className="text-xs text-gray-500">to</span>
                  <CustomSelect
                    ariaLabel="To year"
                    value={filters.yearTo != null ? String(filters.yearTo) : ""}
                    onChange={(v) => update("yearTo", v ? parseInt(v) : null)}
                    options={yearOptions}
                    placeholder="To"
                  />
                </div>
              )}
            </div>
          </FilterField>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">
            <FilterField label="Local Copy">
              <PillToggle
                ariaLabel="Local copy"
                value={filters.localCopy}
                onChange={(v) => update("localCopy", v as RandomPickFilters["localCopy"])}
                options={[
                  { value: "any", label: "Any" },
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
              />
            </FilterField>
            <FilterField label="Replay">
              <PillToggle
                ariaLabel="Replay status"
                value={filters.rewatchStatus}
                onChange={(v) => update("rewatchStatus", v as RandomPickFilters["rewatchStatus"])}
                options={[
                  { value: "any", label: "Any" },
                  { value: "never", label: "Never" },
                  { value: "has", label: "Has" },
                ]}
              />
            </FilterField>
            <FilterField label="Duplicates">
              <PillToggle
                ariaLabel="Duplicates filter"
                value={filters.duplicates}
                onChange={(v) => update("duplicates", v as RandomPickFilters["duplicates"])}
                options={[
                  { value: "any", label: "Any" },
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
              />
            </FilterField>
          </div>
        </ConsolePanel>

        <ConsolePanel icon={<ListFilter size={16} />} title="Refine" subtitle="Genre, platform, franchise and series">
          {peopleChips.length > 0 && (
            <FilterField label="From Search">
              <div className="flex flex-wrap gap-1.5">
                {peopleChips.map((chip) => (
                  <span
                    key={`${chip.key}:${chip.value}`}
                    className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-1 pl-2.5 pr-1.5 text-xs text-gray-300"
                  >
                    <span className="text-gray-500">{chip.label}</span>
                    <span>{chip.value}</span>
                    <button
                      type="button"
                      onClick={() =>
                        onFiltersChange((current) => ({
                          ...current,
                          [chip.key]: current[chip.key].filter((value) => value !== chip.value),
                        }))
                      }
                      className="rounded-full p-0.5 text-gray-500 hover:bg-white/10 hover:text-white"
                      aria-label={`Remove ${chip.label} ${chip.value}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </FilterField>
          )}

          {filterOptions ? (
            <div className="space-y-2">
              <TriStateChipSection
                label="Genre"
                defaultOpen
                options={filterOptions.genres}
                include={filters.genres}
                exclude={filters.excludedGenres}
                onCycle={cycle("genres")}
                onClear={clear("genres")}
              />
              <TriStateChipSection
                label="Platform"
                options={filterOptions.platforms}
                include={filters.platforms}
                exclude={filters.excludedPlatforms}
                onCycle={cycle("platforms")}
                onClear={clear("platforms")}
              />
              <TriStateChipSection
                label="Franchise"
                options={filterOptions.franchises}
                include={filters.franchises}
                exclude={filters.excludedFranchises}
                onCycle={cycle("franchises")}
                onClear={clear("franchises")}
              />
              <TriStateChipSection
                label="Series"
                options={filterOptions.series}
                include={filters.series}
                exclude={filters.excludedSeries}
                onCycle={cycle("series")}
                onClear={clear("series")}
              />
            </div>
          ) : (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-white/5" />
              ))}
            </div>
          )}
        </ConsolePanel>
      </div>

      <footer
        className="flex shrink-0 flex-wrap items-center gap-3 rounded-2xl border px-4 py-3"
        style={{
          borderColor: "var(--color-border)",
          background:
            "linear-gradient(to right, color-mix(in srgb, var(--color-primary) 8%, transparent), color-mix(in srgb, var(--color-secondary) 5%, transparent))",
        }}
      >
        {matchCount !== null ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{
              backgroundColor: noMatches ? "rgba(245, 158, 11, 0.12)" : "color-mix(in srgb, var(--color-primary) 18%, transparent)",
              color: noMatches ? "#FBBF24" : "var(--color-primary)",
            }}
            aria-live="polite"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: noMatches ? "#FBBF24" : "var(--color-primary)" }}
            />
            {noMatches ? "No matches" : `${matchCount} ${matchCount === 1 ? "match" : "matches"}`}
          </span>
        ) : (
          <span className="inline-flex animate-pulse items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-500">
            Counting…
          </span>
        )}

        {noMatches && (
          <span className="text-xs text-amber-300/80">No entries match these filters.</span>
        )}

        {canApplySearch && (
          <button
            type="button"
            onClick={() => onFiltersChange((current) => applySearchFilters(current, searchFilters))}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Link2 size={13} style={{ color: "var(--color-primary)" }} />
            Use search filters
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {hasActiveRandomPickFilters(filters) && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-gray-400 transition-all hover:bg-white/5 hover:text-white"
            >
              <RotateCcw size={12} />
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={onDeal}
            disabled={!canDeal}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-6 py-3 text-sm font-bold text-white transition-all",
              canDeal ? "hover:scale-[1.02] active:scale-[0.98]" : "cursor-not-allowed bg-white/5 text-gray-500",
            )}
            style={
              canDeal
                ? {
                    background: "linear-gradient(to right, var(--color-primary), var(--color-secondary))",
                    boxShadow: "0 10px 24px -8px color-mix(in srgb, var(--color-primary) 55%, transparent)",
                  }
                : undefined
            }
          >
            <DeckGlyph />
            Pick Random
          </button>
        </div>
      </footer>
    </div>
  );
}
