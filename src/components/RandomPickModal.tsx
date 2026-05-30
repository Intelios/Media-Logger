import { useState, useEffect, useRef, useCallback } from "react";
import { X, Dices, RotateCcw, ArrowLeft, Shuffle, ChevronDown, Check } from "lucide-react";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";
import { dbService, type MediaEntry, type RandomPickFilters, type RandomPickFilterOptions } from "../lib/db";
import { DEFAULT_COVER_IMAGE, getImageUrl, releaseImageUrl } from "../lib/utils";
import { cn } from "../lib/utils_ui";

interface RandomPickModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_FILTERS: RandomPickFilters = {
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
  franchises: [],
  series: [],
};

const RATING_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const getTypeBadgeColor = (type: string | null) => {
  const t = (type || "").toLowerCase();
  if (t.includes("album")) return "bg-emerald-600";
  if (t.includes("game")) return "bg-purple-600";
  if (t.includes("anime")) return "bg-pink-500";
  if (t.includes("k-drama")) return "bg-teal-600";
  if (t.includes("movie")) return "bg-blue-600";
  if (t.includes("show")) return "bg-cyan-600";
  if (t.includes("book")) return "bg-amber-600";
  if (t.includes("jav") || t.includes("hentai")) return "bg-rose-600";
  if (t.includes("visual novel")) return "bg-indigo-600";
  return "bg-gray-600";
};

const getRatingColor = (score: number | null) => {
  if (!score && score !== 0) return "bg-gray-700/80 text-gray-300";
  if (score >= 9) return "bg-emerald-500 text-white";
  if (score >= 7) return "bg-blue-500 text-white";
  if (score >= 5) return "bg-yellow-500 text-white";
  return "bg-red-500 text-white";
};

