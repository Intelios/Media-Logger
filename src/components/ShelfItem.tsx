import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Star,
  Gamepad2,
  Film,
  Tv,
  MonitorPlay,
  BookOpen,
  Disc3,
  Heart,
  Monitor,
  Trophy,
  RotateCcw,
  Check,
  Calendar,
  Clock,
} from "lucide-react";
import { getImageUrl, DEFAULT_COVER_IMAGE } from "../lib/utils";
import type { MediaEntry } from "../lib/db";

interface ShelfItemProps {
  entry: MediaEntry;
  rotation?: number;
  onClick?: (entry: MediaEntry) => void;
}

const getRatingColor = (score: number | null) => {
  if (!score && score !== 0) return "bg-gray-700/90 text-gray-300";
  if (score >= 9) return "bg-emerald-500 text-white";
  if (score >= 7) return "bg-blue-500 text-white";
  if (score >= 5) return "bg-yellow-500 text-white";
  return "bg-red-500 text-white";
};

const getTypeBadgeStyle = (type: string | null) => {
  const t = (type || "").toLowerCase();
  if (t.includes("album"))
    return { bg: "bg-emerald-600", icon: <Disc3 size={10} /> };
  if (t.includes("game"))
    return { bg: "bg-purple-600", icon: <Gamepad2 size={10} /> };
  if (t.includes("anime"))
    return { bg: "bg-pink-500", icon: <MonitorPlay size={10} /> };
  if (t.includes("k-drama"))
    return { bg: "bg-teal-600", icon: <Tv size={10} /> };
  if (t.includes("movie"))
    return { bg: "bg-blue-600", icon: <Film size={10} /> };
  if (t.includes("show"))
    return { bg: "bg-cyan-600", icon: <Tv size={10} /> };
  if (t.includes("book"))
    return { bg: "bg-amber-600", icon: <BookOpen size={10} /> };
  if (t.includes("jav") || t.includes("hentai"))
    return { bg: "bg-rose-600", icon: <Heart size={10} /> };
  if (t.includes("visual novel"))
    return { bg: "bg-indigo-600", icon: <Monitor size={10} /> };
  return { bg: "bg-gray-600", icon: <MonitorPlay size={10} /> };
};

const formatDate = (dateString: string | null): string => {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleString("en-US", { month: "short" });
    const year = date.getFullYear();
    const suffix = (d: number) => {
      if (d > 3 && d < 21) return "th";
      switch (d % 10) {
        case 1:
          return "st";
        case 2:
          return "nd";
        case 3:
          return "rd";
        default:
          return "th";
      }
    };
    return `${day}${suffix(day)} ${month} ${year}`;
  } catch {
    return dateString;
  }
};

const parseGenres = (genre: string | null): string[] => {
  if (!genre) return [];
  return genre
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g.length > 0);
};

function useTooltipPosition(itemRef: React.RefObject<HTMLDivElement | null>, active: boolean) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!active || !itemRef.current) return;

    const update = () => {
      if (!itemRef.current) return;
      const rect = itemRef.current.getBoundingClientRect();
      setPos({
        top: rect.top - 10,
        left: rect.left + rect.width / 2,
      });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [active, itemRef]);

  return pos;
}

