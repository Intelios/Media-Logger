import * as React from "react";
import { Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Star, Calendar, MoreVertical, Monitor, Disc3, BookOpen, Gamepad2, Film, Heart, RotateCcw, Check, Pencil, Trash2, Trophy, FileText, Image as ImageIcon, Copy, CopyPlus, Clock, Captions } from "lucide-react";
import { DEFAULT_COVER_IMAGE, useImageSource, useCoverReveal, useNearViewport } from "../lib/utils";
import type { MediaEntry } from "../lib/db";
import { cn } from "../lib/utils_ui";
import { getRatingDisplayMode } from "../lib/settings";
import { formatDate } from "../lib/dates";
import { formatCardRating, getRatingColor, getTypeBadgeStyle, parseGenres } from "../lib/media-config";
import { useHoverTooltip } from "./HoverTooltip";
import type { MediaCardDialogKind } from "./MediaCardDialogs";

const loadMediaCardDialogs = () => import("./MediaCardDialogs");
const LazyMediaCardDialogs = React.lazy(loadMediaCardDialogs);

// Get context info based on entry type - returns an array for entries with multiple fields
// profileType maps to the profile system's type key (null means no profile possible)
const getContextInfo = (entry: MediaEntry): { label: string; value: string; icon: React.ReactNode; profileType: string | null; badgeClass?: string }[] => {
  const type = (entry.entry_type || "").toLowerCase();
  const items: { label: string; value: string; icon: React.ReactNode; profileType: string | null; badgeClass?: string }[] = [];

  if (type.includes("album") && entry.artist) {
    items.push({ label: "Artist", value: entry.artist, icon: <Disc3 size={12} />, profileType: "artist" });
  }
  if (type.includes("book") && entry.author) {
    items.push({ label: "Author", value: entry.author, icon: <BookOpen size={12} />, profileType: "author" });
  }
  if (type.includes("game") && entry.platform) {
    items.push({ label: "Platform", value: entry.platform, icon: <Gamepad2 size={12} />, profileType: "platform" });
  }
  if (type.includes("jav") || type.includes("hentai")) {
    if (entry.actress) {
      items.push({ label: "Actress", value: entry.actress, icon: <Heart size={12} />, profileType: "actress" });
    }
    if (entry.director) {
      items.push({ label: "Director/Studio", value: entry.director, icon: <Film size={12} />, profileType: "director" });
    }
  }
  if (type.includes("visual novel")) {
    if (entry.is_completed === 1) {
      items.push({ label: "Status", value: "Completed", icon: <Check size={12} className="text-emerald-400" />, profileType: null, badgeClass: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" });
    } else if (entry.update_version) {
      items.push({ label: "Version", value: entry.update_version, icon: <Monitor size={12} />, profileType: null });
    }
  }
  return items;
};

// Check if entry is a perfect 10
const isPerfectTen = (score: number | null | undefined): boolean => {
  return score === 10;
};

const cardLiftTransition = {
  type: "spring",
  stiffness: 380,
  damping: 26,
} as const;

// Award type for badges
export interface MediaAward {
  categoryName: string;
  year: number;
}

interface MediaCardProps {
  entry: MediaEntry;
  awards?: MediaAward[];
  profileKeys?: Set<string>;
  onEdit?: (entry: MediaEntry) => void;
  onDelete?: (id: number) => void;
  onDuplicate?: (entry: MediaEntry) => void;
  // Date footer emphasis. 'default' is the quiet gray footer used everywhere;
  // 'prominent' is an opt-in loud footer (used on the Profiles page, where the
  // date is what you're scanning for). Accent classes tint it to the context —
  // e.g. the profile's own accent color.
  dateEmphasis?: 'default' | 'prominent';
  dateAccentClass?: string; // text color, e.g. "text-blue-400"
  dateTintClass?: string;   // gradient bg, e.g. "from-blue-500/12 to-cyan-500/6"
}

function MediaCardDialogFallback() {
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>,
    document.body
  );
}

export const MediaCard = React.memo(function MediaCard({ entry, onEdit, onDelete, onDuplicate, awards = [], profileKeys, dateEmphasis = 'default', dateAccentClass, dateTintClass }: MediaCardProps) {
  const navigate = useNavigate();
  const { bindTooltip } = useHoverTooltip();
  const { ref: viewportRef, isNearViewport } = useNearViewport<HTMLDivElement>();
  const { src: imgSrc, status: imgStatus } = useImageSource(entry.image_url, {
    enabled: isNearViewport,
    variant: 'thumbnail',
  });
  // Reveal the cover with a fade once it has actually loaded; cached/remote
  // images (status already 'ready' on mount) skip the skeleton entirely.
  const { revealed: coverRevealed, reveal: revealCover, attachImg: coverImgRef } = useCoverReveal(imgSrc, imgStatus);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState<MediaCardDialogKind | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuDropdownRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const typeBadge = getTypeBadgeStyle(entry.entry_type);
  const contextInfo = getContextInfo(entry);
  const perfectTen = isPerfectTen(entry.review_score);
  const hasAwards = awards.length > 0;
  const genres = parseGenres(entry.genre);
  const isGameEntry = (entry.entry_type || "").toLowerCase().includes("game");
  const hasPlatinum = isGameEntry && entry.is_platinum === 1;
  const isEarlyAccess = isGameEntry && entry.is_early_access === 1;
  const ratingDisplayMode = getRatingDisplayMode();

  // Check boolean flags (stored as 0/1 in SQLite)
  const isRewatch = entry.is_rewatch === 1;
  const hasLocalCopy = entry.own_local_copy === 1;
  const hasSubtitles = entry.has_subtitles === 1;
  // The 2px platinum/perfect border curves at 14px on its inside (16px outer - 2px width);
  // the image must match that inner curve or a dark sliver shows at the top corners
  const imageTopRadius = hasPlatinum || perfectTen ? "rounded-t-[14px]" : "rounded-t-2xl";
  const elevationShadow = hasPlatinum
    ? "0 30px 60px rgba(0, 0, 0, 0.42), 0 12px 26px rgba(8, 47, 73, 0.28), 0 0 54px rgba(34, 211, 238, 0.22), 0 0 84px rgba(245, 158, 11, 0.14)"
    : perfectTen
      ? "0 30px 60px rgba(0, 0, 0, 0.42), 0 12px 26px rgba(6, 78, 59, 0.26), 0 0 58px rgba(52, 211, 153, 0.22)"
      : "0 26px 54px rgba(0, 0, 0, 0.38), 0 10px 22px rgba(0, 0, 0, 0.24), 0 0 36px color-mix(in srgb, var(--color-primary) 18%, transparent)";

  // Click outside to close menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const insideButton = menuRef.current?.contains(e.target as Node);
      const insideDropdown = menuDropdownRef.current?.contains(e.target as Node);
      if (!insideButton && !insideDropdown) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!menuOpen && menuButtonRef.current) {
      void loadMediaCardDialogs();
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setMenuOpen(!menuOpen);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onEdit?.(entry);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setActiveDialog("delete");
  };

  const confirmDelete = () => {
    if (entry.id) {
      onDelete?.(entry.id);
    }
  };

  const handleViewDescription = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setActiveDialog("details");
  };

  const handleViewImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setActiveDialog("image");
  };

  const handleFindDuplicates = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setActiveDialog("duplicates");
  };

  return (
    <>
      <motion.div
        ref={viewportRef}
        whileHover={{ y: -6, scale: 1.02 }}
        transition={cardLiftTransition}
        className={cn(
          "group relative overflow-visible bg-surface/80 backdrop-blur-md rounded-2xl transition-[box-shadow,border-color,background-color] duration-300 ease-out cursor-pointer",
          hasPlatinum
            ? "border-2 border-cyan-300 hover:border-cyan-200"
            : perfectTen
              ? "border-2 border-emerald-400 hover:border-emerald-300"
              : "border border-white/10 hover:shadow-2xl hover:shadow-primary/20 hover:border-primary/40"
        )}
      >
        {/* Dedicated glow element behind the card (avoids backdrop-blur destroying box-shadow) */}
        {(hasPlatinum || perfectTen) && (
          <div
            className={cn(
              "absolute -inset-[3px] rounded-[20px] -z-10 pointer-events-none",
              hasPlatinum && "animate-platinum-glow",
              perfectTen && "animate-perfect-glow"
            )}
          />
        )}

        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100"
          style={{ boxShadow: elevationShadow }}
        />

        {/* Image + Thermometer Wrapper */}
        <div className="relative">
          {/* Image Container */}
          <div
            className={cn("h-52 w-full relative overflow-hidden", imageTopRadius)}
            style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
          >
            {(imgStatus === 'loading' || !coverRevealed) && (
              <div className={cn("cover-skeleton absolute inset-0", imageTopRadius)} aria-hidden="true" />
            )}
            {imgStatus !== 'loading' && (
              <img
                ref={coverImgRef}
                src={imgSrc || DEFAULT_COVER_IMAGE}
                alt={entry.name}
                className={cn(
                  "w-full h-full object-cover transition duration-500 group-hover:scale-110",
                  imageTopRadius,
                  coverRevealed ? "opacity-100" : "opacity-0"
                )}
                onLoad={revealCover}
                onError={(event) => { event.currentTarget.src = DEFAULT_COVER_IMAGE; revealCover(); }}
              />
            )}

            {/* Gradient Overlay */}
            <div className={cn("absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300", imageTopRadius)} />

            {/* Platinum Badge */}
            {hasPlatinum && (
              <div
                {...bindTooltip(
                  <span className="text-xs font-medium text-cyan-200">Platinum / 100% Completed</span>,
                  {
                    width: "content",
                    className: "rounded-lg px-3 py-1.5 whitespace-nowrap",
                    style: { borderColor: "color-mix(in srgb, #67e8f9 40%, var(--color-border))" },
                  }
                )}
                className="absolute top-2 left-2 z-20"
              >
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-amber-400/95 via-yellow-300/95 to-cyan-300/95 rounded-full shadow-lg shadow-cyan-500/25 border border-white/30">
                  <Trophy size={12} className="text-slate-900" />
                  <span className="text-[10px] font-black tracking-wide text-slate-900">PLATINUM 100%</span>
                </div>
              </div>
            )}

            {/* Top Right: Action Menu */}
            <div className="absolute top-2 right-2 z-20" ref={menuRef}>
              <button
                ref={menuButtonRef}
                onClick={handleMenuClick}
                className={cn(
                  "p-1.5 bg-black/50 backdrop-blur-sm rounded-full transition-all hover:bg-black/70",
                  menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
              >
                <MoreVertical size={16} className="text-white" />
              </button>
            </div>

            {/* Rating Pill */}
            {(entry.review_score !== null && entry.review_score !== undefined) && ratingDisplayMode === 'pill' && (
              <div className={cn(
                "absolute top-2 px-2.5 py-1 rounded-full flex items-center gap-1 text-xs font-bold shadow-lg transition-all duration-300",
                "right-2 group-hover:right-11",
                getRatingColor(entry.review_score)
              )}>
                <Star size={11} className="fill-current" />
                <span>{formatCardRating(entry.review_score)}</span>
              </div>
            )}

            {/* Rating Vertical Pill */}
            {(entry.review_score !== null && entry.review_score !== undefined) && ratingDisplayMode === 'vertical-pill' && (
              <div className={cn(
                "absolute top-2 px-2 py-1.5 rounded-full flex flex-col items-center justify-center gap-0.5 text-xs font-bold shadow-lg transition-all duration-300 z-20",
                "right-2 group-hover:right-11",
                getRatingColor(entry.review_score)
              )}>
                <Star size={11} className="fill-current" />
                <span>{formatCardRating(entry.review_score)}</span>
              </div>
            )}

            {/* Award Badge */}
            {hasAwards && (
              <div
                {...bindTooltip(
                  <div>
                  <div className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                    <Trophy size={12} />
                    <span>Awards Won</span>
                  </div>
                  <ul className="space-y-1">
                    {awards.map((award, i) => (
                      <li key={i} className="text-xs text-gray-200">
                        {award.categoryName}
                        <span className="text-amber-400/70 ml-1">({award.year})</span>
                      </li>
                    ))}
                  </ul>
                  </div>,
                  {
                    width: 192,
                    className: "rounded-xl p-3",
                    style: { borderColor: "color-mix(in srgb, #f59e0b 30%, var(--color-border))" },
                  }
                )}
                className="absolute bottom-2 left-2 z-20"
              >
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full shadow-lg shadow-amber-500/30 cursor-pointer">
                  <Trophy size={14} className="text-white fill-white/20" />
                  {awards.length > 1 && (
                    <span className="text-xs font-bold text-white">{awards.length}</span>
                  )}
                </div>
              </div>
            )}
        </div>

        {/* Thermometer - sits at the image/card junction so the bulb can hang below */}
        {(entry.review_score !== null && entry.review_score !== undefined) && ratingDisplayMode === 'thermometer' && (
          <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center">
            <div className="w-full h-1 bg-black/50 rounded-full relative overflow-visible">
              <div
                className={cn("h-full rounded-full relative", getRatingColor(entry.review_score))}
                style={{ width: `${(entry.review_score / 10) * 100}%` }}
              >
                <div className={cn(
                  "absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center min-w-[26px] h-4 px-1 rounded-full shadow-md border border-white/20 text-[9px] font-bold",
                  entry.review_score >= 10 ? "translate-x-0" : "translate-x-1/2",
                  getRatingColor(entry.review_score)
                )}>
                  {formatCardRating(entry.review_score)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dropdown Menu - rendered via Portal */}
        {menuOpen && createPortal(
          <div
            ref={menuDropdownRef}
            className="fixed w-44 rounded-xl border border-white/20 bg-transparent backdrop-blur-2xl shadow-2xl shadow-black/45 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-[200]"
            style={{
              top: menuPosition.top,
              right: menuPosition.right,
              background: "color-mix(in srgb, var(--color-surface) 42%, transparent)",
              backdropFilter: "blur(24px) saturate(170%)",
              WebkitBackdropFilter: "blur(24px) saturate(170%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleViewDescription}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-200 hover:bg-purple-500/20 hover:text-purple-400 transition-colors"
            >
              <FileText size={14} />
              <span>View Details</span>
            </button>
            <div className="h-px bg-white/10" />
            <button
              onClick={handleViewImage}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-200 hover:bg-blue-500/20 hover:text-blue-400 transition-colors"
            >
              <ImageIcon size={14} />
              <span>View Image</span>
            </button>
            <div className="h-px bg-white/10" />
            <button
              onClick={handleEdit}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-200 hover:bg-[color-mix(in_srgb,var(--color-primary)_20%,transparent)] hover:text-primary transition-colors"
            >
              <Pencil size={14} />
              <span>Edit</span>
            </button>
            <div className="h-px bg-white/10" />
            <button
              onClick={handleFindDuplicates}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-200 hover:bg-amber-500/20 hover:text-amber-400 transition-colors"
            >
              <Copy size={14} />
              <span>Find Duplicates</span>
            </button>
            <div className="h-px bg-white/10" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDuplicate?.(entry);
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-200 hover:bg-green-500/20 hover:text-green-400 transition-colors"
            >
              <CopyPlus size={14} />
              <span>Duplicate</span>
            </button>
            <div className="h-px bg-white/10" />
            <button
              onClick={handleDelete}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-400 hover:bg-red-500/15 transition-colors"
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
          </div>,
          document.body
        )}

        {/* Content Container */}
        <div className="p-3.5 flex flex-col gap-2">
          {/* Title */}
          <h3 className="font-bold text-base leading-tight line-clamp-2 text-gray-100 group-hover:text-primary transition-colors">
            {entry.name}
          </h3>

          {/* Early Access Subtitle */}
          {isEarlyAccess && (
            <p className="text-[11px] text-violet-400/80 font-medium leading-tight">
              Early Access{entry.early_access_version ? `: ${entry.early_access_version}` : ''}
            </p>
          )}

          {/* Type Badge Row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] text-white font-semibold shadow-md",
              typeBadge.bg
            )}>
              {typeBadge.icon}
              <span>{entry.entry_type}</span>
            </div>
          </div>

          {/* Context Info (Artist/Platform/Author/Actress/Director) */}
          {contextInfo.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {contextInfo.map((info, infoIdx) => (
                <div key={infoIdx} className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-gray-500">{info.icon}</span>
                  {/* Split comma-separated values (like actresses) into individual tags */}
                  {info.value.split(',').map((item, i) => {
                    const trimmed = item.trim();
                    const hasProfile = info.profileType && profileKeys?.has(`${info.profileType}:${trimmed}`);
                    return (
                      <span
                        key={i}
                        onClick={hasProfile ? (e) => {
                          e.stopPropagation();
                          const params = new URLSearchParams({
                            type: info.profileType!,
                            name: trimmed,
                          });
                          if (entry.year_completed) params.set('fromYear', String(entry.year_completed));
                          if (entry.id) params.set('fromEntry', String(entry.id));
                          if (entry.entry_type) params.set('fromType', entry.entry_type);
                          navigate(`/profiles?${params.toString()}`);
                        } : undefined}
                        className={cn(
                          "px-2 py-0.5 rounded-lg text-[11px]",
                          info.badgeClass || (hasProfile
                            ? "bg-white/5 text-gray-300 hover:bg-primary/20 hover:text-primary cursor-pointer transition-colors"
                            : "bg-white/5 text-gray-300"
                          )
                        )}
                      >
                        {trimmed}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Genre Tags */}
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {genres.slice(0, 3).map((genre, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] text-gray-300 font-medium"
                >
                  {genre}
                </span>
              ))}
              {genres.length > 3 && (
                <div
                  {...bindTooltip(
                    <div>
                      <div className="text-xs font-semibold text-text-muted mb-2">More Genres</div>
                      <div className="flex flex-wrap gap-1.5">
                        {genres.slice(3).map((genre, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 bg-primary/10 rounded-md text-[10px] text-text font-medium"
                          >
                            {genre}
                          </span>
                        ))}
                      </div>
                    </div>,
                    { width: "content", className: "min-w-[120px] rounded-xl p-3" }
                  )}
                >
                  <span className="px-2 py-0.5 bg-white/5 rounded-md text-[10px] text-gray-500 font-medium cursor-pointer hover:bg-white/10 hover:text-gray-300 transition-colors">
                    +{genres.length - 3}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Rewatch / Local Copy / Subtitles / Early Access / Platinum Badges */}
          {(isRewatch || hasLocalCopy || hasSubtitles || hasPlatinum || isEarlyAccess) && (
            <div className="flex items-center gap-1.5">
              {isRewatch && (
                <div
                  {...bindTooltip(
                    <span className="text-xs font-medium text-amber-400">Replay / Rewatch</span>,
                    {
                      width: "content",
                      className: "rounded-lg px-3 py-1.5 whitespace-nowrap",
                      style: { borderColor: "color-mix(in srgb, #f59e0b 30%, var(--color-border))" },
                    }
                  )}
                >
                  <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center cursor-pointer">
                    <RotateCcw size={12} className="text-amber-500" />
                  </div>
                </div>
              )}
              {hasLocalCopy && (
                <div
                  {...bindTooltip(
                    <span className="text-xs font-medium text-emerald-400">Own Local Copy</span>,
                    {
                      width: "content",
                      className: "rounded-lg px-3 py-1.5 whitespace-nowrap",
                      style: { borderColor: "color-mix(in srgb, #10b981 30%, var(--color-border))" },
                    }
                  )}
                >
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center cursor-pointer">
                    <Check size={12} className="text-emerald-500" />
                  </div>
                </div>
              )}
              {hasSubtitles && (
                <div
                  {...bindTooltip(
                    <span className="text-xs font-medium text-orange-400">Subtitles</span>,
                    {
                      width: "content",
                      className: "rounded-lg px-3 py-1.5 whitespace-nowrap",
                      style: { borderColor: "color-mix(in srgb, #f97316 30%, var(--color-border))" },
                    }
                  )}
                >
                  <div className="w-7 h-7 rounded-full bg-orange-500/20 border border-orange-500 flex items-center justify-center cursor-pointer">
                    <Captions size={12} className="text-orange-400" />
                  </div>
                </div>
              )}
              {isEarlyAccess && (
                <div
                  {...bindTooltip(
                    <span className="text-xs font-medium text-violet-400">
                      Early Access{entry.early_access_version ? `: ${entry.early_access_version}` : ''}
                    </span>,
                    {
                      width: "content",
                      className: "rounded-lg px-3 py-1.5 whitespace-nowrap",
                      style: { borderColor: "color-mix(in srgb, #8b5cf6 30%, var(--color-border))" },
                    }
                  )}
                >
                  <div className="w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500 flex items-center justify-center cursor-pointer">
                    <Clock size={12} className="text-violet-400" />
                  </div>
                </div>
              )}
              {hasPlatinum && (
                <div
                  {...bindTooltip(
                    <span className="text-xs font-medium text-cyan-200">Platinum / 100%</span>,
                    {
                      width: "content",
                      className: "rounded-lg px-3 py-1.5 whitespace-nowrap",
                      style: { borderColor: "color-mix(in srgb, #67e8f9 40%, var(--color-border))" },
                    }
                  )}
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400/30 to-cyan-400/30 border border-cyan-300 flex items-center justify-center cursor-pointer">
                    <Trophy size={12} className="text-cyan-100" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Date */}
          {entry.completion_date && (
            dateEmphasis === 'prominent' ? (
              /* Loud footer — opt-in (Profiles page). Bigger, semibold, and
                 tinted with the context's accent so the date reads at a glance. */
              <div className="mt-auto pt-2 border-t border-white/5">
                <div className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 bg-gradient-to-r",
                  dateTintClass || "from-primary/15 to-primary/5"
                )}>
                  <Calendar size={12} className={dateAccentClass || "text-primary"} />
                  <span className={cn("text-xs font-semibold tabular-nums", dateAccentClass || "text-primary")}>
                    {formatDate(entry.completion_date)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mt-auto pt-2 border-t border-white/5">
                <Calendar size={11} />
                <span>{formatDate(entry.completion_date)}</span>
              </div>
            )
          )}
        </div>

      </motion.div>
      {activeDialog && (
        <Suspense fallback={<MediaCardDialogFallback />}>
          <LazyMediaCardDialogs
            dialog={activeDialog}
            entry={entry}
            onClose={() => setActiveDialog(null)}
            onConfirmDelete={confirmDelete}
          />
        </Suspense>
      )}
    </>
  );
});
