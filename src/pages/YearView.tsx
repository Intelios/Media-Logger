import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Gamepad2, Film, Heart, Sparkles, ChevronDown, ChevronUp, X, HardDrive, RotateCcw } from "lucide-react";
import { dbService, type MediaEntry } from "../lib/db";
import { awardsLogic } from "../lib/awards-logic";
import { MediaCard, type MediaAward } from "../components/MediaCard";
import { EntryForm } from "../components/EntryForm";
import { MultiSelectFilter } from "../components/MultiSelectFilter"; // Import the component

// Matches your Python config
const ENTRY_TYPES = ["Movie", "Show", "Anime", "Book", "Album", "K-Drama", "JAV", "Hentai", "Game", "Adult Visual Novel", "Other"];

const FILTER_STORAGE_KEY = "yearview-filter-types";
const PRESET_STORAGE_KEY = "yearview-active-preset";
const QUICK_FILTERS_VISIBLE_KEY = "yearview-quick-filters-visible";
const LOCAL_COPY_FILTER_KEY = "yearview-local-copy-filter";
const REWATCH_FILTER_KEY = "yearview-rewatch-filter";

// Status filter types: null = show all, true = show only with status, false = show only without status
type StatusFilter = boolean | null;

// Quick filter presets
type PresetKey = "gaming" | "media" | "adult" | null;

const FILTER_PRESETS: Record<Exclude<PresetKey, null>, { label: string; icon: typeof Gamepad2; types: string[]; gradient: string }> = {
  gaming: {
    label: "Gaming",
    icon: Gamepad2,
    types: ["Game"],
    gradient: "from-green-500 to-emerald-600",
  },
  media: {
    label: "Media",
    icon: Film,
    types: ["K-Drama", "Anime", "Show", "Movie", "Book", "Album"],
    gradient: "from-blue-500 to-purple-600",
  },
  adult: {
    label: "Adult",
    icon: Heart,
    types: ["JAV", "Hentai", "Adult Visual Novel"],
    gradient: "from-pink-500 to-rose-600",
  },
};

// Helper to load persisted preset from localStorage
const loadPersistedPreset = (): PresetKey => {
  try {
    const stored = localStorage.getItem(PRESET_STORAGE_KEY);
    if (stored && (stored === "gaming" || stored === "media" || stored === "adult")) {
      return stored as PresetKey;
    }
  } catch {
    // If parsing fails, fall back to default
  }
  return null;
};

// Helper to load persisted quick filters visibility
const loadQuickFiltersVisible = (): boolean => {
  try {
    const stored = localStorage.getItem(QUICK_FILTERS_VISIBLE_KEY);
    if (stored !== null) {
      return stored === "true";
    }
  } catch {
    // If parsing fails, fall back to default
  }
  return true; // Default: visible
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
        return parsed;
      }
    }
  } catch {
    // If parsing fails, fall back to default
  }
  return ENTRY_TYPES; // Default: all types selected
};

