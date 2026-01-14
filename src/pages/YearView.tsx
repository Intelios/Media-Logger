import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Plus, Gamepad2, Film, Heart } from "lucide-react";
import { dbService, type MediaEntry } from "../lib/db";
import { awardsLogic } from "../lib/awards-logic";
import { MediaCard, type MediaAward } from "../components/MediaCard";
import { EntryForm } from "../components/EntryForm";
import { MultiSelectFilter } from "../components/MultiSelectFilter"; // Import the component

// Matches your Python config
const ENTRY_TYPES = ["Movie", "Show", "Anime", "Book", "Album", "K-Drama", "JAV", "Hentai", "Game", "Adult Visual Novel", "Other"];

const FILTER_STORAGE_KEY = "yearview-filter-types";
const PRESET_STORAGE_KEY = "yearview-active-preset";

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
      applyFilter(data, selectedTypes);

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

  // Re-run filter when selection changes OR entries change
  useEffect(() => {
    applyFilter(entries, selectedTypes);
  }, [selectedTypes, entries]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
  const applyFilter = (data: MediaEntry[], types: string[]) => {
    // If all types selected, show everything (optimization)
    if (types.length === ENTRY_TYPES.length) {
      setFilteredEntries(data);
    } else if (types.length === 0) {
      setFilteredEntries([]); // Nothing selected = nothing shown
    } else {
      setFilteredEntries(data.filter(e => e.entry_type && types.includes(e.entry_type)));
    }
  };

  const handleSave = async (data: Partial<MediaEntry>) => {
    if (editingEntry) {
      await dbService.updateEntry({ ...editingEntry, ...data } as MediaEntry);
    } else {
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

  return (
    <div className="space-y-6 relative min-h-[calc(100vh-100px)]">
      {/* Header & Filters */}
      <header className="flex flex-col gap-4">
        {/* Quick Filter Preset Buttons */}
        <div className="flex items-center gap-3">
          {(Object.keys(FILTER_PRESETS) as Exclude<PresetKey, null>[]).map((key) => {
            const preset = FILTER_PRESETS[key];
            const Icon = preset.icon;
            const isActive = activePreset === key;
            return (
              <button
                key={key}
                onClick={() => handlePresetClick(key)}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold
                  transition-all duration-200 shadow-lg
                  ${isActive
                    ? `bg-gradient-to-r ${preset.gradient} text-white shadow-lg scale-105`
                    : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10'}
                `}
              >
                <Icon size={18} />
                <span>{preset.label}</span>
              </button>
            );
          })}

          {/* Reset button - only show when a preset is active */}
          {activePreset && (
            <button
              onClick={() => {
                setActivePreset(null);
                setSelectedTypes(ENTRY_TYPES);
                localStorage.removeItem(PRESET_STORAGE_KEY);
              }}
              className="text-gray-400 hover:text-white text-sm underline underline-offset-2 transition-colors"
            >
              Reset
            </button>
          )}
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold">
              <span className="text-primary">{year}</span> Collection
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {filteredEntries.length} of {entries.length} items
            </p>
          </div>

          <div className="flex items-center gap-3">
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

            {/* Add Button */}
            <button
              onClick={() => { setEditingEntry(null); setIsModalOpen(true); }}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-xl font-semibold shadow-lg shadow-primary/25 transition-all"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Add Entry</span>
            </button>
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