import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Dices,
  RotateCcw,
  Shuffle,
  ChevronDown,
  Check,
  Sparkles,
  Filter as FilterIcon,
  Link2,
} from "lucide-react";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";
import { dbService, type MediaEntry, type RandomPickFilters, type RandomPickFilterOptions } from "../lib/db";
import { awardsLogic } from "../lib/awards-logic";
import { MediaCard, type MediaAward } from "./MediaCard";
import { cn } from "../lib/utils_ui";

interface RandomPickModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Optional search context to pre-fill the modal. When provided, the user can
   * opt-in to "Use current search" to copy the parent page's active filters
   * (e.g., free-text query + active filter chips) into the random picker.
   */
  initialSearchContext?: {
    query?: string;
    entryTypes?: string[];
    platforms?: string[];
    actresses?: string[];
    directors?: string[];
    authors?: string[];
    franchises?: string[];
    series?: string[];
  } | null;
}

const DEFAULT_FILTERS: RandomPickFilters = {
  query: "",
  entryTypes: [],
  ratingOperator: "any",
  ratingValue: 5,
  yearMode: "any",
  yearExact: null,
  yearFrom: null,
  yearTo: null,
  localCopy: "any",
  rewatchStatus: "any",
  genres: [],
  platforms: [],
  actresses: [],
  directors: [],
  authors: [],
  franchises: [],
  series: [],
};

const RATING_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const matchesSearchContext = (
  ctx: NonNullable<RandomPickModalProps["initialSearchContext"]>
): boolean => {
  return Boolean(
    (ctx.query && ctx.query.trim().length > 0) ||
      (ctx.entryTypes && ctx.entryTypes.length > 0) ||
      (ctx.platforms && ctx.platforms.length > 0) ||
      (ctx.actresses && ctx.actresses.length > 0) ||
      (ctx.directors && ctx.directors.length > 0) ||
      (ctx.authors && ctx.authors.length > 0) ||
      (ctx.franchises && ctx.franchises.length > 0) ||
      (ctx.series && ctx.series.length > 0)
  );
};

const contextLabel = (ctx: NonNullable<RandomPickModalProps["initialSearchContext"]>): string => {
  const parts: string[] = [];
  if (ctx.query && ctx.query.trim()) parts.push(`"${ctx.query.trim()}"`);
  const total =
    (ctx.entryTypes?.length ?? 0) +
    (ctx.platforms?.length ?? 0) +
    (ctx.actresses?.length ?? 0) +
    (ctx.directors?.length ?? 0) +
    (ctx.authors?.length ?? 0) +
    (ctx.franchises?.length ?? 0) +
    (ctx.series?.length ?? 0);
  if (total > 0) parts.push(`${total} filter${total !== 1 ? "s" : ""}`);
  return parts.join(" · ");
};

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
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex gap-1 bg-white/5 rounded-xl p-1 border border-white/5"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              active
                ? "bg-white/15 text-white shadow-sm"
                : "text-gray-400 hover:text-gray-200"
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
          "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-all min-w-[110px]",
          value
            ? "bg-white/10 border-white/20 text-white"
            : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
        )}
        style={{ borderColor: value ? undefined : "var(--color-border)" }}
      >
        <span className="flex-1 text-left truncate">{selected?.label || placeholder}</span>
        <ChevronDown
          size={14}
          className={cn("transition-transform shrink-0", isOpen && "rotate-180")}
        />
      </button>
      {isOpen && (
        <div
          className="absolute left-0 mt-2 w-full min-w-[140px] rounded-xl shadow-2xl z-[60] overflow-hidden backdrop-blur-3xl p-1"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            role="listbox"
            className="max-h-48 overflow-y-auto custom-scrollbar space-y-0.5"
          >
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
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left",
                  opt.value === value
                    ? "bg-white/10 text-white font-medium"
                    : "text-gray-300 hover:bg-white/5"
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

// Chip picker for inline multi-select
function ChipPicker({
  options,
  selected,
  onChange,
  emptyHint,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  emptyHint?: string;
}) {
  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  };

  if (options.length === 0) {
    return emptyHint ? <p className="text-xs text-gray-600 italic">{emptyHint}</p> : null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            aria-pressed={active}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
              active
                ? "bg-white/15 border-white/25 text-white"
                : "bg-white/5 border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/8"
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// Collapsible section that holds a chip grid — keeps the modal compact.
function CollapsibleChipSection({
  label,
  icon,
  options,
  selected,
  onChange,
  defaultOpen = false,
  alwaysRender = true,
}: {
  label: string;
  icon?: React.ReactNode;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  defaultOpen?: boolean;
  alwaysRender?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (!alwaysRender && options.length === 0) return null;

  const count = selected.length;

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-left hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          {icon}
          {label}
        </span>
        <span className="flex items-center gap-2">
          {count > 0 && (
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-primary) 20%, transparent)",
                color: "var(--color-primary)",
              }}
            >
              {count}
            </span>
          )}
          <ChevronDown
            size={14}
            className={cn(
              "text-gray-500 transition-transform",
              isOpen && "rotate-180"
            )}
          />
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
            <div className="px-3.5 pb-3.5 pt-1">
              <ChipPicker
                options={options}
                selected={selected}
                onChange={onChange}
                emptyHint={`No ${label.toLowerCase()} available`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </label>
      {children}
    </div>
  );
}

