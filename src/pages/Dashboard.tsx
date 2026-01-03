import { useEffect, useState } from "react";
import { dbService, type MediaEntry } from "../lib/db";
import { MediaCard } from "../components/MediaCard";

export default function Dashboard() {
  const [recent, setRecent] = useState<MediaEntry[]>([]);

  useEffect(() => {
    // Quick query for recent items
    dbService.getAllEntries().then(entries => setRecent(entries.slice(0, 10)));
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold">Dashboard</h2>
        <p className="text-gray-400">Welcome back to your collection.</p>
      </header>

      {/* We will add Stats Cards here later */}
      
      <section>
        <h3 className="text-xl font-semibold mb-4">Recent Additions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {recent.map(entry => (
            <MediaCard key={entry.id} entry={entry} />
          ))}
        </div>
      </section>
    </div>
  );
}