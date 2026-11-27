import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpDown,
  Captions,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HardDrive,
  RotateCcw,
  X,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "../lib/utils_ui";
import { useOptionalMainScrollContainer } from "../lib/scroll-container";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { FILTER_PRESETS, getTypeBadgeStyle, type ActiveFilterPresetKey, type FilterPresetKey } from "../lib/media-config";
import { TooltipDetail, TooltipTitle, useHoverTooltip } from "./HoverTooltip";
import { MultiSelectFilter } from "./MultiSelectFilter";

// The Year View's one bar: year, presets, types, status, sort. It is sticky so
// the filters stay one click away while scrolling.
//
// Nothing paints behind the bar: --color-background is translucent under the
// glass styles, so a full-width band of it stacked a second tint over the page
// and read as a dark strip. Instead the bar floats, and only once it is stuck
// does a frosted layer fade in behind its content so it stays legible over
// cover art. The blur covers the bar's own area only, and sits on a sibling
// layer rather than the bar itself: a backdrop-filter on the bar would make it
// the backdrop root for its dropdowns.

export type StatusFilter = boolean | null;
export type StatusKey = "localCopy" | "rewatch" | "subtitles";
export type YearSort = "oldest" | "newest" | "score" | "title";

export const YEAR_SORT_OPTIONS: { value: YearSort; label: string }[] = [
  { value: "oldest", label: "Oldest first" },
  { value: "newest", label: "Newest first" },
  { value: "score", label: "Highest rated" },
  { value: "title", label: "Title A–Z" },
];

// Status filters use the same colours as the matching glyphs on the cards, so
// a filter and what it filters for read as one thing.
const STATUS_CONFIG: Record<StatusKey, {
  label: string;
  icon: LucideIcon;
  yesClass: string;
  yes: string;
  no: string;
}> = {
  localCopy: {
    label: "Local copy",
    icon: HardDrive,
    yesClass: "border-emerald-400/40 bg-emerald-400/15 text-emerald-300",
    yes: "Only entries with a local copy",
    no: "Only entries without a local copy",
  },
  rewatch: {
    label: "Replay",
    icon: RotateCcw,
    yesClass: "border-amber-400/40 bg-amber-400/15 text-amber-300",
    yes: "Only replays",
    no: "Only first-time entries",
  },
  subtitles: {
    label: "Subtitles",
    icon: Captions,
    yesClass: "border-orange-400/40 bg-orange-400/15 text-orange-300",
    yes: "Only entries with subtitles",
    no: "Only entries without subtitles",
  },
};

const STATUS_ORDER: StatusKey[] = ["localCopy", "rewatch", "subtitles"];
const SMALL_TOOLTIP = { width: "content" as const, className: "rounded-lg px-3 py-1.5 whitespace-nowrap" };
const typeDotClass = (type: string) => getTypeBadgeStyle(type).bg;

interface YearViewToolbarProps {
  year: number;
  shownCount: number;
  totalCount: number;
  onYearStep: (delta: -1 | 1) => void;
  presetKeys: FilterPresetKey[];
  activePreset: ActiveFilterPresetKey;
  /** True when every visible type is shown and no preset is active. */
  showingAll: boolean;
  onPresetClick: (key: FilterPresetKey) => void;
  onShowAll: () => void;
  typeOptions: string[];
  selectedTypes: string[];
  onTypesChange: (types: string[]) => void;
  onTypeSolo: (type: string) => void;
  statuses: Record<StatusKey, StatusFilter>;
  onStatusCycle: (key: StatusKey) => void;
  sort: YearSort;
  onSortChange: (sort: YearSort) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onScrollToBottom: () => void;
  canScrollToBottom: boolean;
}

