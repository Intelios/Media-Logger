import { useState, useEffect } from "react";
import { Search as SearchIcon, X, Filter } from "lucide-react";
import { dbService, type MediaEntry } from "../lib/db";
import { MediaCard } from "../components/MediaCard";
import { EntryForm } from "../components/EntryForm"; // Reuse for editing search results

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaEntry[]>([]);
  const [allEntries, setAllEntries] = useState<MediaEntry[]>([]);
  
  // Reuse Modal Logic
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MediaEntry | null>(null);

  useEffect(() => {
    // Load ALL entries into memory for instant client-side search
    // Since you have ~400 entries, this is extremely fast in JS
    dbService.getAllEntries().then(setAllEntries);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const filtered = allEntries.filter(e => 
      e.name.toLowerCase().includes(lowerQuery) || 
      (e.author && e.author.toLowerCase().includes(lowerQuery)) ||
      (e.artist && e.artist.toLowerCase().includes(lowerQuery)) ||
      (e.genre && e.genre.toLowerCase().includes(lowerQuery))
    );
    setResults(filtered);
  }, [query, allEntries]);

  // Handlers for editing from search results
  const handleSave = async (data: Partial<MediaEntry>) => {
    if (editingEntry) {
      await dbService.updateEntry({ ...editingEntry, ...data } as MediaEntry);
      // Reload db data to reflect changes
      dbService.getAllEntries().then(setAllEntries);
    }
  };

  const handleDelete = async (id: number) => {
    await dbService.deleteEntry(id);
    dbService.getAllEntries().then(setAllEntries);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col gap-4">
        <h2 className="text-3xl font-bold">Search Collection</h2>
        
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, author, artist, or genre..."
            className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-lg text-white focus:border-primary focus:outline-none transition-colors"
            autoFocus
          />
          {query && (
            <button 
              onClick={() => setQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full"
            >
              <X size={16} className="text-gray-400" />
            </button>
          )}
        </div>
      </header>

      {/* Results Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {results.map(entry => (
          <div key={entry.id} onClick={() => { setEditingEntry(entry); setIsModalOpen(true); }}>
            <MediaCard entry={entry} />
          </div>
        ))}
      </div>

      {query && results.length === 0 && (
        <div className="text-center py-20 text-gray-500">
          No results found for "{query}"
        </div>
      )}

      {!query && (
        <div className="text-center py-20 text-gray-600">
          Start typing to search your collection...
        </div>
      )}

      {/* Form Modal */}
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