export function ShelfItem({ entry, rotation = 0, onClick }: ShelfItemProps) {
  const [imgSrc, setImgSrc] = useState(DEFAULT_COVER_IMAGE);
  const [hovered, setHovered] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const pos = useTooltipPosition(itemRef, hovered);

  useEffect(() => {
    getImageUrl(entry.image_url).then(setImgSrc);
  }, [entry.image_url]);

  const isGame = (entry.entry_type || "").toLowerCase().includes("game");
  const hasPlatinum = isGame && entry.is_platinum === 1;
  const isEarlyAccess = isGame && entry.is_early_access === 1;
  const isRewatch = entry.is_rewatch === 1;
  const hasLocalCopy = entry.own_local_copy === 1;
  const typeBadge = getTypeBadgeStyle(entry.entry_type);
  const genres = parseGenres(entry.genre);
  const completionDate = formatDate(entry.completion_date);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(entry);
    }
  };

  const tooltipContent = (
    <div
      className="shelf-item-tooltip-portal"
      style={{ top: pos.top, left: pos.left }}
    >
      {/* Title */}
      <div className="shelf-item-tooltip-title">{entry.name}</div>

      {/* Meta row: type + score */}
      <div className="shelf-item-tooltip-meta">
        <span
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] text-white font-semibold ${typeBadge.bg}`}
        >
          {typeBadge.icon}
          {entry.entry_type}
        </span>
        {entry.review_score !== null && entry.review_score !== undefined && (
          <span
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${getRatingColor(
              entry.review_score
            )}`}
          >
            <Star size={9} className="fill-current" />
            {entry.review_score.toFixed(1)}
          </span>
        )}
      </div>

      {/* Genre tags */}
      {genres.length > 0 && (
        <div className="shelf-item-tooltip-genres">
          {genres.slice(0, 4).map((g, i) => (
            <span key={i} className="shelf-item-tooltip-genre-tag">
              {g}
            </span>
          ))}
          {genres.length > 4 && (
            <span className="shelf-item-tooltip-genre-more">
              +{genres.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Completion date */}
      {completionDate && (
        <div className="shelf-item-tooltip-date">
          <Calendar size={10} />
          <span>{completionDate}</span>
        </div>
      )}

      {/* Status badges */}
      <div className="shelf-item-tooltip-badges">
        {hasPlatinum && (
          <span className="flex items-center gap-1 text-[9px] text-cyan-300 font-semibold">
            <Trophy size={9} />
            Platinum
          </span>
        )}
        {isEarlyAccess && (
          <span className="flex items-center gap-1 text-[9px] text-violet-400 font-semibold">
            <Clock size={9} />
            Early Access{entry.early_access_version ? ` (${entry.early_access_version})` : ''}
          </span>
        )}
        {isRewatch && (
          <span className="flex items-center gap-1 text-[9px] text-amber-400 font-semibold">
            <RotateCcw size={9} />
            Replay
          </span>
        )}
        {hasLocalCopy && (
          <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-semibold">
            <Check size={9} />
            Owned
          </span>
        )}
      </div>
    </div>
  );

  return (
    <>
      {hovered && createPortal(tooltipContent, document.body)}

      <div
        ref={itemRef}
        className={`shelf-item ${hasPlatinum ? "shelf-item-platinum" : ""}`}
        style={{ "--rotation": `${rotation}deg` } as React.CSSProperties}
        onClick={() => onClick?.(entry)}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        role="button"
        tabIndex={0}
        aria-label={`${entry.name}, ${entry.entry_type || "Unknown type"}${
          entry.review_score !== null && entry.review_score !== undefined
            ? `, ${entry.review_score}/10`
            : ""
        }`}
      >
        {/* Cover */}
        <div className="shelf-item-cover">
          <img
            src={imgSrc}
            alt=""
            loading="lazy"
            onError={() => setImgSrc(DEFAULT_COVER_IMAGE)}
          />

          {/* Rating badge */}
          {entry.review_score !== null &&
            entry.review_score !== undefined && (
              <div
                className={`shelf-item-rating ${getRatingColor(
                  entry.review_score
                )}`}
              >
                <Star size={9} className="fill-current" />
                <span>{entry.review_score.toFixed(1)}</span>
              </div>
            )}

          {/* Platinum mini badge */}
          {hasPlatinum && (
            <div className="shelf-item-platinum-badge">
              <Trophy size={10} />
            </div>
          )}
        </div>

        {/* Case thickness */}
        <div className="shelf-item-thickness" />
      </div>
    </>
  );
}
