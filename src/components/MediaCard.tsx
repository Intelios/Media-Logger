import { useState, useEffect } from "react";
import { Star, Calendar, MonitorPlay, Book, Music, Gamepad2, Film, Tv, Video } from "lucide-react";
import { getImageUrl } from "../lib/utils";
import type { MediaEntry } from "../lib/db";
import { cn } from "../lib/utils_ui";

// Helper to pick icons based on entry type
const getTypeIcon = (type: string | null) => {
  const t = (type || "").toLowerCase();
  if (t.includes("game")) return <Gamepad2 size={12} />;
  if (t.includes("book")) return <Book size={12} />;
  if (t.includes("album")) return <Music size={12} />;
  if (t.includes("movie")) return <Film size={12} />;
  if (t.includes("show") || t.includes("drama")) return <Tv size={12} />;
  return <MonitorPlay size={12} />;
};

// Helper for rating colors (matching your Flet theme)
const getRatingColor = (score: number | null) => {
  if (!score) return "bg-gray-700 text-gray-300";
  if (score >= 9) return "bg-green-600 text-white";
  if (score >= 7) return "bg-blue-600 text-white";
  if (score >= 5) return "bg-yellow-600 text-white";
  return "bg-red-600 text-white";
};

export function MediaCard({ entry }: { entry: MediaEntry }) {
  const [imgSrc, setImgSrc] = useState("");

  useEffect(() => {
    getImageUrl(entry.image_url).then(setImgSrc);
  }, [entry.image_url]);

  return (
    <div className="group relative bg-white/5 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden hover:scale-105 hover:shadow-2xl hover:border-primary/50 transition-all duration-300 cursor-pointer">
      
      {/* Image Container */}
      <div className="h-40 w-full relative overflow-hidden">
        <img 
          src={imgSrc} 
          alt={entry.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          loading="lazy"
        />
        
        {/* Top Right: Rating Badge */}
        {entry.review_score && (
          <div className={cn(
            "absolute top-2 right-2 px-2 py-1 rounded-full flex items-center gap-1 text-xs font-bold shadow-lg",
            getRatingColor(entry.review_score)
          )}>
            <Star size={10} className="fill-current" />
            <span>{entry.review_score}</span>
          </div>
        )}
      </div>

      {/* Content Container */}
      <div className="p-3 flex flex-col gap-2">
        <h3 className="font-bold text-sm leading-tight line-clamp-2 text-gray-100 group-hover:text-primary transition-colors">
          {entry.name}
        </h3>

        <div className="flex items-center justify-between mt-auto">
          {/* Entry Type Badge */}
          <div className="flex items-center gap-1 px-2 py-0.5 bg-white/10 rounded-md text-[10px] text-gray-300 uppercase tracking-wider font-semibold">
            {getTypeIcon(entry.entry_type)}
            <span>{entry.entry_type}</span>
          </div>

          {/* Date */}
          {entry.year_completed && (
            <div className="flex items-center gap-1 text-[10px] text-gray-500">
              <Calendar size={10} />
              <span>{entry.year_completed}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}