import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { dbService, type MediaEntry } from "../lib/db";
import { MediaCard } from "../components/MediaCard";

export default function YearView() {
  const { year } = useParams();
  const [entries, setEntries] = useState<MediaEntry[]>([]);

  useEffect(() => {
    if (year) {
      dbService.getEntriesByYear(year).then(setEntries);
    }
  }, [year]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">{year} Collection</h2>
          <p className="text-gray-400">{entries.length} entries found</p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {entries.map(entry => (
          <MediaCard key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}