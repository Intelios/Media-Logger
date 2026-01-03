import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Plus, Filter, SortAsc } from "lucide-react";
import { dbService, type MediaEntry } from "../lib/db";
import { MediaCard } from "../components/MediaCard";
import { EntryForm } from "../components/EntryForm";
import { cn } from "../lib/utils_ui";

const FILTERS = ["All", "Movie", "Show", "Anime", "Game", "Book", "JAV"];

export default function YearView() {
  const { year } = useParams();
  const [entries, setEntries] = useState<MediaEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<MediaEntry[]>([]);
  const [activeFilter, setActiveFilter] = useState("All");
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MediaEntry | null>(null);

  const loadData = useCallback(() => {
    if (year) {
      dbService.getEntriesByYear(year).then(data => {
        setEntries(data);
        applyFilter(data, activeFilter);
      });
    }
  }, [year, activeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Filtering
  const applyFilter = (data: MediaEntry[], filter: string) => {
    if (filter === "All") {
      setFilteredEntries(data);
    } else {
      setFilteredEntries(data.filter(e => e.entry_type === filter));
    }
  };

  const handleFilterClick = (filter: string) => {
    setActiveFilter(filter);
    applyFilter(entries, filter);
  };

  const handleSave = async (data: Partial<MediaEntry>) => {
    if (editingEntry) {
      await dbService.updateEntry({ ...editingEntry, ...data } as MediaEntry);
    } else {
      await dbService.addEntry(data as Omit<MediaEntry, "id">);
    }
    loadData(); // Refresh grid
  };

    const handleDelete = async (id: number) => {
        await dbService.deleteEntry(id);
        loadData(); // Refresh grid
  };

  return (
    <div className="space-y-6 relative min-h-[calc(100vh-100px)]">
      {/* Header & Filters */}
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">{year} Collection</h2>
            <p className="text-gray-400 text-sm mt-1">{filteredEntries.length} items</p>
          </div>
          {/* Add Button (Floating style relative to header for desktop) */}
          <button 
            onClick={() => { setEditingEntry(null); setIsModalOpen(true); }}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg font-semibold shadow-lg shadow-primary/25 transition-all"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Add Entry</span>
          </button>
        </div>

        {/* Filter Bar (Scrollable) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
          <Filter size={16} className="text-gray-500 mr-2 flex-shrink-0" />
          {FILTERS.map(filter => (
            <button
              key={filter}
              onClick={() => handleFilterClick(filter)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap",
                activeFilter === filter 
                  ? "bg-white text-black border-white" 
                  : "bg-transparent text-gray-400 border-white/10 hover:border-white/30"
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </header>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-20">
        {filteredEntries.map(entry => (
          <div key={entry.id} onClick={() => { setEditingEntry(entry); setIsModalOpen(true); }}>
            <MediaCard entry={entry} />
          </div>
        ))}
      </div>

      {/* The Form Modal */}
      <EntryForm 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete} // Pass it here
        initialData={editingEntry}
      />
    </div>
  );
}