import { useEffect, useState } from "react";
import { dbService, type MediaEntry } from "./lib/db";
import { getImageUrl } from "./lib/utils";
import { Star, Calendar, MonitorPlay } from "lucide-react"; // Icons
import "./index.css";

function App() {
  const [entries, setEntries] = useState<MediaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState<Record<number, string>>({});

  useEffect(() => {
    async function loadData() {
      try {
        const data = await dbService.getAllEntries();
        setEntries(data);
        
        // Resolve images asynchronously
        const imgMap: Record<number, string> = {};
        for (const entry of data) {
          imgMap[entry.id] = await getImageUrl(entry.image_url);
        }
        setImages(imgMap);
      } catch (error) {
        console.error("Failed to load DB:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) return <div className="text-white p-10">Loading Database...</div>;

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-500">
          Media Logger
        </h1>
        <p className="text-gray-400">Loaded {entries.length} entries from SQLite</p>
      </header>

      {/* Grid Layout mimicking your Gallery View */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {entries.map((entry) => (
          <div 
            key={entry.id} 
            className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl overflow-hidden hover:scale-105 transition-transform duration-200 shadow-xl"
          >
            {/* Image Area */}
            <div className="h-40 w-full relative">
              <img 
                src={images[entry.id]} 
                alt={entry.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1">
                <Star size={12} className="text-yellow-400 fill-yellow-400" />
                <span className="text-xs font-bold">{entry.review_score || "-"}</span>
              </div>
            </div>

            {/* Content Area */}
            <div className="p-4 space-y-2">
              <h3 className="font-bold text-lg leading-tight line-clamp-1" title={entry.name}>
                {entry.name}
              </h3>
              
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded-full font-medium">
                  {entry.entry_type}
                </span>
                {entry.year_completed && (
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {entry.year_completed}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;