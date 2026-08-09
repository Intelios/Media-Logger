import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search as SearchIcon, X, Filter, ChevronDown, ChevronUp, RotateCcw, Dices } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { dbService, type EntryCardSummary, type MediaEntry, type SearchFilterOptions } from "../lib/db";
import { awardsLogic } from "../lib/awards-logic";
import { MediaCard, type MediaAward } from "../components/MediaCard";
import { EntryForm } from "../components/EntryForm";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { RandomPickModal } from "../components/RandomPickModal";
import { cn } from "../lib/utils_ui";
import { getVisibleEntryTypes, useAdultMediaEnabled } from "../lib/media-config";
import { VirtualizedCardGrid } from "../components/VirtualizedCardGrid";
import { beginPerformanceSpan } from "../lib/performance-diagnostics";
import { mediaQueryKeys, queryClient } from "../lib/query-client";

const SEARCH_FILTERS_KEY = "search-filters";
const RECENT_SEARCHES_KEY = "media-logger-recent-searches";
const MAX_RECENT_SEARCHES = 8;

interface SearchFilters {
  entryTypes: string[];
  platforms: string[];
  actresses: string[];
  directors: string[];
  authors: string[];
  franchises: string[];
  series: string[];
}

const defaultFilters: SearchFilters = {
  entryTypes: [],
  platforms: [],
  actresses: [],
  directors: [],
  authors: [],
  franchises: [],
  series: [],
};

const emptyFilterOptions: SearchFilterOptions = {
  platforms: [],
  actresses: [],
  directors: [],
  authors: [],
  franchises: [],
  series: [],
};

const FILTER_LABELS: Record<keyof SearchFilters, string> = {
  entryTypes: "Type",
  platforms: "Platform",
  actresses: "Actress",
  directors: "Director",
  authors: "Author",
  franchises: "Franchise",
  series: "Series",
};

const shellTransition = { type: "spring", stiffness: 280, damping: 30 } as const;

const loadPersistedFilters = (): SearchFilters => {
  try {
    const stored = localStorage.getItem(SEARCH_FILTERS_KEY);
    if (stored) {
      return { ...defaultFilters, ...JSON.parse(stored) };
    }
  } catch {
    // Fall back to defaults if local storage is unavailable or malformed.
  }

  return defaultFilters;
};

const loadRecentSearches = (): string[] => {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .slice(0, MAX_RECENT_SEARCHES);
      }
    }
  } catch {
    // Fall back to an empty list if local storage is unavailable or malformed.
  }

  return [];
};

