import { useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import { dbService, type MediaEntry } from "../lib/db";
import { MediaCard } from "./MediaCard"; // Reuse the card!
import { useEscapeToClose } from "../lib/useEscapeToClose";

interface WinnerPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (mediaId: number) => void;
  year?: number; // Optional: filter search by year automatically?
}

export function WinnerPicker({ isOpen, onClose, onSelect, year }: WinnerPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaEntry[]>([]);
  const [allEntries, setAllEntries] = useState<MediaEntry[]>([]);

  useEscapeToClose(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      dbService.getAllEntries().then(entries => {
        // Optional: Filter by the award year automatically? 
        // Usually awards are given to things from that year, but sometimes "Late entries" apply.
        // Let's keep it open for now, or filter if year is provided.
        if (year) {
            setAllEntries(entries.filter(e => e.year_completed === year));
        } else {
            setAllEntries(entries);
        }
      });
    }
  }, [isOpen, year]);

  useEffect(() => {
    if (!query) {
        setResults(allEntries.slice(0, 8)); // Show some recent ones
        return;
    }
    const q = query.toLowerCase();
    setResults(allEntries.filter(e => e.name.toLowerCase().includes(q)));
  }, [query, allEntries]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-white/10 w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex flex-col">
        
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-white focus:border-primary outline-none"
              placeholder={`Search for a winner${year ? ` from ${year}` : ''}...`}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
            <X size={20} />
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {results.map(entry => (
              <div 
                key={entry.id} 
                onClick={() => onSelect(entry.id)}
                className="cursor-pointer ring-offset-2 ring-offset-[#1a1a1a] hover:ring-2 hover:ring-primary rounded-xl transition-all"
              >
                <MediaCard entry={entry} />
              </div>
            ))}
          </div>
          {results.length === 0 && (
            <div className="text-center py-20 text-gray-500">No media found</div>
          )}
        </div>
      </div>
    </div>
  );
}
