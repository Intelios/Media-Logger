import { useDeferredValue, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router";
import { dbService, type EntryCardSummary, type MediaEntry } from "../lib/db";
import { awardsLogic } from "../lib/awards-logic";
import { profilesLogic } from "../lib/profiles-logic";
import { MediaCard, type MediaAward } from "../components/MediaCard";
import { EntryForm } from "../components/EntryForm";
import { ExpansionsModal } from "../components/ExpansionsModal";
import { YearViewToolbar, YEAR_SORT_OPTIONS, type StatusFilter, type StatusKey, type YearSort } from "../components/YearViewToolbar";
import { VirtualizedCardGrid, type VirtualizedCardGridHandle } from "../components/VirtualizedCardGrid";
import { reportMutationError } from "../components/MutationErrorToast";
import { mediaQueryKeys, queryClient } from "../lib/query-client";
import { getLocalTodayDate } from "../lib/dates";
import { ENTRY_TYPES, FILTER_PRESETS, FILTER_PRESET_KEYS, getVisibleEntryTypes, getVisiblePresetKeys, useAdultMediaEnabled, type ActiveFilterPresetKey, type FilterPresetKey } from "../lib/media-config";

const FILTER_STORAGE_KEY = "yearview-filter-types";
const PRESET_STORAGE_KEY = "yearview-active-preset";
const LOCAL_COPY_FILTER_KEY = "yearview-local-copy-filter";
const REWATCH_FILTER_KEY = "yearview-rewatch-filter";
const SUBTITLES_FILTER_KEY = "yearview-subtitles-filter";
const SORT_STORAGE_KEY = "yearview-sort";

const STATUS_STORAGE_KEYS: Record<StatusKey, string> = {
  localCopy: LOCAL_COPY_FILTER_KEY,
  rewatch: REWATCH_FILTER_KEY,
  subtitles: SUBTITLES_FILTER_KEY,
};

const computeFiltered = (
  data: EntryCardSummary[],
  types: string[],
  localCopy: StatusFilter,
  rewatch: StatusFilter,
  subtitles: StatusFilter
): EntryCardSummary[] => {
  let result = data;

  if (types.length === 0) {
    return [];
  }

  if (types.length !== getVisibleEntryTypes().length) {
    // Entries with no type can't be matched by any type filter, so always keep them visible.
    result = result.filter(e => !e.entry_type || types.includes(e.entry_type));
  }

  if (localCopy !== null) {
    result = result.filter(e => (e.own_local_copy === 1) === localCopy);
  }

  if (rewatch !== null) {
    result = result.filter(e => (e.is_rewatch === 1) === rewatch);
  }

  if (subtitles !== null) {
    result = result.filter(e => (e.has_subtitles === 1) === subtitles);
  }

  return result;
};

// Entries arrive oldest first (completion_date, then id), so "oldest" is the
// order as loaded; the rest sort a copy.
const sortEntries = (data: EntryCardSummary[], sort: YearSort): EntryCardSummary[] => {
  switch (sort) {
    case "newest":
      return [...data].reverse();
    case "score":
      // Highest first; unscored entries go last, keeping date order among ties.
      return [...data].sort((a, b) => (b.review_score ?? -1) - (a.review_score ?? -1));
    case "title":
      return [...data].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
    default:
      return data;
  }
};

const loadPersistedSort = (): YearSort => {
  try {
    const stored = localStorage.getItem(SORT_STORAGE_KEY);
    if (YEAR_SORT_OPTIONS.some((option) => option.value === stored)) return stored as YearSort;
  } catch {
    // Fall back to the default order
  }
  return "oldest";
};

// Helper to load persisted preset from localStorage
const loadPersistedPreset = (): ActiveFilterPresetKey => {
  try {
    const stored = localStorage.getItem(PRESET_STORAGE_KEY);
    if (stored && FILTER_PRESET_KEYS.includes(stored as FilterPresetKey)) {
      return stored as FilterPresetKey;
    }
  } catch {
    // If parsing fails, fall back to default
  }
  return null;
};

// Helper to load persisted status filter from localStorage
const loadStatusFilter = (key: string): StatusFilter => {
  try {
    const stored = localStorage.getItem(key);
    if (stored === "true") return true;
    if (stored === "false") return false;
  } catch {
    // If parsing fails, fall back to default
  }
  return null; // Default: show all
};

// Helper to load persisted filter from localStorage
const loadPersistedFilter = (): string[] => {
  try {
    const stored = localStorage.getItem(FILTER_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate that parsed values are valid entry types
      if (Array.isArray(parsed) && parsed.every(t => ENTRY_TYPES.includes(t))) {
        // Drop any adult types when the setting is off so the active selection
        // matches the visible options (entries are already filtered at the data layer).
        const visible = getVisibleEntryTypes();
        return parsed.filter(t => visible.includes(t));
      }
    }
  } catch {
    // If parsing fails, fall back to default
  }
  return getVisibleEntryTypes(); // Default: all visible types selected
};

export default function YearView() {
  const { year } = useParams();
  const adultEnabled = useAdultMediaEnabled();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<EntryCardSummary[]>([]);

  // State for multi-select - Initialize from localStorage
  const [selectedTypes, setSelectedTypes] = useState<string[]>(loadPersistedFilter);

  // State for active preset
  const [activePreset, setActivePreset] = useState<ActiveFilterPresetKey>(loadPersistedPreset);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MediaEntry | null>(null);

  // Awards data
  const [awardsMap, setAwardsMap] = useState<Map<number, MediaAward[]>>(new Map());

  // Profile keys for clickable profile links
  const [profileKeys, setProfileKeys] = useState<Set<string>>(new Set());

  // Highlight state for featured entry navigation
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const hasProcessedHighlight = useRef(false);
  const highlightTimeoutRef = useRef<number | null>(null);

  // The 3s highlight-clear timer must not fire after unmount or outlive a
  // newer highlight. It is cleared here rather than in the highlight effect's
  // own cleanup because that effect re-runs as soon as the params are cleared
  // and would cancel the timer mid-highlight, leaving the ring stuck on.
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
    };
  }, []);

  // Expansion modal state (opened from a parent game's card)
  const [expansionsParent, setExpansionsParent] = useState<{ id: number; name: string } | null>(null);
  const navigate = useNavigate();
  const handleNavigateToParent = useCallback(async (parentEntryId: number) => {
    const parent = await dbService.getEntryById(parentEntryId);
    if (!parent?.year_completed) return;
    navigate(`/year/${parent.year_completed}?highlight=${parentEntryId}&type=${encodeURIComponent(parent.entry_type || "")}`);
  }, [navigate]);

  // A parent game's "N Expansions" chip is rendered inside MediaCard, which is
  // shared across pages. Opening the modal is a page-level concern, so the card
  // publishes a window event and each host page listens for it.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ parentId: number; parentName: string }>).detail;
      setExpansionsParent({ id: detail.parentId, name: detail.parentName });
    };
    window.addEventListener('media:open-expansions', handler);
    return () => window.removeEventListener('media:open-expansions', handler);
  }, []);
  const loadIdRef = useRef(0);

  // Sort order is a remembered preference, like the filters.
  const [sort, setSort] = useState<YearSort>(loadPersistedSort);

  // Status filters state
  const [localCopyFilter, setLocalCopyFilter] = useState<StatusFilter>(() => loadStatusFilter(LOCAL_COPY_FILTER_KEY));
  const [rewatchFilter, setRewatchFilter] = useState<StatusFilter>(() => loadStatusFilter(REWATCH_FILTER_KEY));
  const [subtitlesFilter, setSubtitlesFilter] = useState<StatusFilter>(() => loadStatusFilter(SUBTITLES_FILTER_KEY));

  const gridRef = useRef<VirtualizedCardGridHandle>(null);

  const handleScrollToBottom = useCallback(() => {
    gridRef.current?.scrollToEnd();
  }, []);

  const changeSort = (next: YearSort) => {
    setSort(next);
    if (next === "oldest") localStorage.removeItem(SORT_STORAGE_KEY);
    else localStorage.setItem(SORT_STORAGE_KEY, next);
  };

  // Cycle status filter: null -> true -> false -> null
  const cycleStatusFilter = (current: StatusFilter): StatusFilter => {
    if (current === null) return true;
    if (current === true) return false;
    return null;
  };

  // Cycle status filter and persist to localStorage
  const handleStatusToggle = (key: string, setter: (value: StatusFilter) => void, current: StatusFilter) => {
    const newValue = cycleStatusFilter(current);
    setter(newValue);
    if (newValue === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, String(newValue));
    }
  };

  // Clear active preset and persist to localStorage
  const clearPreset = () => {
    setActivePreset(null);
    localStorage.removeItem(PRESET_STORAGE_KEY);
  };

  // Handle preset button click
  const handlePresetClick = (presetKey: FilterPresetKey) => {
    if (activePreset === presetKey) {
      // Deactivate preset - reset to all visible types
      clearPreset();
      setSelectedTypes(getVisibleEntryTypes());
    } else {
      // Activate preset
      setActivePreset(presetKey);
      setSelectedTypes(FILTER_PRESETS[presetKey].types);
      localStorage.setItem(PRESET_STORAGE_KEY, presetKey);
    }
  };

  const loadData = useCallback(async (force = false) => {
    if (!year) return;

    const myLoadId = ++loadIdRef.current;
    const entriesKey = mediaQueryKeys.entriesForYear(year);
    const profileKeysKey = [...mediaQueryKeys.profiles, ...mediaQueryKeys.scope(), 'keys'] as const;
    const entriesPromise = force
      ? dbService.getEntrySummariesByYear(year).then((data) => {
          queryClient.setQueryData(entriesKey, data);
          return data;
        })
      : queryClient.fetchQuery({
          queryKey: entriesKey,
          queryFn: () => dbService.getEntrySummariesByYear(year),
        });
    const keysPromise = queryClient.fetchQuery({
      queryKey: profileKeysKey,
      queryFn: () => profilesLogic.getProfileKeys(),
    }).catch((error) => {
      if (loadIdRef.current === myLoadId) {
        console.error('Error loading profile keys:', error);
      }
      return null;
    });

    try {
      const data = await entriesPromise;
      if (loadIdRef.current !== myLoadId) return;

      setEntries(data);

      const mediaIds = data.map(e => e.id).filter((id): id is number => id !== undefined);
      if (mediaIds.length > 0) {
        void awardsLogic.getAwardsForMediaBatch(mediaIds)
          .then((awards) => {
            if (loadIdRef.current !== myLoadId) return;
            setAwardsMap(awards);
          })
          .catch((error) => {
            if (loadIdRef.current === myLoadId) {
              console.error('Error loading awards:', error);
            }
          });
      } else {
        setAwardsMap(new Map());
      }

      void keysPromise.then((keys) => {
        if (loadIdRef.current !== myLoadId || !keys) return;
        setProfileKeys(keys);
      });
    } catch (error) {
      if (loadIdRef.current === myLoadId) {
        console.error('Error loading year entries:', error);
      }
    }
  }, [year, adultEnabled]); // adultEnabled changes the query scope/adult SQL policy.

  const filteredEntries = useMemo(
    () => sortEntries(computeFiltered(entries, selectedTypes, localCopyFilter, rewatchFilter, subtitlesFilter), sort),
    [entries, selectedTypes, localCopyFilter, rewatchFilter, subtitlesFilter, sort]
  );
  const deferredEntries = useDeferredValue(filteredEntries);

  // When Adult Media is toggled, drop any now-hidden types from the active
  // selection and clear the adult preset so the filter UI stays consistent.
  useEffect(() => {
    const visible = getVisibleEntryTypes();
    setSelectedTypes(prev => {
      if (prev.every(t => visible.includes(t))) return prev;
      const next = prev.filter(t => visible.includes(t));
      return next.length > 0 ? next : visible;
    });
    setActivePreset(prev => (prev === "adult" ? null : prev));
  }, [adultEnabled]);

  // Persist filter selection to localStorage
  useEffect(() => {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(selectedTypes));
  }, [selectedTypes]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Listen for 'entry-added' event from Layout sidebar to refresh data
  useEffect(() => {
    const handleEntryAdded = (event: Event) => {
      const customEvent = event as CustomEvent<{ year: number | string }>;
      // Refresh if the added entry is for this year (compare as strings)
      if (String(customEvent.detail?.year) === year) {
        void loadData(true);
      }
    };

    window.addEventListener('entry-added', handleEntryAdded);
    return () => window.removeEventListener('entry-added', handleEntryAdded);
  }, [year, loadData]);

  // Handle highlight param from Featured Entry navigation
  useEffect(() => {
    const highlightParam = searchParams.get('highlight');
    const typeParam = searchParams.get('type');

    if (!highlightParam) {
      // Layout only remounts <main> when the pathname changes, so this page
      // instance survives same-year highlight navigations (e.g. jumping to a
      // base game that lives in the year you are already viewing). Re-arm the
      // latch once the params are cleared, or every highlight after the first
      // is silently swallowed for the lifetime of this instance.
      hasProcessedHighlight.current = false;
      return;
    }
    if (hasProcessedHighlight.current) return;
    hasProcessedHighlight.current = true;
    const entryId = parseInt(highlightParam, 10);

    // If a type is specified and not currently in our filter, add it (only if visible)
    if (typeParam && !selectedTypes.includes(typeParam) && getVisibleEntryTypes().includes(typeParam)) {
      setSelectedTypes([typeParam]);
      setActivePreset(null);
      localStorage.removeItem(PRESET_STORAGE_KEY);
    }

    // Set highlighted ID for animation
    setHighlightedId(entryId);

    // Clear animation after 3 seconds (a newer highlight replaces the timer)
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      highlightTimeoutRef.current = null;
      setHighlightedId(null);
    }, 3000);

    // Clean up URL params
    setSearchParams({}, { replace: true });
  }, [searchParams, selectedTypes, setSearchParams]);

  const handleSave = async (data: Partial<MediaEntry>) => {
    if (editingEntry?.id) {
      // Update existing entry
      await dbService.updateEntry({ ...editingEntry, ...data } as MediaEntry);
    } else {
      // Create new entry (either brand new or duplicated)
      await dbService.addEntry(data as Omit<MediaEntry, "id">);
    }
    await loadData(true);
  };

  // MediaCard invokes onDelete fire-and-forget, so without this catch a DB
  // failure is an unhandled rejection with no UI feedback.
  const handleDelete = useCallback(async (id: number) => {
    try {
      await dbService.deleteEntry(id);
      void loadData(true);
    } catch (error) {
      console.error("Failed to delete entry:", error);
      reportMutationError("Could not delete this entry.", error);
    }
  }, [loadData]);

  const handleEditFromCard = useCallback((entry: MediaEntry) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  }, []);

  // Handle duplicating an entry (for rewatch/replay)
  const handleDuplicate = useCallback((entry: MediaEntry) => {
    // Create a new entry based on the original, but:
    // - Remove the ID (so it creates a new entry)
    // - Set is_rewatch to 1
    // - Default the completion date to today (still editable in the form)
    const duplicatedEntry: MediaEntry = {
      ...entry,
      id: undefined as unknown as number, // Remove ID to create new entry
      is_rewatch: 1,
      completion_date: getLocalTodayDate(),
    };
    setEditingEntry(duplicatedEntry);
    setIsModalOpen(true);
  }, []);

  const yearNumber = Number(year);
  const visibleTypes = getVisibleEntryTypes();
  const showingAllTypes = selectedTypes.length === visibleTypes.length;
  const statuses: Record<StatusKey, StatusFilter> = {
    localCopy: localCopyFilter,
    rewatch: rewatchFilter,
    subtitles: subtitlesFilter,
  };
  const statusSetters: Record<StatusKey, (value: StatusFilter) => void> = {
    localCopy: setLocalCopyFilter,
    rewatch: setRewatchFilter,
    subtitles: setSubtitlesFilter,
  };
  const cycleStatus = (key: StatusKey) => {
    handleStatusToggle(STATUS_STORAGE_KEYS[key], statusSetters[key], statuses[key]);
  };
  const hasActiveFilters =
    activePreset !== null ||
    !showingAllTypes ||
    localCopyFilter !== null ||
    rewatchFilter !== null ||
    subtitlesFilter !== null;

  const showAllTypes = () => {
    clearPreset();
    setSelectedTypes(visibleTypes);
  };

  // Resets every filter; the sort order is a preference, not a filter, so it
  // stays.
  const clearFilters = () => {
    showAllTypes();
    setLocalCopyFilter(null);
    setRewatchFilter(null);
    setSubtitlesFilter(null);
    for (const key of Object.values(STATUS_STORAGE_KEYS)) localStorage.removeItem(key);
  };

  return (
    <div className="space-y-6 relative min-h-[calc(100vh-100px)]">
      <YearViewToolbar
        year={yearNumber}
        shownCount={filteredEntries.length}
        totalCount={entries.length}
        onYearStep={(delta) => navigate(`/year/${yearNumber + delta}`)}
        presetKeys={getVisiblePresetKeys()}
        activePreset={activePreset}
        showingAll={showingAllTypes && activePreset === null}
        onPresetClick={handlePresetClick}
        onShowAll={showAllTypes}
        typeOptions={visibleTypes}
        selectedTypes={selectedTypes}
        onTypesChange={(types) => {
          setSelectedTypes(types);
          // Clear active preset when manually changing filters
          clearPreset();
        }}
        onTypeSolo={(option) => {
          const isSoloed = selectedTypes.length === 1 && selectedTypes[0] === option;
          setSelectedTypes(isSoloed ? visibleTypes : [option]);
          clearPreset();
        }}
        statuses={statuses}
        onStatusCycle={cycleStatus}
        sort={sort}
        onSortChange={changeSort}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        onScrollToBottom={handleScrollToBottom}
        canScrollToBottom={deferredEntries.length > 0}
      />

      {/* Grid */}
      {deferredEntries.length > 0 ? (
        <VirtualizedCardGrid
          ref={gridRef}
          items={deferredEntries}
          getItemKey={(entry) => entry.id}
          columns={{ base: 1, sm: 2, md: 3, lg: 4, xl: 5 }}
          gap={24}
          estimatedRowHeight={420}
          highlightedKey={highlightedId}
          highlightClassName="rounded-2xl ring-4 ring-amber-400 ring-offset-2 ring-offset-gray-900 animate-pulse"
          scrollOptions={{ behavior: 'smooth', align: 'center' }}
          className="pb-20"
          ariaLabel={`${year} collection entries`}
          renderItem={(entry) => {
            const isGameEntry = (entry.entry_type || "").toLowerCase().includes("game");
            const hasCardGlow = entry.review_score === 10 || (isGameEntry && entry.is_platinum === 1);
            return (
              <div
                className={`transition-all duration-300 ${hasCardGlow ? 'overflow-visible' : 'cv-auto'}`}
              >
                <MediaCard
                  entry={entry}
                  imagePriority="auto"
                  onEdit={handleEditFromCard}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onNavigateToParent={handleNavigateToParent}
                  awards={entry.id ? awardsMap.get(entry.id) : undefined}
                  profileKeys={profileKeys}
                />
              </div>
            );
          }}
        />
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <p className="text-lg">Nothing logged in {year} yet.</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <p className="text-lg">No entries match your filters.</p>
          <button
            onClick={clearFilters}
            className="mt-4 text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* The Form Modal - Delete removed from here */}
      <EntryForm
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialData={editingEntry}
      />

      {/* Expansions modal for a parent game */}
      {expansionsParent && (
        <ExpansionsModal
          isOpen
          parentId={expansionsParent.id}
          parentName={expansionsParent.name}
          onClose={() => setExpansionsParent(null)}
          onEntriesChange={() => void loadData(true)}
          onNavigateToParent={handleNavigateToParent}
        />
      )}
    </div>
  );
}