export function YearViewToolbar({
  year,
  shownCount,
  totalCount,
  onYearStep,
  presetKeys,
  activePreset,
  showingAll,
  onPresetClick,
  onShowAll,
  typeOptions,
  selectedTypes,
  onTypesChange,
  onTypeSolo,
  statuses,
  onStatusCycle,
  sort,
  onSortChange,
  hasActiveFilters,
  onClearFilters,
  onScrollToBottom,
  canScrollToBottom,
}: YearViewToolbarProps) {
  const { bindTooltip } = useHoverTooltip();
  const scrollContainer = useOptionalMainScrollContainer();
  const barRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  // Stuck = the bar's top edge has reached the line it sticks at. Sticky
  // offsets count from inside the scroll container's padding, so that line is
  // padding-top + top. The root margin sits 1px below it, so the observer fires
  // as the bar crosses; compare edges rather than isIntersecting, which WebKit
  // ties to the threshold (a 98%-visible bar reports false).
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = scrollContainer?.getScrollElement() ?? null;
    const rootPadding = root ? parseFloat(getComputedStyle(root).paddingTop) || 0 : 0;
    const stickLine = Math.max(0, rootPadding + (parseFloat(getComputedStyle(bar).top) || 0));
    const observer = new IntersectionObserver(
      ([entry]) => {
        const line = entry.rootBounds?.top;
        setStuck(line !== undefined && entry.boundingClientRect.top <= line);
      },
      { root, rootMargin: `-${stickLine + 1}px 0px 0px 0px`, threshold: 1 }
    );
    observer.observe(bar);
    return () => observer.disconnect();
  }, [scrollContainer]);

  return (
    // -top-3: <main> has 24px padding and sticky offsets count from inside it,
    // so -12px stops the bar 12px from the window's top edge.
    <div
      ref={barRef}
      className={cn(
        "sticky -top-3 z-40 rounded-2xl bg-white/[0.04] transition-shadow duration-200",
        stuck && "shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)]"
      )}
    >
      {/* The frost covers the whole bar, edge included. A real border would
          sit outside it and show the cards unblurred as a hairline, so the
          outline is drawn on top instead (last child below). */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 rounded-2xl bg-[rgba(26,26,29,0.82)] backdrop-blur-xl backdrop-saturate-150 transition-opacity duration-200",
          stuck ? "opacity-100" : "opacity-0"
        )}
      />
      {/* p-[11px] = the old 1px border + p-2.5, so the bar keeps its size. */}
      <div className="relative flex flex-wrap items-center gap-2 p-[11px]">
        {/* Year: the page's title, so it gets the most weight on the bar */}
        <div className="mr-1 flex items-center gap-1 border-r border-white/[0.08] pr-4">
          <button
            type="button"
            onClick={() => onYearStep(-1)}
            aria-label={`Previous year, ${year - 1}`}
            {...bindTooltip(<span>{year - 1}</span>, SMALL_TOOLTIP)}
            className="flex h-10 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-[40px] font-extrabold leading-none tracking-[-0.035em] text-primary tabular-nums">
            {year}
            <span className="sr-only"> collection</span>
          </h2>
          <button
            type="button"
            onClick={() => onYearStep(1)}
            aria-label={`Next year, ${year + 1}`}
            {...bindTooltip(<span>{year + 1}</span>, SMALL_TOOLTIP)}
            className="flex h-10 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <ChevronRight size={18} />
          </button>
          <div className="ml-2 flex flex-col gap-0.5">
            <span aria-hidden className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">Collection</span>
            <span className="whitespace-nowrap text-sm font-medium tabular-nums text-gray-200">
              {shownCount} of {totalCount}
            </span>
          </div>
        </div>

        {/* Presets */}
        <div role="group" aria-label="Presets" className="flex rounded-[10px] bg-white/[0.05] p-[3px]">
          <PresetButton active={showingAll} onClick={onShowAll}>All</PresetButton>
          {presetKeys.map((key) => {
            const PresetIcon = FILTER_PRESETS[key].icon;
            return (
              <PresetButton
                key={key}
                active={activePreset === key}
                onClick={() => onPresetClick(key)}
                icon={<PresetIcon size={15} className="shrink-0" />}
              >
                {FILTER_PRESETS[key].label}
              </PresetButton>
            );
          })}
        </div>

        {/* Types */}
        <MultiSelectFilter
          variant="toolbar"
          label="Types"
          options={typeOptions}
          selected={selectedTypes}
          onChange={onTypesChange}
          onSolo={onTypeSolo}
          optionDotClass={typeDotClass}
        />

        {/* Status: one click cycles Any → Yes → No, as before */}
        <div role="group" aria-label="Status filters" className="flex items-center gap-1">
          {STATUS_ORDER.map((key) => {
            const config = STATUS_CONFIG[key];
            const value = statuses[key];
            const Icon = config.icon;
            const stateText = value === null ? "Any" : value ? "Yes" : "No";
            return (
              <button
                key={key}
                type="button"
                onClick={() => onStatusCycle(key)}
                aria-label={`${config.label}: ${stateText}`}
                {...bindTooltip(
                  <div>
                    <TooltipTitle>{config.label}</TooltipTitle>
                    <TooltipDetail>
                      {value === null ? "Showing all · click for Yes" : value ? `${config.yes} · click for No` : `${config.no} · click to clear`}
                    </TooltipDetail>
                  </div>,
                  { width: "content", className: "rounded-lg px-3 py-2 whitespace-nowrap" }
                )}
                className={cn(
                  "flex h-10 items-center gap-1.5 rounded-[10px] border text-sm font-semibold transition-colors",
                  value === null
                    ? "w-10 justify-center border-white/[0.08] text-gray-400 hover:border-white/20 hover:text-white"
                    : value
                      ? cn("px-3", config.yesClass)
                      : "border-white/20 bg-white/10 px-3 text-gray-200"
                )}
              >
                <Icon size={16} className="shrink-0" />
                {value !== null && <span>{stateText}</span>}
              </button>
            );
          })}
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="flex h-10 items-center gap-1 rounded-[10px] px-2.5 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X size={14} />
            <span>Clear</span>
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <SortMenu sort={sort} onChange={onSortChange} />
          <button
            type="button"
            onClick={onScrollToBottom}
            disabled={!canScrollToBottom}
            aria-label="Scroll to bottom"
            {...bindTooltip(<span>Scroll to bottom</span>, SMALL_TOOLTIP)}
            className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-white/[0.08] text-gray-300 transition-colors hover:border-white/20 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-40"
          >
            <ArrowDownToLine size={16} />
          </button>
        </div>
      </div>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 rounded-2xl border transition-colors duration-200",
          stuck ? "border-white/[0.12]" : "border-white/[0.08]"
        )}
      />
    </div>
  );
}