const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
};

export function RandomPickModal({ isOpen, onClose, initialSearchContext }: RandomPickModalProps) {
  const [filters, setFilters] = useState<RandomPickFilters>({ ...DEFAULT_FILTERS });
  const [filterOptions, setFilterOptions] = useState<RandomPickFilterOptions | null>(null);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [pickedEntry, setPickedEntry] = useState<MediaEntry | null>(null);
  const [pickedAwards, setPickedAwards] = useState<MediaAward[]>([]);
  const [phase, setPhase] = useState<"configure" | "shuffling" | "result">("configure");
  const [isPickLoading, setIsPickLoading] = useState(false);
  const [shuffleText, setShuffleText] = useState<string>("");
  const [usedSearchContext, setUsedSearchContext] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const countTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shuffleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reduceMotionRef = useRef(false);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  // Reset state every time the modal opens
  useEffect(() => {
    if (isOpen) {
      setFilters({ ...DEFAULT_FILTERS });
      setPhase("configure");
      setPickedEntry(null);
      setPickedAwards([]);
      setMatchCount(null);
      setUsedSearchContext(false);
      reduceMotionRef.current = prefersReducedMotion();
      dbService.getRandomPickFilterOptions().then(setFilterOptions).catch(console.error);
    }
  }, [isOpen]);

  useEffect(() => () => {
    if (countTimerRef.current) clearTimeout(countTimerRef.current);
    if (shuffleTimerRef.current) clearInterval(shuffleTimerRef.current);
  }, []);

  const updateCount = useCallback((f: RandomPickFilters) => {
    if (countTimerRef.current) clearTimeout(countTimerRef.current);
    countTimerRef.current = setTimeout(() => {
      dbService.getRandomPickCount(f).then(setMatchCount).catch(console.error);
    }, 200);
  }, []);

  useEffect(() => {
    if (isOpen && phase === "configure") {
      updateCount(filters);
    }
    return () => {
      if (countTimerRef.current) clearTimeout(countTimerRef.current);
    };
  }, [filters, isOpen, phase, updateCount]);

  const updateFilter = <K extends keyof RandomPickFilters>(
    key: K,
    value: RandomPickFilters[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const hasActiveFilters = useMemo(
    () =>
      filters.query.trim().length > 0 ||
      filters.entryTypes.length > 0 ||
      filters.ratingOperator !== "any" ||
      filters.yearMode !== "any" ||
      filters.localCopy !== "any" ||
      filters.rewatchStatus !== "any" ||
      filters.genres.length > 0 ||
      filters.platforms.length > 0 ||
      filters.actresses.length > 0 ||
      filters.directors.length > 0 ||
      filters.authors.length > 0 ||
      filters.franchises.length > 0 ||
      filters.series.length > 0,
    [filters]
  );

  const fetchEntry = useCallback(async (): Promise<MediaEntry | null> => {
    return dbService.getRandomEntry(filters);
  }, [filters]);

  const runPickAnimation = useCallback(
    async (entry: MediaEntry) => {
      setPickedEntry(entry);

      // Award fetching runs in parallel with the shuffle
      let awards: MediaAward[] = [];
      if (entry.id) {
        try {
          const all = await awardsLogic.getAwardsForMedia(entry.id);
          awards = all;
        } catch (err) {
          console.error("Failed to fetch awards for picked entry:", err);
        }
      }

      if (reduceMotionRef.current) {
        setPickedAwards(awards);
        setPhase("result");
        return;
      }

      setPhase("shuffling");
      const start = performance.now();
      const duration = 650;
      const sampleNames = shuffleText ? [shuffleText, entry.name] : [entry.name];

      if (shuffleTimerRef.current) clearInterval(shuffleTimerRef.current);
      shuffleTimerRef.current = setInterval(() => {
        const elapsed = performance.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        if (progress >= 1) {
          if (shuffleTimerRef.current) {
            clearInterval(shuffleTimerRef.current);
            shuffleTimerRef.current = null;
          }
          return;
        }
        setShuffleText((current) => {
          if (progress >= 1) return entry.name;
          const pool = sampleNames.length > 1 ? sampleNames : [entry.name];
          const next = pool[Math.floor(Math.random() * pool.length)];
          if (next === current) {
            return pool[(pool.indexOf(current) + 1) % pool.length];
          }
          return next;
        });
      }, 60);

      // Wait out the duration
      await new Promise<void>((resolve) => {
        const check = () => {
          if (performance.now() - start >= duration) resolve();
          else requestAnimationFrame(check);
        };
        check();
      });
      if (shuffleTimerRef.current) {
        clearInterval(shuffleTimerRef.current);
        shuffleTimerRef.current = null;
      }
      setShuffleText(entry.name);
      setPickedAwards(awards);
      setPhase("result");
    },
    [shuffleText]
  );

  const handlePick = async () => {
    setIsPickLoading(true);
    try {
      const entry = await fetchEntry();
      if (entry) {
        await runPickAnimation(entry);
      }
    } catch (err) {
      console.error("Random pick failed:", err);
    } finally {
      setIsPickLoading(false);
    }
  };

  const handleReroll = async () => {
    setIsPickLoading(true);
    try {
      const entry = await fetchEntry();
      if (entry) {
        await runPickAnimation(entry);
      }
    } catch (err) {
      console.error("Re-roll failed:", err);
    } finally {
      setIsPickLoading(false);
    }
  };

  const handleApplySearchContext = () => {
    if (!initialSearchContext) return;
    setFilters((prev) => ({
      ...prev,
      query: initialSearchContext.query?.trim() ?? prev.query,
      entryTypes: initialSearchContext.entryTypes ?? prev.entryTypes,
      platforms: initialSearchContext.platforms ?? prev.platforms,
      actresses: initialSearchContext.actresses ?? prev.actresses,
      directors: initialSearchContext.directors ?? prev.directors,
      authors: initialSearchContext.authors ?? prev.authors,
      franchises: initialSearchContext.franchises ?? prev.franchises,
      series: initialSearchContext.series ?? prev.series,
    }));
    setUsedSearchContext(true);
  };

  const handleClearSearchContext = () => {
    setFilters((prev) => ({
      ...prev,
      query: "",
      entryTypes: [],
      platforms: [],
      actresses: [],
      directors: [],
      authors: [],
      franchises: [],
      series: [],
    }));
    setUsedSearchContext(false);
  };

  if (!isOpen) return null;

  const yearOptions = (filterOptions?.years ?? []).map((y) => ({
    value: String(y),
    label: String(y),
  }));

  const noMatches = matchCount === 0;
  const canPick = matchCount !== null && matchCount > 0 && !isPickLoading;

  const hasSearchContext = initialSearchContext && matchesSearchContext(initialSearchContext);
  const showSearchContextLink = hasSearchContext && !usedSearchContext;
  const showSearchContextApplied = hasSearchContext && usedSearchContext;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        ref={modalRef}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative w-full max-h-[90vh] flex flex-col overflow-hidden",
          "rounded-2xl border shadow-2xl"
        )}
        style={{
          background:
            "linear-gradient(to bottom right, color-mix(in srgb, var(--color-surface) 96%, transparent), color-mix(in srgb, var(--color-background-alt) 96%, transparent))",
          borderColor: "var(--color-border)",
          maxWidth: phase === "result" ? "32rem" : "36rem",
        }}
      >
          {/* Header — matches CollectionModal/ConfirmDialog style */}
          <header
            className="flex items-center gap-3 p-5 border-b shrink-0"
            style={{
              borderColor: "var(--color-border-subtle)",
              background:
                "linear-gradient(to right, color-mix(in srgb, var(--color-primary) 10%, transparent), transparent)",
            }}
          >
            <div
              className="p-2.5 rounded-xl shrink-0"
              style={{
                background:
                  "linear-gradient(to bottom right, color-mix(in srgb, var(--color-primary) 22%, transparent), color-mix(in srgb, var(--color-secondary) 22%, transparent))",
              }}
            >
              <Dices size={20} style={{ color: "var(--color-primary)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                className="text-xl font-bold bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, var(--color-primary), var(--color-secondary))",
                }}
              >
                {phase === "result" ? "Your Random Pick" : "Random Pick"}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {phase === "result"
                  ? "Fate has spoken. Re-roll or commit."
                  : phase === "shuffling"
                    ? "Shuffling the deck…"
                    : "Set your filters and let fate decide"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl transition-colors text-gray-400 hover:text-white hover:bg-white/10"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </header>

          {/* Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={phase}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
            {phase === "configure" && (
              <div className="p-5 space-y-5">
                {/* Search context shortcut */}
                {showSearchContextLink && (
                  <button
                    type="button"
                    onClick={handleApplySearchContext}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border transition-all text-left"
                    style={{
                      borderColor: "var(--color-border)",
                      background:
                        "linear-gradient(to right, color-mix(in srgb, var(--color-primary) 6%, transparent), color-mix(in srgb, var(--color-secondary) 6%, transparent))",
                    }}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Link2 size={14} style={{ color: "var(--color-primary)" }} />
                      <span className="text-xs text-gray-300 truncate">
                        Use current search
                        {contextLabel(initialSearchContext!) && (
                          <span className="text-gray-500">
                            {" "}
                            — {contextLabel(initialSearchContext!)}
                          </span>
                        )}
                      </span>
                    </span>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider shrink-0"
                      style={{ color: "var(--color-primary)" }}
                    >
                      Apply
                    </span>
                  </button>
                )}

                {/* Applied search context — the query/people filters have no
                    chip sections below, so this chip is their only visible trace */}
                {showSearchContextApplied && (
                  <div
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border"
                    style={{
                      borderColor: "var(--color-border)",
                      background:
                        "linear-gradient(to right, color-mix(in srgb, var(--color-primary) 6%, transparent), color-mix(in srgb, var(--color-secondary) 6%, transparent))",
                    }}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Link2 size={14} style={{ color: "var(--color-primary)" }} />
                      <span className="text-xs text-gray-300 truncate">
                        Using current search
                        {contextLabel(initialSearchContext!) && (
                          <span className="text-gray-500">
                            {" "}
                            — {contextLabel(initialSearchContext!)}
                          </span>
                        )}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={handleClearSearchContext}
                      className="p-1 rounded-lg transition-colors text-gray-400 hover:text-white hover:bg-white/10 shrink-0"
                      aria-label="Remove search context"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {/* Type + Rating row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FilterField label="Type">
                    {filterOptions ? (
                      <ChipPicker
                        options={filterOptions.entryTypes}
                        selected={filters.entryTypes}
                        onChange={(v) => updateFilter("entryTypes", v)}
                        emptyHint="No types available"
                      />
                    ) : (
                      <div className="h-8 bg-white/5 rounded-xl animate-pulse w-48" />
                    )}
                  </FilterField>

                  <FilterField label="Rating">
                    <div className="space-y-2.5">
                      <PillToggle
                        ariaLabel="Rating operator"
                        value={filters.ratingOperator}
                        onChange={(v) =>
                          updateFilter("ratingOperator", v as RandomPickFilters["ratingOperator"])
                        }
                        options={[
                          { value: "any", label: "Any" },
                          { value: "eq", label: "Exact" },
                          { value: "gte", label: "≥" },
                          { value: "lte", label: "≤" },
                        ]}
                      />
                      {filters.ratingOperator !== "any" && (
                        <div className="grid grid-cols-5 gap-1.5">
                          {RATING_VALUES.map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => updateFilter("ratingValue", v)}
                              aria-pressed={filters.ratingValue === v}
                              className={cn(
                                "h-8 rounded-lg text-xs font-bold transition-all border",
                                filters.ratingValue === v
                                  ? "bg-white/15 border-white/25 text-white shadow-sm"
                                  : "bg-white/5 border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/8"
                              )}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </FilterField>
                </div>

                {/* Year + Status row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FilterField label="Year Completed">
                    <div className="space-y-2.5">
                      <PillToggle
                        ariaLabel="Year mode"
                        value={filters.yearMode}
                        onChange={(v) =>
                          updateFilter("yearMode", v as RandomPickFilters["yearMode"])
                        }
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
                          onChange={(v) => updateFilter("yearExact", v ? parseInt(v) : null)}
                          options={yearOptions}
                          placeholder="Select year"
                        />
                      )}
                      {filters.yearMode === "range" && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <CustomSelect
                            ariaLabel="From year"
                            value={filters.yearFrom != null ? String(filters.yearFrom) : ""}
                            onChange={(v) => updateFilter("yearFrom", v ? parseInt(v) : null)}
                            options={[...yearOptions].reverse()}
                            placeholder="From"
                          />
                          <span className="text-gray-500 text-xs">to</span>
                          <CustomSelect
                            ariaLabel="To year"
                            value={filters.yearTo != null ? String(filters.yearTo) : ""}
                            onChange={(v) => updateFilter("yearTo", v ? parseInt(v) : null)}
                            options={yearOptions}
                            placeholder="To"
                          />
                        </div>
                      )}
                    </div>
                  </FilterField>

                  <div className="space-y-4">
                    <FilterField label="Local Copy">
                      <PillToggle
                        ariaLabel="Local copy"
                        value={filters.localCopy}
                        onChange={(v) =>
                          updateFilter("localCopy", v as RandomPickFilters["localCopy"])
                        }
                        options={[
                          { value: "any", label: "Any" },
                          { value: "yes", label: "Yes" },
                          { value: "no", label: "No" },
                        ]}
                      />
                    </FilterField>
                    <FilterField label="Rewatch">
                      <PillToggle
                        ariaLabel="Rewatch status"
                        value={filters.rewatchStatus}
                        onChange={(v) =>
                          updateFilter("rewatchStatus", v as RandomPickFilters["rewatchStatus"])
                        }
                        options={[
                          { value: "any", label: "Any" },
                          { value: "never", label: "Never" },
                          { value: "has", label: "Has" },
                        ]}
                      />
                    </FilterField>
                  </div>
                </div>

                {/* Collapsible multi-select sections */}
                {filterOptions && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      <FilterIcon size={12} />
                      Refine
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <CollapsibleChipSection
                        label="Genre"
                        options={filterOptions.genres}
                        selected={filters.genres}
                        onChange={(v) => updateFilter("genres", v)}
                      />
                      <CollapsibleChipSection
                        label="Platform"
                        options={filterOptions.platforms}
                        selected={filters.platforms}
                        onChange={(v) => updateFilter("platforms", v)}
                      />
                      <CollapsibleChipSection
                        label="Franchise"
                        options={filterOptions.franchises}
                        selected={filters.franchises}
                        onChange={(v) => updateFilter("franchises", v)}
                      />
                      <CollapsibleChipSection
                        label="Series"
                        options={filterOptions.series}
                        selected={filters.series}
                        onChange={(v) => updateFilter("series", v)}
                      />
                    </div>
                  </div>
                )}

                {/* Empty state for no matches */}
                {noMatches && (
                  <div className="flex items-start gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
                    <Sparkles size={14} className="text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-xs text-gray-300">
                      <p className="font-semibold text-amber-300 mb-0.5">
                        No entries match these filters
                      </p>
                      <p className="text-gray-400">
                        Try broadening your criteria or reset to defaults.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {phase === "shuffling" && pickedEntry && (
              <div className="p-8 flex flex-col items-center justify-center min-h-[280px]">
                <motion.div
                  className="relative w-24 h-24 rounded-full flex items-center justify-center mb-6"
                  style={{
                    background:
                      "linear-gradient(to bottom right, color-mix(in srgb, var(--color-primary) 25%, transparent), color-mix(in srgb, var(--color-secondary) 25%, transparent))",
                  }}
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                >
                  <Dices size={36} style={{ color: "var(--color-primary)" }} />
                </motion.div>
                <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold mb-2">
                  Picking…
                </p>
                <p className="text-xl font-bold text-white truncate max-w-full px-4">
                  {shuffleText || pickedEntry.name}
                </p>
              </div>
            )}

            {phase === "result" && pickedEntry && (
              <div className="p-6 flex flex-col items-center gap-5">
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 280, damping: 24 }}
                  className="w-full max-w-[18rem]"
                >
                  <MediaCard entry={pickedEntry} awards={pickedAwards} />
                </motion.div>
                <p className="text-xs text-gray-500 text-center max-w-sm">
                  Click the card menu to view full details, edit, or duplicate.
                </p>
              </div>
            )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <footer
            className="p-5 border-t shrink-0"
            style={{ borderColor: "var(--color-border-subtle)" }}
          >
            {phase === "configure" && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {matchCount !== null ? (
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                      style={{
                        backgroundColor: noMatches
                          ? "rgba(245, 158, 11, 0.12)"
                          : "color-mix(in srgb, var(--color-primary) 18%, transparent)",
                        color: noMatches ? "#FBBF24" : "var(--color-primary)",
                      }}
                      aria-live="polite"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          backgroundColor: noMatches ? "#FBBF24" : "var(--color-primary)",
                        }}
                      />
                      {noMatches
                        ? "No matches"
                        : `${matchCount} ${matchCount === 1 ? "match" : "matches"}`}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/5 text-gray-500 animate-pulse">
                      Counting…
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {hasActiveFilters && (
                    <button
                      onClick={() => {
                        setFilters({ ...DEFAULT_FILTERS });
                        setUsedSearchContext(false);
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                    >
                      <RotateCcw size={12} />
                      Reset
                    </button>
                  )}
                  <button
                    onClick={handlePick}
                    disabled={!canPick}
                    className={cn(
                      "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all",
                      !canPick
                        ? "bg-white/5 text-gray-500 cursor-not-allowed"
                        : "hover:scale-[1.02] active:scale-[0.98]"
                    )}
                    style={
                      canPick
                        ? {
                            background:
                              "linear-gradient(to right, var(--color-primary), var(--color-secondary))",
                            boxShadow:
                              "0 10px 20px -6px color-mix(in srgb, var(--color-primary) 45%, transparent)",
                          }
                        : undefined
                    }
                  >
                    <Shuffle size={14} className={isPickLoading ? "animate-spin" : ""} />
                    {isPickLoading ? "Picking…" : "Pick Random"}
                  </button>
                </div>
              </div>
            )}

            {(phase === "shuffling" || phase === "result") && (
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => {
                    setPhase("configure");
                    setPickedEntry(null);
                    setPickedAwards([]);
                    setShuffleText("");
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                >
                  <RotateCcw size={12} />
                  Back to Filters
                </button>
                <button
                  onClick={handleReroll}
                  disabled={isPickLoading || phase === "shuffling"}
                  className={cn(
                    "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all",
                    isPickLoading || phase === "shuffling"
                      ? "bg-white/5 text-gray-500 cursor-not-allowed"
                      : "hover:scale-[1.02] active:scale-[0.98]"
                  )}
                  style={
                    !(isPickLoading || phase === "shuffling")
                      ? {
                          background:
                            "linear-gradient(to right, var(--color-primary), var(--color-secondary))",
                          boxShadow:
                            "0 10px 20px -6px color-mix(in srgb, var(--color-primary) 45%, transparent)",
                        }
                      : undefined
                  }
                >
                  <Shuffle
                    size={14}
                    className={isPickLoading || phase === "shuffling" ? "animate-spin" : ""}
                  />
                  {phase === "shuffling" ? "Re-rolling…" : "Re-roll"}
                </button>
              </div>
            )}
          </footer>
        </motion.div>
    </div>,
    document.body
  );
}