export default function SearchPage() {
  const adultEnabled = useAdultMediaEnabled();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 220);
  const [results, setResults] = useState<EntryCardSummary[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [nextPage, setNextPage] = useState(1);
  const [filters, setFilters] = useState<SearchFilters>(loadPersistedFilters);
  const [filterOptions, setFilterOptions] = useState<SearchFilterOptions>(emptyFilterOptions);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isLoadingResults, setIsLoadingResults] = useState(() => hasActiveFilters(loadPersistedFilters()));
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingFilters, setIsLoadingFilters] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecentSearches);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showRandomPick, setShowRandomPick] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MediaEntry | null>(null);
  const [awardsMap, setAwardsMap] = useState<Map<number, MediaAward[]>>(new Map());
  const searchGenerationRef = useRef(0);

  useEffect(() => {
    let isActive = true;
    setIsLoadingFilters(true);

    dbService.getSearchFilterOptions()
      .then((options) => {
        if (!isActive) return;
        setFilterOptions(options);
        // Prune any persisted filter selections that no longer match an
        // offered option or are now hidden by the adult-visibility toggle,
        // so chips always have a matching option to uncheck.
        const visibleEntryTypes = getVisibleEntryTypes();
        const prune = (selected: string[], available: string[]) => {
          const allowed = new Set(available);
          return selected.filter((value) => allowed.has(value));
        };
        setFilters((current) => ({
          entryTypes: prune(current.entryTypes, visibleEntryTypes),
          platforms: prune(current.platforms, options.platforms),
          actresses: prune(current.actresses, options.actresses),
          directors: prune(current.directors, options.directors),
          authors: prune(current.authors, options.authors),
          franchises: prune(current.franchises, options.franchises),
          series: prune(current.series, options.series),
        }));
      })
      .catch((error) => {
        console.error("Failed to load search filter options:", error);
        if (isActive) {
          setFilterOptions(emptyFilterOptions);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingFilters(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [refreshToken, adultEnabled]);

  useEffect(() => {
    localStorage.setItem(SEARCH_FILTERS_KEY, JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recentSearches));
    } catch {
      // Ignore storage failures.
    }
  }, [recentSearches]);

  useEffect(() => {
    const generation = ++searchGenerationRef.current;
    const hasCriteria = debouncedQuery.trim().length > 0 || hasActiveFilters(filters);

    if (!hasCriteria) {
      setResults([]);
      setTotalResults(0);
      setHasMoreResults(false);
      setNextPage(1);
      setAwardsMap(new Map());
      setIsLoadingResults(false);
      setIsLoadingMore(false);
      return;
    }

    setIsLoadingResults(true);
    setIsLoadingMore(false);
    const finishTiming = beginPerformanceSpan('search', debouncedQuery.trim().length >= 3 ? 'fts-page' : 'short-page', {
      page: 0,
      queryLength: debouncedQuery.trim().length,
    });

    const searchFilters = {
      query: debouncedQuery,
      ...filters,
    };
    queryClient.fetchQuery({
      queryKey: mediaQueryKeys.search(searchFilters, 0),
      queryFn: () => dbService.searchEntriesPaged(searchFilters, 0),
    })
      .then((page) => {
        if (searchGenerationRef.current === generation) {
          setResults(page.items);
          setTotalResults(page.total);
          setHasMoreResults(page.hasMore);
          setNextPage(1);
        }
      })
      .catch((error) => {
        console.error("Failed to search entries:", error);
        if (searchGenerationRef.current === generation) {
          setResults([]);
          setTotalResults(0);
          setHasMoreResults(false);
          setAwardsMap(new Map());
        }
      })
      .finally(() => {
        finishTiming();
        if (searchGenerationRef.current === generation) {
          setIsLoadingResults(false);
        }
      });
  }, [debouncedQuery, filters, refreshToken, adultEnabled]);

  const loadMoreResults = useCallback(() => {
    if (!hasMoreResults || isLoadingResults || isLoadingMore) return;
    const generation = searchGenerationRef.current;
    const pageNumber = nextPage;
    setIsLoadingMore(true);
    const finishTiming = beginPerformanceSpan('search', debouncedQuery.trim().length >= 3 ? 'fts-next-page' : 'short-next-page', {
      page: pageNumber,
      queryLength: debouncedQuery.trim().length,
    });

    const searchFilters = { query: debouncedQuery, ...filters };
    void queryClient.fetchQuery({
      queryKey: mediaQueryKeys.search(searchFilters, pageNumber),
      queryFn: () => dbService.searchEntriesPaged(searchFilters, pageNumber),
    })
      .then((page) => {
        if (searchGenerationRef.current !== generation) return;
        setResults((current) => {
          const known = new Set(current.map((entry) => entry.id));
          return [...current, ...page.items.filter((entry) => !known.has(entry.id))];
        });
        setTotalResults(page.total);
        setHasMoreResults(page.hasMore);
        setNextPage(pageNumber + 1);
      })
      .catch((error) => {
        console.error('Failed to load the next search page:', error);
      })
      .finally(() => {
        finishTiming();
        if (searchGenerationRef.current === generation) setIsLoadingMore(false);
      });
  }, [debouncedQuery, filters, hasMoreResults, isLoadingMore, isLoadingResults, nextPage]);

  useEffect(() => {
    let isActive = true;
    const mediaIds = results
      .map((entry) => entry.id)
      .filter((id): id is number => typeof id === "number");

    if (mediaIds.length === 0) {
      setAwardsMap(new Map());
      return () => {
        isActive = false;
      };
    }

    awardsLogic.getAwardsForMediaBatch(mediaIds)
      .then((awards) => {
        if (isActive) {
          setAwardsMap(awards);
        }
      })
      .catch((error) => {
        console.error("Failed to load search awards:", error);
        if (isActive) {
          setAwardsMap(new Map());
        }
      });

    return () => {
      isActive = false;
    };
  }, [results]);

  const activeFilterCount = getActiveFilterCount(filters);

  const hasActiveSearch = query.trim().length > 0 || activeFilterCount > 0;

  // Drive the layout switch off the *debounced* query, not the raw one, so
  // the hero input stays mounted (and focused) while the user is mid-keystroke.
  // Switching on the raw query would unmount the input on the first character
  // with mode="wait", swallowing that keystroke. Once the debounce fires and a
  // search is in flight, the layout slides up to the results header.
  const hasActiveSearchDebounced = debouncedQuery.trim().length > 0 || activeFilterCount > 0;
  const showResultsLayout = hasActiveSearchDebounced || results.length > 0 || isLoadingResults;

  const activeFilterChips = useMemo(() => {
    const chips: { key: keyof SearchFilters; label: string; value: string }[] = [];
    (Object.keys(filters) as (keyof SearchFilters)[]).forEach((key) => {
      for (const value of filters[key]) {
        chips.push({ key, label: FILTER_LABELS[key], value });
      }
    });
    return chips;
  }, [filters]);

  const pushRecentSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches((current) =>
      [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, MAX_RECENT_SEARCHES),
    );
  }, []);

  const removeRecentSearch = useCallback((term: string) => {
    setRecentSearches((current) => current.filter((item) => item !== term));
  }, []);

  const commitSearch = useCallback((termOverride?: string) => {
    const trimmed = (termOverride ?? query).trim();
    if (trimmed) pushRecentSearch(trimmed);
  }, [query, pushRecentSearch]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && query.trim()) {
      event.preventDefault();
      commitSearch();
    } else if (event.key === "Escape") {
      setQuery("");
    }
  };

  const handleEdit = (entry: MediaEntry) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const handleSave = async (data: Partial<MediaEntry>) => {
    if (!editingEntry) return;

    const updatedEntry = { ...editingEntry, ...data } as MediaEntry;
    await dbService.updateEntry(updatedEntry);
    setEditingEntry(updatedEntry);
    setRefreshToken((current) => current + 1);
  };

  const handleDelete = async (id: number) => {
    await dbService.deleteEntry(id);
    setRefreshToken((current) => current + 1);
  };

  const updateFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const removeFilterValue = (key: keyof SearchFilters, value: string) => {
    updateFilter(key, filters[key].filter((item) => item !== value));
  };

  const clearAllFilters = () => {
    setFilters({ ...defaultFilters });
    setQuery("");
  };

  const renderAdvancedFiltersPanel = () => (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="relative z-30 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Filter Options</h3>
        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <RotateCcw size={12} />
            Clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MultiSelectFilter
          options={getVisibleEntryTypes()}
          selected={filters.entryTypes}
          onChange={(value) => updateFilter("entryTypes", value)}
          label="Type"
        />
        {filterOptions.platforms.length > 0 && (
          <MultiSelectFilter
            options={filterOptions.platforms}
            selected={filters.platforms}
            onChange={(value) => updateFilter("platforms", value)}
            label="Platform"
          />
        )}
        {filterOptions.actresses.length > 0 && (
          <MultiSelectFilter
            options={filterOptions.actresses}
            selected={filters.actresses}
            onChange={(value) => updateFilter("actresses", value)}
            label="Actress"
          />
        )}
        {filterOptions.directors.length > 0 && (
          <MultiSelectFilter
            options={filterOptions.directors}
            selected={filters.directors}
            onChange={(value) => updateFilter("directors", value)}
            label="Director"
          />
        )}
        {filterOptions.authors.length > 0 && (
          <MultiSelectFilter
            options={filterOptions.authors}
            selected={filters.authors}
            onChange={(value) => updateFilter("authors", value)}
            label="Author"
          />
        )}
        {filterOptions.franchises.length > 0 && (
          <MultiSelectFilter
            options={filterOptions.franchises}
            selected={filters.franchises}
            onChange={(value) => updateFilter("franchises", value)}
            label="Franchise"
          />
        )}
        {filterOptions.series.length > 0 && (
          <MultiSelectFilter
            options={filterOptions.series}
            selected={filters.series}
            onChange={(value) => updateFilter("series", value)}
            label="Series"
          />
        )}
      </div>

      {isLoadingFilters && (
        <p className="text-xs text-gray-500">Refreshing filter options...</p>
      )}
    </motion.div>
  );

  const renderSearchShell = (variant: "hero" | "header") => (
    <motion.div
      layoutId="search-shell"
      transition={shellTransition}
      className={variant === "hero" ? "w-full" : "min-w-0 flex-1 max-w-3xl"}
    >
      <div className="relative">
        {variant === "hero" && (
          <div
            className="absolute inset-0 rounded-2xl blur-xl opacity-50"
            style={{ background: `linear-gradient(to right, color-mix(in srgb, var(--color-primary) 20%, transparent), color-mix(in srgb, var(--color-secondary) 20%, transparent))` }}
          />
        )}
        <div className="relative bg-white/5 border border-white/10 rounded-2xl p-1 backdrop-blur-sm">
          <div className="relative flex items-center">
            <SearchIcon className="absolute left-4 text-gray-400" size={20} />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by title, author, artist, genre, director, actress, platform..."
              className={cn(
                "w-full bg-transparent text-white placeholder:text-gray-500 focus:outline-none",
                variant === "hero" ? "py-5 pl-12 pr-12 text-xl" : "py-2.5 pl-12 pr-10 text-base",
              )}
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-4 p-1.5 hover:bg-white/10 rounded-full transition-colors"
                aria-label="Clear search"
              >
                <X size={16} className="text-gray-400" />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="pb-20">
      <AnimatePresence mode="wait" initial={false}>
        {!showResultsLayout ? (
          <motion.div
            key="hero"
            className="flex min-h-[calc(100vh-3rem)] flex-col items-center justify-center gap-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="w-full max-w-2xl">{renderSearchShell("hero")}</div>

            <div className="w-full max-w-2xl space-y-4">
              {recentSearches.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.12, delay: 0.05 }}
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Recent searches</p>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((term) => (
                      <span
                        key={term}
                        className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 py-1 pl-3 pr-1.5 text-sm text-gray-300"
                      >
                        <button
                          onClick={() => {
                            setQuery(term);
                            commitSearch(term);
                          }}
                          className="hover:text-white"
                        >
                          {term}
                        </button>
                        <button
                          onClick={() => removeRecentSearch(term)}
                          className="rounded-full p-0.5 text-gray-500 hover:bg-white/10 hover:text-white"
                          aria-label={`Remove ${term}`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <p className="text-sm text-gray-500">
                  Start typing to search your collection — or try a random pick.
                </p>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowAdvancedFilters((current) => !current)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all",
                    showAdvancedFilters || activeFilterCount > 0
                      ? "bg-white/10 border-white/20 text-white"
                      : "bg-transparent border-white/10 text-gray-400 hover:border-white/30 hover:text-white",
                  )}
                >
                  <Filter size={16} />
                  <span>Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="px-2 py-0.5 bg-primary/20 text-primary rounded-full text-xs font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                  {showAdvancedFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button
                  onClick={() => setShowRandomPick(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all bg-transparent border-white/10 text-gray-400 hover:border-white/30 hover:text-white"
                >
                  <Dices size={16} />
                  <span>Random Pick</span>
                </button>
              </div>

              {showAdvancedFilters && renderAdvancedFiltersPanel()}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="sticky top-0 z-50 -mx-6 border-b border-white/10 px-6 py-3"
              style={{ backgroundColor: "var(--color-background)" }}
            >
              <div className="mx-auto flex max-w-7xl items-center gap-3">
                {renderSearchShell("header")}

                <div className="flex shrink-0 items-center gap-3">
                  <span className="whitespace-nowrap text-sm text-gray-400">
                    {isLoadingResults ? (
                      <span className="flex items-center gap-2">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
                        Updating…
                      </span>
                    ) : (
                      <>
                        {totalResults} result{totalResults !== 1 ? "s" : ""}
                      </>
                    )}
                  </span>
                  <button
                    onClick={() => setShowAdvancedFilters((current) => !current)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all",
                      showAdvancedFilters || activeFilterCount > 0
                        ? "bg-white/10 border-white/20 text-white"
                        : "bg-transparent border-white/10 text-gray-400 hover:border-white/30 hover:text-white",
                    )}
                  >
                    <Filter size={16} />
                    <span>Filters</span>
                    {activeFilterCount > 0 && (
                      <span className="px-2 py-0.5 bg-primary/20 text-primary rounded-full text-xs font-bold">
                        {activeFilterCount}
                      </span>
                    )}
                    {showAdvancedFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button
                    onClick={() => setShowRandomPick(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all bg-transparent border-white/10 text-gray-400 hover:border-white/30 hover:text-white"
                  >
                    <Dices size={16} />
                    <span>Random Pick</span>
                  </button>
                </div>
              </div>

              {activeFilterCount > 0 && (
                <div className="mx-auto mt-2 flex max-w-7xl flex-wrap items-center gap-2">
                  {activeFilterChips.map((chip) => (
                    <span
                      key={`${chip.key}:${chip.value}`}
                      className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-1 pl-2.5 pr-1.5 text-xs text-gray-300"
                    >
                      <span className="text-gray-500">{chip.label}</span>
                      <span>{chip.value}</span>
                      <button
                        onClick={() => removeFilterValue(chip.key, chip.value)}
                        className="rounded-full p-0.5 text-gray-500 hover:bg-white/10 hover:text-white"
                        aria-label={`Remove ${chip.label} ${chip.value}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {showAdvancedFilters && (
              <div className="mx-auto mt-6 max-w-7xl">
                {renderAdvancedFiltersPanel()}
              </div>
            )}

            <div className="mx-auto mt-6 max-w-7xl space-y-6">
              {results.length > 0 ? (
                <>
                  <VirtualizedCardGrid
                    items={results}
                    getItemKey={(entry) => entry.id}
                    columns={{ base: 1, sm: 2, md: 3, lg: 4, xl: 5 }}
                    gap={24}
                    estimatedRowHeight={520}
                    onEndReached={loadMoreResults}
                    className={cn('transition-opacity duration-150', isLoadingResults && 'opacity-80')}
                    ariaLabel="Search results"
                    renderItem={(entry, index) => (
                      <MediaCard
                        entry={entry}
                        imagePriority={index < 10 ? 'high' : 'auto'}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        awards={entry.id ? awardsMap.get(entry.id) : undefined}
                      />
                    )}
                  />
                  {isLoadingMore && (
                    <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
                      Loading more results…
                    </div>
                  )}
                </>
              ) : isLoadingResults ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6 animate-pulse">
                    <SearchIcon style={{ color: 'var(--color-primary)', opacity: 0.6 }} size={32} />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-300 mb-2">Searching your collection</h3>
                  <p className="text-gray-500 max-w-md">
                    Updating results for "{query}".
                  </p>
                </div>
              ) : hasActiveSearch ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
                    <SearchIcon className="text-gray-600" size={32} />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-300 mb-2">No results found</h3>
                  <p className="text-gray-500 max-w-md">
                    No entries match your search criteria. Try adjusting your search terms or filters.
                  </p>
                  <div className="mt-6 flex items-center gap-3">
                    <button
                      onClick={clearAllFilters}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-gray-300 transition-colors"
                    >
                      Clear search & filters
                    </button>
                    <button
                      onClick={() => setShowRandomPick(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-gray-300 transition-colors"
                    >
                      <Dices size={16} />
                      Random pick from these filters
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <EntryForm
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialData={editingEntry}
      />

      <RandomPickModal
        isOpen={showRandomPick}
        onClose={() => setShowRandomPick(false)}
        initialSearchContext={
          hasActiveSearch
            ? {
                query,
                entryTypes: filters.entryTypes,
                platforms: filters.platforms,
                actresses: filters.actresses,
                directors: filters.directors,
                authors: filters.authors,
                franchises: filters.franchises,
                series: filters.series,
              }
            : null
        }
      />
    </div>
  );
}

function hasActiveFilters(filters: SearchFilters): boolean {
  return getActiveFilterCount(filters) > 0;
}

function getActiveFilterCount(filters: SearchFilters): number {
  return Object.values(filters).reduce((count, values) => count + values.length, 0);
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
