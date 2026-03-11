import { useState, useEffect, useMemo } from "react";
import { Search as SearchIcon, X, Filter, ChevronDown, ChevronUp, Sparkles, RotateCcw } from "lucide-react";
import { dbService, type MediaEntry } from "../lib/db";
import { awardsLogic } from "../lib/awards-logic";
import { MediaCard, type MediaAward } from "../components/MediaCard";
import { EntryForm } from "../components/EntryForm";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { cn } from "../lib/utils_ui";

// Entry types matching the app config
const ENTRY_TYPES = ["Movie", "Show", "Anime", "Book", "Album", "K-Drama", "JAV", "Hentai", "Game", "Adult Visual Novel", "Other"];

// LocalStorage keys
const SEARCH_FILTERS_KEY = "search-filters";

interface SearchFilters {
  entryTypes: string[];
  platforms: string[];
  actresses: string[];
  directors: string[];
  authors: string[];
  franchises: string[];
}

const defaultFilters: SearchFilters = {
  entryTypes: [],
  platforms: [],
  actresses: [],
  directors: [],
  authors: [],
  franchises: [],
};

// Load persisted filters
const loadPersistedFilters = (): SearchFilters => {
  try {
    const stored = localStorage.getItem(SEARCH_FILTERS_KEY);
    if (stored) {
      return { ...defaultFilters, ...JSON.parse(stored) };
    }
  } catch {
    // Fall back to default
  }
  return defaultFilters;
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaEntry[]>([]);
  const [allEntries, setAllEntries] = useState<MediaEntry[]>([]);
  const [filters, setFilters] = useState<SearchFilters>(loadPersistedFilters);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MediaEntry | null>(null);
  const [awardsMap, setAwardsMap] = useState<Map<number, MediaAward[]>>(new Map());

  // Load all entries
  useEffect(() => {
    dbService.getAllEntries().then(setAllEntries);
  }, []);

  // Persist filters
  useEffect(() => {
    localStorage.setItem(SEARCH_FILTERS_KEY, JSON.stringify(filters));
  }, [filters]);

  // Fetch awards for all entries
  useEffect(() => {
    const fetchAwards = async () => {
      const mediaIds = allEntries.map(e => e.id).filter((id): id is number => id !== undefined);
      if (mediaIds.length > 0) {
        const awards = await awardsLogic.getAwardsForMediaBatch(mediaIds);
        setAwardsMap(awards);
      } else {
        setAwardsMap(new Map());
      }
    };
    fetchAwards();
  }, [allEntries]);

  // Extract unique values for filter dropdowns
  const uniqueValues = useMemo(() => {
    const platforms = new Set<string>();
    const actresses = new Set<string>();
    const directors = new Set<string>();
    const authors = new Set<string>();
    const franchises = new Set<string>();

    allEntries.forEach(e => {
      if (e.platform) platforms.add(e.platform);
      if (e.actress) {
        // Handle comma-separated actresses
        e.actress.split(',').forEach(a => {
          const trimmed = a.trim();
          if (trimmed) actresses.add(trimmed);
        });
      }
      if (e.director) directors.add(e.director);
      if (e.author) authors.add(e.author);
      if (e.franchise) franchises.add(e.franchise);
    });

    return {
      platforms: Array.from(platforms).sort(),
      actresses: Array.from(actresses).sort(),
      directors: Array.from(directors).sort(),
      authors: Array.from(authors).sort(),
      franchises: Array.from(franchises).sort(),
    };
  }, [allEntries]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    return (
      filters.entryTypes.length +
      filters.platforms.length +
      filters.actresses.length +
      filters.directors.length +
      filters.authors.length +
      filters.franchises.length
    );
  }, [filters]);

  // Filter and search logic
  useEffect(() => {
    let filtered = [...allEntries];

    // Apply text search
    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(e =>
        e.name.toLowerCase().includes(lowerQuery) ||
        (e.author && e.author.toLowerCase().includes(lowerQuery)) ||
        (e.artist && e.artist.toLowerCase().includes(lowerQuery)) ||
        (e.genre && e.genre.toLowerCase().includes(lowerQuery)) ||
        (e.director && e.director.toLowerCase().includes(lowerQuery)) ||
        (e.actress && e.actress.toLowerCase().includes(lowerQuery)) ||
        (e.platform && e.platform.toLowerCase().includes(lowerQuery))
      );
    }

    // Apply entry type filter
    if (filters.entryTypes.length > 0) {
      filtered = filtered.filter(e => e.entry_type && filters.entryTypes.includes(e.entry_type));
    }

    // Apply platform filter
    if (filters.platforms.length > 0) {
      filtered = filtered.filter(e => e.platform && filters.platforms.includes(e.platform));
    }

    // Apply actress filter (check if any selected actress matches)
    if (filters.actresses.length > 0) {
      filtered = filtered.filter(e => {
        if (!e.actress) return false;
        const entryActresses = e.actress.split(',').map(a => a.trim());
        return filters.actresses.some(fa => entryActresses.includes(fa));
      });
    }

    // Apply director filter
    if (filters.directors.length > 0) {
      filtered = filtered.filter(e => e.director && filters.directors.includes(e.director));
    }

    // Apply author filter
    if (filters.authors.length > 0) {
      filtered = filtered.filter(e => e.author && filters.authors.includes(e.author));
    }

    // Apply franchise filter
    if (filters.franchises.length > 0) {
      filtered = filtered.filter(e => e.franchise && filters.franchises.includes(e.franchise));
    }

    setResults(filtered);
  }, [query, allEntries, filters]);

  // Handlers
  const handleEdit = (entry: MediaEntry) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const handleSave = async (data: Partial<MediaEntry>) => {
    if (editingEntry) {
      await dbService.updateEntry({ ...editingEntry, ...data } as MediaEntry);
      dbService.getAllEntries().then(setAllEntries);
    }
  };

  const handleDelete = async (id: number) => {
    await dbService.deleteEntry(id);
    dbService.getAllEntries().then(setAllEntries);
  };

  const updateFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearAllFilters = () => {
    setFilters(defaultFilters);
    setQuery("");
  };

  const hasActiveSearch = query.trim() || activeFilterCount > 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <header className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
            Search Collection
          </h2>
          <p className="text-gray-400 mt-1">Find entries across your entire collection</p>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-2xl blur-xl opacity-50" />
          <div className="relative bg-white/5 border border-white/10 rounded-2xl p-1 backdrop-blur-sm">
            <div className="relative flex items-center">
              <SearchIcon className="absolute left-4 text-gray-400" size={20} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, author, artist, genre, director, actress, platform..."
                className="w-full bg-transparent py-4 pl-12 pr-12 text-lg text-white placeholder:text-gray-500 focus:outline-none"
                autoFocus
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-4 p-1.5 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={16} className="text-gray-400" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Advanced Filters Toggle */}
        <div className="space-y-4">
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all",
              showAdvancedFilters || activeFilterCount > 0
                ? "bg-white/10 border-white/20 text-white"
                : "bg-transparent border-white/10 text-gray-400 hover:border-white/30 hover:text-white"
            )}
          >
            <Filter size={16} />
            <span>Advanced Filters</span>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 bg-primary/20 text-primary rounded-full text-xs font-bold">
                {activeFilterCount}
              </span>
            )}
            {showAdvancedFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {/* Advanced Filters Panel */}
          {showAdvancedFilters && (
            <div className="relative z-50 bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-sm space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
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
                  options={ENTRY_TYPES}
                  selected={filters.entryTypes}
                  onChange={(v) => updateFilter('entryTypes', v)}
                  label="Type"
                />
                {uniqueValues.platforms.length > 0 && (
                  <MultiSelectFilter
                    options={uniqueValues.platforms}
                    selected={filters.platforms}
                    onChange={(v) => updateFilter('platforms', v)}
                    label="Platform"
                  />
                )}
                {uniqueValues.actresses.length > 0 && (
                  <MultiSelectFilter
                    options={uniqueValues.actresses}
                    selected={filters.actresses}
                    onChange={(v) => updateFilter('actresses', v)}
                    label="Actress"
                  />
                )}
                {uniqueValues.directors.length > 0 && (
                  <MultiSelectFilter
                    options={uniqueValues.directors}
                    selected={filters.directors}
                    onChange={(v) => updateFilter('directors', v)}
                    label="Director"
                  />
                )}
                {uniqueValues.authors.length > 0 && (
                  <MultiSelectFilter
                    options={uniqueValues.authors}
                    selected={filters.authors}
                    onChange={(v) => updateFilter('authors', v)}
                    label="Author"
                  />
                )}
                {uniqueValues.franchises.length > 0 && (
                  <MultiSelectFilter
                    options={uniqueValues.franchises}
                    selected={filters.franchises}
                    onChange={(v) => updateFilter('franchises', v)}
                    label="Franchise"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Results Summary */}
        {hasActiveSearch && (
          <div className="flex items-center gap-3 text-sm">
            <Sparkles className="text-cyan-400" size={16} />
            <span className="text-gray-400">
              Found <span className="text-white font-semibold">{results.length}</span> result{results.length !== 1 ? 's' : ''}
              {query && <span className="text-gray-500"> for "{query}"</span>}
              {activeFilterCount > 0 && (
                <span className="text-gray-500"> with {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} applied</span>
              )}
            </span>
          </div>
        )}
      </header>

      {/* Results Grid */}
      {results.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {results.map(entry => (
            <div key={entry.id}>
              <MediaCard
                entry={entry}
                onEdit={handleEdit}
                onDelete={handleDelete}
                awards={entry.id ? awardsMap.get(entry.id) : undefined}
              />
            </div>
          ))}
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
          <button
            onClick={clearAllFilters}
            className="mt-6 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-gray-300 transition-colors"
          >
            Clear search & filters
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500/10 to-blue-500/10 flex items-center justify-center mb-6 animate-pulse">
            <SearchIcon className="text-cyan-400/60" size={40} />
          </div>
          <h3 className="text-xl font-semibold text-gray-300 mb-2">Search your collection</h3>
          <p className="text-gray-500 max-w-md">
            Start typing to search across all your entries, or use advanced filters to narrow down results.
          </p>
        </div>
      )}

      {/* Form Modal */}
      <EntryForm
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialData={editingEntry}
        allEntries={allEntries}
      />
    </div>
  );
}