export default function YearView() {
  const { year } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<MediaEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<MediaEntry[]>([]);

  // State for multi-select - Initialize from localStorage
  const [selectedTypes, setSelectedTypes] = useState<string[]>(loadPersistedFilter);

  // State for active preset
  const [activePreset, setActivePreset] = useState<PresetKey>(loadPersistedPreset);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MediaEntry | null>(null);

  // Awards data
  const [awardsMap, setAwardsMap] = useState<Map<number, MediaAward[]>>(new Map());

  // Highlight state for featured entry navigation
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const hasProcessedHighlight = useRef(false);

  // Quick filters visibility state
  const [quickFiltersVisible, setQuickFiltersVisible] = useState<boolean>(loadQuickFiltersVisible);

  // Status filters state
  const [localCopyFilter, setLocalCopyFilter] = useState<StatusFilter>(() => loadStatusFilter(LOCAL_COPY_FILTER_KEY));
  const [rewatchFilter, setRewatchFilter] = useState<StatusFilter>(() => loadStatusFilter(REWATCH_FILTER_KEY));

  // Toggle quick filters visibility
  const toggleQuickFilters = () => {
    const newValue = !quickFiltersVisible;
    setQuickFiltersVisible(newValue);
    localStorage.setItem(QUICK_FILTERS_VISIBLE_KEY, String(newValue));
  };

  // Cycle status filter: null -> true -> false -> null
  const cycleStatusFilter = (current: StatusFilter): StatusFilter => {
    if (current === null) return true;
    if (current === true) return false;
    return null;
  };

  // Handle local copy filter toggle
  const handleLocalCopyToggle = () => {
    const newValue = cycleStatusFilter(localCopyFilter);
    setLocalCopyFilter(newValue);
    if (newValue === null) {
      localStorage.removeItem(LOCAL_COPY_FILTER_KEY);
    } else {
      localStorage.setItem(LOCAL_COPY_FILTER_KEY, String(newValue));
    }
  };

  // Handle rewatch filter toggle
  const handleRewatchToggle = () => {
    const newValue = cycleStatusFilter(rewatchFilter);
    setRewatchFilter(newValue);
    if (newValue === null) {
      localStorage.removeItem(REWATCH_FILTER_KEY);
    } else {
      localStorage.setItem(REWATCH_FILTER_KEY, String(newValue));
    }
  };

  // Handle preset button click
  const handlePresetClick = (presetKey: Exclude<PresetKey, null>) => {
    if (activePreset === presetKey) {
      // Deactivate preset - reset to all types
      setActivePreset(null);
      setSelectedTypes(ENTRY_TYPES);
      localStorage.removeItem(PRESET_STORAGE_KEY);
    } else {
      // Activate preset
      setActivePreset(presetKey);
      setSelectedTypes(FILTER_PRESETS[presetKey].types);
      localStorage.setItem(PRESET_STORAGE_KEY, presetKey);
    }
  };

  const loadData = useCallback(async () => {
    if (year) {
      const data = await dbService.getEntriesByYear(year);
      setEntries(data);
      // Apply current filter immediately upon load
      applyFilter(data, selectedTypes, localCopyFilter, rewatchFilter);

      // Fetch awards for all entries
      const mediaIds = data.map(e => e.id).filter((id): id is number => id !== undefined);
      if (mediaIds.length > 0) {
        const awards = await awardsLogic.getAwardsForMediaBatch(mediaIds);
        setAwardsMap(awards);
      }
    }
  }, [year]); // Removed selectedTypes from dependency to prevent infinite loops if logic changes

  // Persist filter selection to localStorage
  useEffect(() => {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(selectedTypes));
  }, [selectedTypes]);

  // Re-run filter when selection changes OR entries change OR status filters change
  useEffect(() => {
    applyFilter(entries, selectedTypes, localCopyFilter, rewatchFilter);
  }, [selectedTypes, entries, localCopyFilter, rewatchFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listen for 'entry-added' event from Layout sidebar to refresh data
  useEffect(() => {
    const handleEntryAdded = (event: Event) => {
      const customEvent = event as CustomEvent<{ year: number | string }>;
      // Refresh if the added entry is for this year (compare as strings)
      if (String(customEvent.detail?.year) === year) {
        loadData();
      }
    };

    window.addEventListener('entry-added', handleEntryAdded);
    return () => window.removeEventListener('entry-added', handleEntryAdded);
  }, [year, loadData]);

  // Handle highlight param from Featured Entry navigation
  useEffect(() => {
    const highlightParam = searchParams.get('highlight');
    const typeParam = searchParams.get('type');

    if (highlightParam && !hasProcessedHighlight.current) {
      hasProcessedHighlight.current = true;
      const entryId = parseInt(highlightParam, 10);

      // If a type is specified and not currently in our filter, add it
      if (typeParam && !selectedTypes.includes(typeParam) && ENTRY_TYPES.includes(typeParam)) {
        setSelectedTypes([typeParam]);
        setActivePreset(null);
        localStorage.removeItem(PRESET_STORAGE_KEY);
      }

      // Set highlighted ID for animation
      setHighlightedId(entryId);

      // Clear animation after 3 seconds
      setTimeout(() => {
        setHighlightedId(null);
      }, 3000);

      // Clean up URL params
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, selectedTypes, setSearchParams]);

  // Scroll to highlighted entry when it becomes visible
  useEffect(() => {
    if (highlightedId && highlightRef.current) {
      // Wait for filter and render to complete
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [highlightedId, filteredEntries]);

  // Handle Filtering Logic
  const applyFilter = (data: MediaEntry[], types: string[], localCopy: StatusFilter, rewatch: StatusFilter) => {
    let result = data;

    // Apply type filter
    if (types.length === 0) {
      setFilteredEntries([]); // Nothing selected = nothing shown
      return;
    } else if (types.length !== ENTRY_TYPES.length) {
      result = result.filter(e => e.entry_type && types.includes(e.entry_type));
    }

    // Apply local copy filter
    if (localCopy !== null) {
      result = result.filter(e => (e.own_local_copy === 1) === localCopy);
    }

    // Apply rewatch filter
    if (rewatch !== null) {
      result = result.filter(e => (e.is_rewatch === 1) === rewatch);
    }

    setFilteredEntries(result);
  };

  const handleSave = async (data: Partial<MediaEntry>) => {
    if (editingEntry?.id) {
      // Update existing entry
      await dbService.updateEntry({ ...editingEntry, ...data } as MediaEntry);
    } else {
      // Create new entry (either brand new or duplicated)
      await dbService.addEntry(data as Omit<MediaEntry, "id">);
    }
    // Small delay to ensure DB write commits before read
    setTimeout(() => loadData(), 50);
  };

  const handleDelete = async (id: number) => {
    await dbService.deleteEntry(id);
    loadData();
  };

  const handleEditFromCard = (entry: MediaEntry) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  // Handle duplicating an entry (for rewatch/replay)
  const handleDuplicate = (entry: MediaEntry) => {
    // Create a new entry based on the original, but:
    // - Remove the ID (so it creates a new entry)
    // - Set is_rewatch to 1
    // - Clear the completion date (so user can set a new date)
    const duplicatedEntry: MediaEntry = {
      ...entry,
      id: undefined as unknown as number, // Remove ID to create new entry
      is_rewatch: 1,
      completion_date: null, // Clear date for new entry
    };
    setEditingEntry(duplicatedEntry);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 relative min-h-[calc(100vh-100px)]">
      {/* Header & Filters */}
      <header className="flex flex-col gap-4">
        {/* Title Row with Quick Filters Toggle */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            {/* Title and button on same line */}
            <div className="flex items-center gap-4">
              <h2 className="text-3xl font-bold">
                <span className="text-primary">{year}</span> Collection
              </h2>

              {/* Quick Filters Toggle Button */}
              <button
                onClick={toggleQuickFilters}
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
                  transition-all duration-200
                  ${quickFiltersVisible
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'bg-white/5 text-gray-400 hover:text-gray-300 border border-white/10 hover:border-white/20'}
                `}
                title={quickFiltersVisible ? "Hide quick filters" : "Show quick filters"}
              >
                <Sparkles size={14} />
                <span>Quick Filters</span>
                {quickFiltersVisible ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            {/* Item count below */}
            <p className="text-gray-500 text-sm mt-1">
              {filteredEntries.length} of {entries.length} items
            </p>
          </div>

          {/* Multi-Select Filter */}
          <MultiSelectFilter
            options={ENTRY_TYPES}
            selected={selectedTypes}
            onChange={(types) => {
              setSelectedTypes(types);
              // Clear active preset when manually changing filters
              setActivePreset(null);
              localStorage.removeItem(PRESET_STORAGE_KEY);
            }}
            label="Filter Types"
          />
        </div>

        {/* Collapsible Quick Filter Panel */}
        <div
          className={`
            overflow-hidden transition-all duration-300 ease-in-out
            ${quickFiltersVisible ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0'}
          `}
        >
          <div className="
            flex items-center gap-3 p-4 rounded-xl
            bg-white/[0.03] backdrop-blur-sm
            border border-white/[0.08]
            shadow-lg shadow-black/10
          ">
            <span className="text-xs text-gray-500 uppercase tracking-wider font-medium mr-2">Presets</span>

            {(Object.keys(FILTER_PRESETS) as Exclude<PresetKey, null>[]).map((key) => {
              const preset = FILTER_PRESETS[key];
              const Icon = preset.icon;
              const isActive = activePreset === key;
              return (
                <button
                  key={key}
                  onClick={() => handlePresetClick(key)}
                  className={`
                    group relative flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
                    transition-all duration-200
                    ${isActive
                      ? `bg-gradient-to-r ${preset.gradient} text-white shadow-lg shadow-black/20`
                      : 'bg-white/[0.05] hover:bg-white/[0.08] text-gray-400 hover:text-white border border-white/[0.08] hover:border-white/[0.15]'}
                  `}
                >
                  <Icon size={16} className={isActive ? '' : 'opacity-70 group-hover:opacity-100'} />
                  <span>{preset.label}</span>
                  <span className={`
                    text-xs px-1.5 py-0.5 rounded-md ml-1
                    ${isActive ? 'bg-white/20' : 'bg-white/[0.05] text-gray-500 group-hover:text-gray-400'}
                  `}>
                    {preset.types.length}
                  </span>
                </button>
              );
            })}

            {/* Separator */}
            <div className="w-px h-8 bg-white/10 mx-2" />

            {/* Status Filters */}
            <span className="text-xs text-gray-500 uppercase tracking-wider font-medium mr-2">Status</span>

            {/* Local Copy Filter */}
            <button
              onClick={handleLocalCopyToggle}
              className={`
                group relative flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm
                transition-all duration-200
                ${localCopyFilter !== null
                  ? localCopyFilter
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-black/20'
                    : 'bg-gradient-to-r from-gray-600 to-gray-700 text-white shadow-lg shadow-black/20'
                  : 'bg-white/[0.05] hover:bg-white/[0.08] text-gray-400 hover:text-white border border-white/[0.08] hover:border-white/[0.15]'}
              `}
              title={localCopyFilter === null ? "Show all" : localCopyFilter ? "Showing only with local copy" : "Showing only without local copy"}
            >
              <HardDrive size={16} className={localCopyFilter !== null ? '' : 'opacity-70 group-hover:opacity-100'} />
              <span>Local Copy</span>
              {localCopyFilter !== null && (
                <span className="text-xs px-1.5 py-0.5 rounded-md ml-1 bg-white/20">
                  {localCopyFilter ? "Yes" : "No"}
                </span>
              )}
            </button>

            {/* Rewatch Filter */}
            <button
              onClick={handleRewatchToggle}
              className={`
                group relative flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm
                transition-all duration-200
                ${rewatchFilter !== null
                  ? rewatchFilter
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-black/20'
                    : 'bg-gradient-to-r from-gray-600 to-gray-700 text-white shadow-lg shadow-black/20'
                  : 'bg-white/[0.05] hover:bg-white/[0.08] text-gray-400 hover:text-white border border-white/[0.08] hover:border-white/[0.15]'}
              `}
              title={rewatchFilter === null ? "Show all" : rewatchFilter ? "Showing only rewatches/replays" : "Showing only first-time entries"}
            >
              <RotateCcw size={16} className={rewatchFilter !== null ? '' : 'opacity-70 group-hover:opacity-100'} />
              <span>Rewatch</span>
              {rewatchFilter !== null && (
                <span className="text-xs px-1.5 py-0.5 rounded-md ml-1 bg-white/20">
                  {rewatchFilter ? "Yes" : "No"}
                </span>
              )}
            </button>

            {/* Clear/Reset button - only show when a preset or status filter is active */}
            {(activePreset || localCopyFilter !== null || rewatchFilter !== null) && (
              <button
                onClick={() => {
                  setActivePreset(null);
                  setSelectedTypes(ENTRY_TYPES);
                  setLocalCopyFilter(null);
                  setRewatchFilter(null);
                  localStorage.removeItem(PRESET_STORAGE_KEY);
                  localStorage.removeItem(LOCAL_COPY_FILTER_KEY);
                  localStorage.removeItem(REWATCH_FILTER_KEY);
                }}
                className="
                  flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm
                  text-gray-400 hover:text-white hover:bg-white/[0.05]
                  transition-all duration-200 ml-auto
                "
              >
                <X size={14} />
                <span>Clear All</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Grid */}
      {filteredEntries.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-20">
          {filteredEntries.map(entry => {
            const isHighlighted = entry.id === highlightedId;
            return (
              <div
                key={entry.id}
                ref={isHighlighted ? highlightRef : null}
                className={`transition-all duration-300 ${isHighlighted
                  ? 'ring-4 ring-amber-400 ring-offset-2 ring-offset-gray-900 rounded-2xl animate-pulse'
                  : ''
                  }`}
              >
                <MediaCard
                  entry={entry}
                  onEdit={handleEditFromCard}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  awards={entry.id ? awardsMap.get(entry.id) : undefined}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <p className="text-lg">No entries match your filter.</p>
          <button
            onClick={() => setSelectedTypes(ENTRY_TYPES)}
            className="mt-4 text-primary hover:underline"
          >
            Reset Filters
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
    </div>
  );
}