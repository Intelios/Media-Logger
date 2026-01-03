import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { dbService, type MediaEntry } from "../lib/db";
import { MediaCard } from "../components/MediaCard";
import { EntryForm } from "../components/EntryForm";
import { MultiSelectFilter } from "../components/MultiSelectFilter"; // Import the component

// Matches your Python config
const ENTRY_TYPES = ["Movie", "Show", "Anime", "Book", "Album", "K-Drama", "JAV", "Hentai", "Game", "Adult Visual Novel", "Other"];

export default function YearView() {
  const { year } = useParams();
  const [entries, setEntries] = useState<MediaEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<MediaEntry[]>([]);
  
  // State for multi-select (Default to ALL types selected)
  const [selectedTypes, setSelectedTypes] = useState<string[]>(ENTRY_TYPES);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MediaEntry | null>(null);

  const loadData = useCallback(() => {
    if (year) {
      dbService.getEntriesByYear(year).then(data => {
        setEntries(data);
        // Apply current filter immediately upon load
        applyFilter(data, selectedTypes);
      });
    }
  }, [year]); // Removed selectedTypes from dependency to prevent infinite loops if logic changes

  // Re-run filter when selection changes OR entries change
  useEffect(() => {
    applyFilter(entries, selectedTypes);
  }, [selectedTypes, entries]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  return (
    <div className="space-y-6 relative min-h-[calc(100vh-100px)]">
      {/* Header & Filters */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400">
              {year} Collection
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              Showing {filteredEntries.length} of {entries.length} items
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Multi-Select Filter */}
            <MultiSelectFilter 
              options={ENTRY_TYPES}
              selected={selectedTypes}
              onChange={setSelectedTypes}
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
          {filteredEntries.map(entry => (
            <div key={entry.id} onClick={() => { setEditingEntry(entry); setIsModalOpen(true); }}>
              <MediaCard entry={entry} />
            </div>
          ))}
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

      {/* The Form Modal */}
      <EntryForm 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
        initialData={editingEntry}
      />
    </div>
  );
}