// Custom pill toggle for 2-4 options
function PillToggle({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex gap-1 bg-white/5 rounded-xl p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
            value === opt.value
              ? "bg-white/15 text-white shadow-sm"
              : "text-gray-400 hover:text-gray-200"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Custom single-select dropdown (replaces native <select>)
function CustomSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
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
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-all min-w-[120px]",
          value
            ? "bg-white/10 border-white/20 text-white"
            : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
        )}
      >
        <span className="flex-1 text-left">{selected?.label || placeholder}</span>
        <ChevronDown size={14} className={cn("transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div className="absolute left-0 mt-2 w-full bg-[#1a1a1a] border border-white/10 rounded-xl shadow-xl z-[60] overflow-hidden backdrop-blur-3xl p-1">
          <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-0.5">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
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

// Custom multi-select chip picker (replaces MultiSelectFilter for inline use)
function ChipPicker({ options, selected, onChange }: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
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

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</label>
      {children}
    </div>
  );
}

export function RandomPickModal({ isOpen, onClose }: RandomPickModalProps) {
  const [filters, setFilters] = useState<RandomPickFilters>({ ...DEFAULT_FILTERS });
  const [filterOptions, setFilterOptions] = useState<RandomPickFilterOptions | null>(null);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [pickedEntry, setPickedEntry] = useState<MediaEntry | null>(null);
  const [pickedImageUrl, setPickedImageUrl] = useState<string>(DEFAULT_COVER_IMAGE);
  const [phase, setPhase] = useState<"configure" | "result">("configure");
  const [isPickLoading, setIsPickLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const countTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickedImagePathRef = useRef<string | null>(null);
  const imageRequestRef = useRef(0);
  const isOpenRef = useRef(isOpen);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  const releasePickedImage = useCallback(() => {
    releaseImageUrl(pickedImagePathRef.current);
    pickedImagePathRef.current = null;
  }, []);

  const setPickedImage = useCallback(async (imagePath: string | null) => {
    const requestId = ++imageRequestRef.current;
    const url = await getImageUrl(imagePath);
    if (requestId !== imageRequestRef.current || !isOpenRef.current) {
      releaseImageUrl(imagePath);
      return;
    }

    releasePickedImage();
    pickedImagePathRef.current = imagePath;
    setPickedImageUrl(url);
  }, [releasePickedImage]);

  useEffect(() => () => {
    isOpenRef.current = false;
    imageRequestRef.current += 1;
    releasePickedImage();
  }, [releasePickedImage]);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (isOpen) {
      releasePickedImage();
      setFilters({ ...DEFAULT_FILTERS });
      setPhase("configure");
      setPickedEntry(null);
      setPickedImageUrl(DEFAULT_COVER_IMAGE);
      dbService.getRandomPickFilterOptions().then(setFilterOptions).catch(console.error);
    } else {
      imageRequestRef.current += 1;
      releasePickedImage();
    }
  }, [isOpen, releasePickedImage]);

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

  const updateFilter = <K extends keyof RandomPickFilters>(key: K, value: RandomPickFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handlePick = async () => {
    setIsPickLoading(true);
    try {
      const entry = await dbService.getRandomEntry(filters);
      if (entry) {
        setPickedEntry(entry);
        await setPickedImage(entry.image_url);
        setPhase("result");
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
      const entry = await dbService.getRandomEntry(filters);
      if (entry) {
        setPickedEntry(entry);
        await setPickedImage(entry.image_url);
      }
    } catch (err) {
      console.error("Re-roll failed:", err);
    } finally {
      setIsPickLoading(false);
    }
  };

  if (!isOpen) return null;

  const hasActiveFilters = filters.entryTypes.length > 0 ||
    filters.ratingOperator !== "any" ||
    filters.yearMode !== "any" ||
    filters.localCopy !== "any" ||
    filters.rewatchStatus !== "any" ||
    filters.genres.length > 0 ||
    filters.platforms.length > 0 ||
    filters.franchises.length > 0 ||
    filters.series.length > 0;

  const yearOptions = (filterOptions?.years ?? []).map((y) => ({ value: String(y), label: String(y) }));

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200" onClick={onClose} />
      <div
        ref={modalRef}
        className="fixed inset-4 md:inset-8 lg:inset-12 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-3xl z-50 flex flex-col overflow-hidden animate-in zoom-in-95 fade-in duration-200"
      >
        {/* Header */}
        <header className="flex items-center justify-between p-6 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Dices size={24} style={{ color: 'var(--color-primary)' }} />
              Random Pick
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              {phase === "configure" ? "Set your filters and let fate decide" : "Your random selection"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {phase === "configure" ? (
            <div className="space-y-6 max-w-3xl">

              {/* Entry Type */}
              <FilterSection label="Type">
                {filterOptions ? (
                  <ChipPicker
                    options={filterOptions.entryTypes}
                    selected={filters.entryTypes}
                    onChange={(v) => updateFilter("entryTypes", v)}
                  />
                ) : (
                  <div className="h-8 bg-white/5 rounded-xl animate-pulse w-64" />
                )}
              </FilterSection>

              {/* Rating */}
              <FilterSection label="Rating">
                <div className="space-y-3">
                  <PillToggle
                    value={filters.ratingOperator}
                    onChange={(v) => updateFilter("ratingOperator", v as RandomPickFilters["ratingOperator"])}
                    options={[
                      { value: "any", label: "Any" },
                      { value: "eq", label: "Exactly" },
                      { value: "gte", label: "At Least" },
                      { value: "lte", label: "At Most" },
                    ]}
                  />
                  {filters.ratingOperator !== "any" && (
                    <div className="flex gap-1.5">
                      {RATING_VALUES.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => updateFilter("ratingValue", v)}
                          className={cn(
                            "w-9 h-9 rounded-lg text-sm font-bold transition-all border",
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
              </FilterSection>

              {/* Year */}
              <FilterSection label="Year Completed">
                <div className="space-y-3">
                  <PillToggle
                    value={filters.yearMode}
                    onChange={(v) => updateFilter("yearMode", v as RandomPickFilters["yearMode"])}
                    options={[
                      { value: "any", label: "Any" },
                      { value: "exact", label: "Exact Year" },
                      { value: "range", label: "Range" },
                    ]}
                  />
                  {filters.yearMode === "exact" && (
                    <CustomSelect
                      value={filters.yearExact != null ? String(filters.yearExact) : ""}
                      onChange={(v) => updateFilter("yearExact", v ? parseInt(v) : null)}
                      options={yearOptions}
                      placeholder="Select year"
                    />
                  )}
                  {filters.yearMode === "range" && (
                    <div className="flex items-center gap-3">
                      <CustomSelect
                        value={filters.yearFrom != null ? String(filters.yearFrom) : ""}
                        onChange={(v) => updateFilter("yearFrom", v ? parseInt(v) : null)}
                        options={[...yearOptions].reverse()}
                        placeholder="From"
                      />
                      <span className="text-gray-500 text-sm">to</span>
                      <CustomSelect
                        value={filters.yearTo != null ? String(filters.yearTo) : ""}
                        onChange={(v) => updateFilter("yearTo", v ? parseInt(v) : null)}
                        options={yearOptions}
                        placeholder="To"
                      />
                    </div>
                  )}
                </div>
              </FilterSection>

              {/* Local Copy & Rewatch side by side */}
              <div className="grid grid-cols-2 gap-6">
                <FilterSection label="Local Copy">
                  <PillToggle
                    value={filters.localCopy}
                    onChange={(v) => updateFilter("localCopy", v as RandomPickFilters["localCopy"])}
                    options={[
                      { value: "any", label: "Any" },
                      { value: "yes", label: "Yes" },
                      { value: "no", label: "No" },
                    ]}
                  />
                </FilterSection>
                <FilterSection label="Rewatch">
                  <PillToggle
                    value={filters.rewatchStatus}
                    onChange={(v) => updateFilter("rewatchStatus", v as RandomPickFilters["rewatchStatus"])}
                    options={[
                      { value: "any", label: "Any" },
                      { value: "never", label: "Never" },
                      { value: "has", label: "Rewatched" },
                    ]}
                  />
                </FilterSection>
              </div>

              {/* Genre */}
              {filterOptions && filterOptions.genres.length > 0 && (
                <FilterSection label="Genre">
                  <ChipPicker
                    options={filterOptions.genres}
                    selected={filters.genres}
                    onChange={(v) => updateFilter("genres", v)}
                  />
                </FilterSection>
              )}

              {/* Platform */}
              {filterOptions && filterOptions.platforms.length > 0 && (
                <FilterSection label="Platform">
                  <ChipPicker
                    options={filterOptions.platforms}
                    selected={filters.platforms}
                    onChange={(v) => updateFilter("platforms", v)}
                  />
                </FilterSection>
              )}

              {/* Franchise */}
              {filterOptions && filterOptions.franchises.length > 0 && (
                <FilterSection label="Franchise">
                  <ChipPicker
                    options={filterOptions.franchises}
                    selected={filters.franchises}
                    onChange={(v) => updateFilter("franchises", v)}
                  />
                </FilterSection>
              )}

              {/* Series */}
              {filterOptions && filterOptions.series.length > 0 && (
                <FilterSection label="Series">
                  <ChipPicker
                    options={filterOptions.series}
                    selected={filters.series}
                    onChange={(v) => updateFilter("series", v)}
                  />
                </FilterSection>
              )}
            </div>
          ) : pickedEntry ? (
            /* Result Phase */
            <div className="flex flex-col items-center gap-6 py-4">
              <div className="relative w-full max-w-xs">
                <div className="aspect-[2/3] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                  <img
                    src={pickedImageUrl}
                    alt={pickedEntry.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_COVER_IMAGE; }}
                  />
                </div>
                {pickedEntry.entry_type && (
                  <div className={cn("absolute top-3 left-3 px-2.5 py-1 rounded-lg text-xs font-bold text-white shadow-lg", getTypeBadgeColor(pickedEntry.entry_type))}>
                    {pickedEntry.entry_type}
                  </div>
                )}
                {pickedEntry.review_score != null && (
                  <div className={cn("absolute top-3 right-3 px-2.5 py-1 rounded-lg text-xs font-bold shadow-lg", getRatingColor(pickedEntry.review_score))}>
                    {pickedEntry.review_score}/10
                  </div>
                )}
              </div>

              <div className="text-center space-y-3">
                <h2 className="text-2xl font-bold text-white">{pickedEntry.name}</h2>
                <div className="flex items-center justify-center gap-3 text-sm text-gray-400 flex-wrap">
                  {pickedEntry.year_completed && <span>{pickedEntry.year_completed}</span>}
                  {pickedEntry.genre && (
                    <span className="max-w-sm truncate">{pickedEntry.genre}</span>
                  )}
                </div>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {pickedEntry.is_rewatch === 1 && (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-gray-300">Rewatch</span>
                  )}
                  {pickedEntry.own_local_copy === 1 && (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-gray-300">Local Copy</span>
                  )}
                  {pickedEntry.platform && (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-gray-300">{pickedEntry.platform}</span>
                  )}
                  {pickedEntry.franchise && (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-gray-300">{pickedEntry.franchise}</span>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 shrink-0">
          {phase === "configure" ? (
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-400">
                {matchCount !== null ? (
                  <span>
                    <span className="font-bold text-white">{matchCount}</span>{" "}
                    {matchCount === 1 ? "entry matches" : "entries match"}
                  </span>
                ) : (
                  <span className="animate-pulse">Counting...</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {hasActiveFilters && (
                  <button
                    onClick={() => setFilters({ ...DEFAULT_FILTERS })}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                  >
                    <RotateCcw size={14} />
                    Reset
                  </button>
                )}
                <button
                  onClick={handlePick}
                  disabled={matchCount === 0 || matchCount === null || isPickLoading}
                  className={cn(
                    "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all",
                    matchCount === 0 || matchCount === null
                      ? "bg-gray-700 opacity-50 cursor-not-allowed"
                      : "hover:shadow-lg hover:shadow-primary/25 hover:scale-[1.02] active:scale-[0.98]"
                  )}
                  style={matchCount && matchCount > 0 ? { background: `linear-gradient(to right, var(--color-primary), var(--color-secondary))` } : undefined}
                >
                  <Shuffle size={16} />
                  {isPickLoading ? "Picking..." : "Pick Random"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <button
                onClick={() => setPhase("configure")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all"
              >
                <ArrowLeft size={16} />
                Back to Filters
              </button>
              <button
                onClick={handleReroll}
                disabled={isPickLoading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white hover:shadow-lg hover:shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] transition-all"
                style={{ background: `linear-gradient(to right, var(--color-primary), var(--color-secondary))` }}
              >
                <RotateCcw size={16} className={isPickLoading ? "animate-spin" : ""} />
                {isPickLoading ? "Re-rolling..." : "Re-roll"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