function PresetButton({ active, onClick, icon, children }: {
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "relative flex h-[34px] items-center gap-1.5 rounded-[7px] px-3.5 text-sm font-medium transition-colors",
        active ? "text-primary" : "text-gray-300 hover:text-white"
      )}
    >
      {/* One shared highlight that slides to the active preset, like the
          Profiles view and sort switches. Same weight active or not, so the
          buttons never change width under it. */}
      {active && (
        <motion.span
          layoutId="year-preset-active"
          aria-hidden
          className="absolute inset-0 rounded-[7px] bg-[color-mix(in_srgb,var(--color-primary)_22%,transparent)]"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <span className="relative flex items-center gap-1.5">
        {icon}
        {children}
      </span>
    </button>
  );
}

// Same idiom as CollectionSortMenu: an anchored panel that closes on Escape or
// an outside press, rather than a native <select> that can't match the bar.
function SortMenu({ sort, onChange }: { sort: YearSort; onChange: (sort: YearSort) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const label = YEAR_SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "Oldest first";

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
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={cn(
          "flex h-10 items-center gap-2 rounded-[10px] border px-3.5 text-sm font-medium transition-colors",
          isOpen || sort !== "oldest"
            ? "border-white/20 bg-white/10 text-white"
            : "border-white/[0.08] text-gray-200 hover:border-white/20 hover:bg-white/5"
        )}
      >
        <ArrowUpDown size={16} />
        <span className="whitespace-nowrap">{label}</span>
        <ChevronDown size={14} className={cn("transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#1a1a1a] p-1 shadow-xl"
        >
          {YEAR_SORT_OPTIONS.map((option) => {
            const selected = option.value === sort;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  selected
                    ? "bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] font-medium text-primary"
                    : "text-gray-300 hover:bg-white/5"
                )}
              >
                <span>{option.label}</span>
                {selected && <Check size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
