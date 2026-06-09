import { motion } from "framer-motion";
import { Star, Calendar, RotateCcw, Captions, Trophy, Clock } from "lucide-react";
import type { MediaEntry } from "../lib/db";
import { DEFAULT_COVER_IMAGE, useImageUrl } from "../lib/utils";
import { cn } from "../lib/utils_ui";
import { getTypeBadgeStyle, getRatingColor, parseGenres } from "./MediaCard";
import { formatDate } from "../lib/dates";

const cardLiftTransition = {
  type: "spring",
  stiffness: 380,
  damping: 26,
} as const;

interface MediaListCardProps {
  entry: MediaEntry;
  onClick?: (entry: MediaEntry) => void;
  index?: number;
}

/**
 * Compact horizontal "ambient blur" card for the dashboard vertical lists.
 * A crisp cover sits on the left while the same image bleeds across the card
 * as a soft blurred wash that fades into the surface — no hard box edges.
 */
export function MediaListCard({ entry, onClick, index = 0 }: MediaListCardProps) {
  const imgSrc = useImageUrl(entry.image_url, "");
  const typeBadge = getTypeBadgeStyle(entry.entry_type);
  const genres = parseGenres(entry.genre).slice(0, 2);
  const hasScore = entry.review_score !== null && entry.review_score !== undefined;

  const isGameEntry = (entry.entry_type || "").toLowerCase().includes("game");
  const hasPlatinum = isGameEntry && entry.is_platinum === 1;
  const isEarlyAccess = isGameEntry && entry.is_early_access === 1;
  const isRewatch = entry.is_rewatch === 1;
  const hasSubtitles = entry.has_subtitles === 1;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={cardLiftTransition}
      onClick={() => onClick?.(entry)}
      className="media-list-card"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      {/* Ambient blurred wash of the cover, fading out across the card */}
      <div
        className="media-list-card-blur"
        style={{ backgroundImage: imgSrc ? `url("${imgSrc}")` : undefined }}
      />
      <div className="media-list-card-overlay" />

      {/* Cover thumbnail — uniform left section, image zoomed to fill (cover + center) */}
      <img
        src={imgSrc || DEFAULT_COVER_IMAGE}
        alt={entry.name}
        loading="lazy"
        onError={(event) => { event.currentTarget.src = DEFAULT_COVER_IMAGE; }}
        className="media-list-card-thumb"
      />

      {/* Content */}
      <div className="media-list-card-body">
        {/* Line 1: name + rating */}
        <div className="flex items-center gap-2">
          <h4 className="flex-1 min-w-0 truncate font-semibold text-sm text-gray-100">
            {entry.name}
          </h4>
          {hasScore && (
            <span
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm shrink-0",
                getRatingColor(entry.review_score)
              )}
            >
              <Star size={9} className="fill-current" />
              {entry.review_score!.toFixed(1)}
            </span>
          )}
        </div>

        {/* Line 2: type badge + genres + status */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] text-white font-semibold shadow-sm",
              typeBadge.bg
            )}
          >
            {typeBadge.icon}
            <span>{entry.entry_type}</span>
          </span>
          {genres.map((g, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 bg-white/10 rounded text-[9px] text-gray-300 font-medium"
            >
              {g}
            </span>
          ))}
          {hasPlatinum && (
            <span
              className="w-4 h-4 rounded-full bg-gradient-to-br from-amber-400/30 to-cyan-400/30 border border-cyan-300 flex items-center justify-center"
              title="Platinum / 100%"
            >
              <Trophy size={9} className="text-cyan-100" />
            </span>
          )}
          {isRewatch && (
            <span
              className="w-4 h-4 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center"
              title="Replay / Rewatch"
            >
              <RotateCcw size={9} className="text-amber-500" />
            </span>
          )}
          {hasSubtitles && (
            <span
              className="w-4 h-4 rounded-full bg-orange-500/20 border border-orange-500 flex items-center justify-center"
              title="Subtitles"
            >
              <Captions size={9} className="text-orange-400" />
            </span>
          )}
          {isEarlyAccess && (
            <span
              className="w-4 h-4 rounded-full bg-violet-500/20 border border-violet-500 flex items-center justify-center"
              title={`Early Access${entry.early_access_version ? `: ${entry.early_access_version}` : ""}`}
            >
              <Clock size={9} className="text-violet-400" />
            </span>
          )}
        </div>

        {/* Line 3: date */}
        {entry.completion_date && (
          <div className="flex items-center gap-1 text-[10px] text-gray-400">
            <Calendar size={10} />
            <span>{formatDate(entry.completion_date)}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
