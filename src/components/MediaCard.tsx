import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Star, Calendar, MoreVertical, Monitor, Disc3, BookOpen, Gamepad2, Film, Tv, MonitorPlay, Heart, RotateCcw, Check, Pencil, Trash2, Trophy, FileText, StickyNote, X, Image as ImageIcon, Copy, CopyPlus, Clock, Captions } from "lucide-react";
import { DEFAULT_COVER_IMAGE, useImageUrl } from "../lib/utils";
import { dbService, type MediaEntry } from "../lib/db";
import { cn } from "../lib/utils_ui";
import { getRatingDisplayMode } from "../lib/settings";
import { formatDate } from "../lib/dates";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";

// Type badge colors matching Flet version
export const getTypeBadgeStyle = (type: string | null) => {
  const t = (type || "").toLowerCase();
  if (t.includes("album")) return { bg: "bg-emerald-600", icon: <Disc3 size={12} /> };
  if (t.includes("game")) return { bg: "bg-purple-600", icon: <Gamepad2 size={12} /> };
  if (t.includes("anime")) return { bg: "bg-pink-500", icon: <MonitorPlay size={12} /> };
  if (t.includes("k-drama")) return { bg: "bg-teal-600", icon: <Tv size={12} /> };
  if (t.includes("movie")) return { bg: "bg-blue-600", icon: <Film size={12} /> };
  if (t.includes("show")) return { bg: "bg-cyan-600", icon: <Tv size={12} /> };
  if (t.includes("book")) return { bg: "bg-amber-600", icon: <BookOpen size={12} /> };
  if (t.includes("jav") || t.includes("hentai")) return { bg: "bg-rose-600", icon: <Heart size={12} /> };
  if (t.includes("visual novel")) return { bg: "bg-indigo-600", icon: <Monitor size={12} /> };
  return { bg: "bg-gray-600", icon: <MonitorPlay size={12} /> };
};

// Rating badge colors
export const getRatingColor = (score: number | null) => {
  if (!score && score !== 0) return "bg-gray-700/80 text-gray-300";
  if (score >= 9) return "bg-emerald-500 text-white";
  if (score >= 7) return "bg-blue-500 text-white";
  if (score >= 5) return "bg-yellow-500 text-white";
  return "bg-red-500 text-white";
};

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

// Parse genres from comma-separated string
export const parseGenres = (genre: string | null): string[] => {
  if (!genre) return [];
  return genre.split(',').map(g => g.trim()).filter(g => g.length > 0);
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
}

function PortalTooltip({ children, anchorRef }: { children: React.ReactNode; anchorRef: React.RefObject<HTMLElement | null> }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updatePos = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top, left: rect.left + rect.width / 2 });
  }, [anchorRef]);

  const show = useCallback(() => {
    updatePos();
    setVisible(true);
  }, [updatePos]);

  const hide = useCallback(() => {
    setVisible(false);
  }, []);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    el.addEventListener("mouseenter", show);
    el.addEventListener("mouseleave", hide);
    return () => {
      el.removeEventListener("mouseenter", show);
      el.removeEventListener("mouseleave", hide);
    };
  }, [anchorRef, show, hide]);

  useEffect(() => {
    if (!visible) return;
    const handleScroll = () => updatePos();
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [visible, updatePos]);

  if (!visible) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translate(-50%, -100%)", marginTop: -8, zIndex: 9999 }}
    >
      {children}
    </div>,
    document.body
  );
}

export const MediaCard = React.memo(function MediaCard({ entry, onEdit, onDelete, onDuplicate, awards = [], profileKeys }: MediaCardProps) {
  const navigate = useNavigate();
  const imgSrc = useImageUrl(entry.image_url);
  const [menuOpen, setMenuOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [imageViewOpen, setImageViewOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [duplicatesModalOpen, setDuplicatesModalOpen] = useState(false);
  const [duplicateEntries, setDuplicateEntries] = useState<MediaEntry[]>([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuDropdownRef = useRef<HTMLDivElement>(null);
  const platinumBadgeRef = useRef<HTMLDivElement>(null);
  const awardBadgeRef = useRef<HTMLDivElement>(null);
  const rewatchBadgeRef = useRef<HTMLDivElement>(null);
  const localBadgeRef = useRef<HTMLDivElement>(null);
  const subtitlesBadgeRef = useRef<HTMLDivElement>(null);
  const earlyAccessBadgeRef = useRef<HTMLDivElement>(null);
  const platinumStatusBadgeRef = useRef<HTMLDivElement>(null);
  const genreOverflowRef = useRef<HTMLDivElement>(null);
  const detailsModalRef = useRef<HTMLDivElement>(null);
  const imageModalRef = useRef<HTMLDivElement>(null);
  const deleteModalRef = useRef<HTMLDivElement>(null);
  const duplicatesModalRef = useRef<HTMLDivElement>(null);
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
  const elevationShadow = hasPlatinum
    ? "0 30px 60px rgba(0, 0, 0, 0.42), 0 12px 26px rgba(8, 47, 73, 0.28), 0 0 54px rgba(34, 211, 238, 0.22), 0 0 84px rgba(245, 158, 11, 0.14)"
    : perfectTen
      ? "0 30px 60px rgba(0, 0, 0, 0.42), 0 12px 26px rgba(6, 78, 59, 0.26), 0 0 58px rgba(52, 211, 153, 0.22)"
      : "0 26px 54px rgba(0, 0, 0, 0.38), 0 10px 22px rgba(0, 0, 0, 0.24), 0 0 36px color-mix(in srgb, var(--color-primary) 18%, transparent)";

  useEscapeToClose(descriptionOpen, () => setDescriptionOpen(false));
  useEscapeToClose(imageViewOpen, () => setImageViewOpen(false));
  useEscapeToClose(deleteConfirmOpen, () => setDeleteConfirmOpen(false));
  useEscapeToClose(duplicatesModalOpen, () => setDuplicatesModalOpen(false));

  useFocusTrap(descriptionOpen, detailsModalRef);
  useFocusTrap(imageViewOpen, imageModalRef);
  useFocusTrap(deleteConfirmOpen, deleteModalRef);
  useFocusTrap(duplicatesModalOpen, duplicatesModalRef);

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
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    setDeleteConfirmOpen(false);
    if (entry.id) {
      onDelete?.(entry.id);
    }
  };

  const handleViewDescription = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setDescriptionOpen(true);
  };

  const handleViewImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setImageViewOpen(true);
  };

  const handleFindDuplicates = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setDuplicatesLoading(true);
    setDuplicatesModalOpen(true);
    try {
      const entries = await dbService.getEntriesByName(entry.name);
      setDuplicateEntries(entries);
    } catch (error) {
      console.error('Error finding duplicates:', error);
      setDuplicateEntries([]);
    } finally {
      setDuplicatesLoading(false);
    }
  };

  return (
    <>
      <motion.div
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
            className="h-52 w-full relative overflow-hidden rounded-t-2xl"
            style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
          >
            <img
              src={imgSrc}
              alt={entry.name}
              className="w-full h-full rounded-t-2xl object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
              onError={(event) => { event.currentTarget.src = DEFAULT_COVER_IMAGE; }}
            />

            {/* Gradient Overlay */}
            <div className="absolute inset-0 rounded-t-2xl bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            {/* Platinum Badge */}
            {hasPlatinum && (
              <div className="absolute top-2 left-2 z-20" ref={platinumBadgeRef}>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-amber-400/95 via-yellow-300/95 to-cyan-300/95 rounded-full shadow-lg shadow-cyan-500/25 border border-white/30">
                  <Trophy size={12} className="text-slate-900" />
                  <span className="text-[10px] font-black tracking-wide text-slate-900">PLATINUM 100%</span>
                </div>
                <PortalTooltip anchorRef={platinumBadgeRef}>
                  <div className="bg-surface/95 backdrop-blur-xl border border-cyan-300/40 rounded-lg px-3 py-1.5 shadow-2xl shadow-black/50 whitespace-nowrap">
                    <span className="text-xs font-medium text-cyan-200">Platinum / 100% Completed</span>
                  </div>
                </PortalTooltip>
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
                <span>{entry.review_score.toFixed(1)}</span>
              </div>
            )}

            {/* Award Badge */}
            {hasAwards && (
              <div className="absolute bottom-2 left-2 z-20" ref={awardBadgeRef}>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full shadow-lg shadow-amber-500/30 cursor-pointer">
                <Trophy size={14} className="text-white fill-white/20" />
                {awards.length > 1 && (
                  <span className="text-xs font-bold text-white">{awards.length}</span>
                )}
              </div>
              <PortalTooltip anchorRef={awardBadgeRef}>
                <div className="bg-surface/95 backdrop-blur-xl border border-amber-500/30 rounded-xl p-3 shadow-2xl shadow-black/50 w-48">
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
                </div>
              </PortalTooltip>
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
                  "absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 flex items-center justify-center min-w-[26px] h-4 px-1 rounded-full shadow-md border border-white/20 text-[9px] font-bold",
                  getRatingColor(entry.review_score)
                )}>
                  {entry.review_score.toFixed(1)}
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
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-200 hover:bg-primary/20 hover:text-primary transition-colors"
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
                <div ref={genreOverflowRef}>
                  <span className="px-2 py-0.5 bg-white/5 rounded-md text-[10px] text-gray-500 font-medium cursor-pointer hover:bg-white/10 hover:text-gray-300 transition-colors">
                    +{genres.length - 3}
                  </span>
                  <PortalTooltip anchorRef={genreOverflowRef}>
                    <div className="bg-surface/95 backdrop-blur-xl border border-white/15 rounded-xl p-3 shadow-2xl shadow-black/50 min-w-[120px]">
                      <div className="text-xs font-semibold text-gray-400 mb-2">More Genres</div>
                      <div className="flex flex-wrap gap-1.5">
                        {genres.slice(3).map((genre, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 bg-white/10 rounded-md text-[10px] text-gray-300 font-medium"
                          >
                            {genre}
                          </span>
                        ))}
                      </div>
                    </div>
                  </PortalTooltip>
                </div>
              )}
            </div>
          )}

          {/* Rewatch / Local Copy / Subtitles / Early Access / Platinum Badges */}
          {(isRewatch || hasLocalCopy || hasSubtitles || hasPlatinum || isEarlyAccess) && (
            <div className="flex items-center gap-1.5">
              {isRewatch && (
                <div ref={rewatchBadgeRef}>
                  <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center cursor-pointer">
                    <RotateCcw size={12} className="text-amber-500" />
                  </div>
                  <PortalTooltip anchorRef={rewatchBadgeRef}>
                    <div className="bg-surface/95 backdrop-blur-xl border border-amber-500/30 rounded-lg px-3 py-1.5 shadow-2xl shadow-black/50 whitespace-nowrap">
                      <span className="text-xs font-medium text-amber-400">Replay / Rewatch</span>
                    </div>
                  </PortalTooltip>
                </div>
              )}
              {hasLocalCopy && (
                <div ref={localBadgeRef}>
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center cursor-pointer">
                    <Check size={12} className="text-emerald-500" />
                  </div>
                  <PortalTooltip anchorRef={localBadgeRef}>
                    <div className="bg-surface/95 backdrop-blur-xl border border-emerald-500/30 rounded-lg px-3 py-1.5 shadow-2xl shadow-black/50 whitespace-nowrap">
                      <span className="text-xs font-medium text-emerald-400">Own Local Copy</span>
                    </div>
                  </PortalTooltip>
                </div>
              )}
              {hasSubtitles && (
                <div ref={subtitlesBadgeRef}>
                  <div className="w-7 h-7 rounded-full bg-orange-500/20 border border-orange-500 flex items-center justify-center cursor-pointer">
                    <Captions size={12} className="text-orange-400" />
                  </div>
                  <PortalTooltip anchorRef={subtitlesBadgeRef}>
                    <div className="bg-surface/95 backdrop-blur-xl border border-orange-500/30 rounded-lg px-3 py-1.5 shadow-2xl shadow-black/50 whitespace-nowrap">
                      <span className="text-xs font-medium text-orange-400">Subtitles</span>
                    </div>
                  </PortalTooltip>
                </div>
              )}
              {isEarlyAccess && (
                <div ref={earlyAccessBadgeRef}>
                  <div className="w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500 flex items-center justify-center cursor-pointer">
                    <Clock size={12} className="text-violet-400" />
                  </div>
                  <PortalTooltip anchorRef={earlyAccessBadgeRef}>
                    <div className="bg-surface/95 backdrop-blur-xl border border-violet-500/30 rounded-lg px-3 py-1.5 shadow-2xl shadow-black/50 whitespace-nowrap">
                      <span className="text-xs font-medium text-violet-400">Early Access{entry.early_access_version ? `: ${entry.early_access_version}` : ''}</span>
                    </div>
                  </PortalTooltip>
                </div>
              )}
              {hasPlatinum && (
                <div ref={platinumStatusBadgeRef}>
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400/30 to-cyan-400/30 border border-cyan-300 flex items-center justify-center cursor-pointer">
                    <Trophy size={12} className="text-cyan-100" />
                  </div>
                  <PortalTooltip anchorRef={platinumStatusBadgeRef}>
                    <div className="bg-surface/95 backdrop-blur-xl border border-cyan-300/40 rounded-lg px-3 py-1.5 shadow-2xl shadow-black/50 whitespace-nowrap">
                      <span className="text-xs font-medium text-cyan-200">Platinum / 100%</span>
                    </div>
                  </PortalTooltip>
                </div>
              )}
            </div>
          )}

          {/* Date */}
          {entry.completion_date && (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mt-auto pt-2 border-t border-white/5">
              <Calendar size={11} />
              <span>{formatDate(entry.completion_date)}</span>
            </div>
          )}
        </div>

        {/* Details Modal - rendered via Portal */}
        {descriptionOpen && createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={(e) => {
              e.stopPropagation();
              setDescriptionOpen(false);
            }}
          >
            <div
              ref={detailsModalRef}
              className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-white/10 w-full max-w-lg rounded-2xl shadow-2xl shadow-primary/10 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/5 bg-gradient-to-r from-purple-500/10 via-transparent to-transparent">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/20 rounded-lg">
                    <FileText size={18} className="text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Details</h3>
                    <p className="text-xs text-gray-400 line-clamp-1">{entry.name}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDescriptionOpen(false);
                  }}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-4">
                {!entry.description && !entry.notes ? (
                  <div className="text-center py-8">
                    <FileText size={40} className="mx-auto text-gray-600 mb-3" />
                    <p className="text-gray-500 text-sm">No details available</p>
                    <p className="text-gray-600 text-xs mt-1">Edit the entry to add a description or notes</p>
                  </div>
                ) : (
                  <>
                    {/* Description Section */}
                    <div className="rounded-xl border border-white/5 overflow-hidden">
                      <div className="flex items-center gap-2 px-3.5 py-2.5 bg-purple-500/10 border-b border-white/5">
                        <FileText size={14} className="text-purple-400" />
                        <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider">Description</span>
                      </div>
                      <div className="px-3.5 py-3">
                        {entry.description ? (
                          <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                            {entry.description}
                          </p>
                        ) : (
                          <p className="text-gray-600 text-xs italic">No description</p>
                        )}
                      </div>
                    </div>

                    {/* Notes Section */}
                    <div className="rounded-xl border border-white/5 overflow-hidden">
                      <div className="flex items-center gap-2 px-3.5 py-2.5 bg-amber-500/10 border-b border-white/5">
                        <StickyNote size={14} className="text-amber-400" />
                        <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Notes</span>
                      </div>
                      <div className="px-3.5 py-3">
                        {entry.notes ? (
                          <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                            {entry.notes}
                          </p>
                        ) : (
                          <p className="text-gray-600 text-xs italic">No notes</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Image View Modal - rendered via Portal */}
        {imageViewOpen && createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/95 backdrop-blur-md"
            onClick={(e) => {
              e.stopPropagation();
              setImageViewOpen(false);
            }}
          >
            {/* Close Button - positioned at top right of screen */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setImageViewOpen(false);
              }}
              className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-gray-300 hover:text-white z-10"
            >
              <X size={24} />
            </button>

            <div
              ref={imageModalRef}
              className="relative flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Image */}
              <img
                src={imgSrc}
                alt={entry.name}
                className="max-w-[90vw] max-h-[80vh] object-contain rounded-2xl shadow-2xl"
                onError={(event) => { event.currentTarget.src = DEFAULT_COVER_IMAGE; }}
              />

              {/* Title below image */}
              <div className="mt-4 text-center">
                <h3 className="text-xl font-bold text-white">{entry.name}</h3>
                <p className="text-sm text-gray-400 mt-1">{entry.entry_type}</p>
                {entry.image_url && (
                  <p className="text-xs text-gray-500 mt-2 font-mono px-4 break-all max-w-[80vw]">
                    {entry.image_url}
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Delete Confirmation Modal - rendered via Portal */}
        {deleteConfirmOpen && createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteConfirmOpen(false);
            }}
          >
            <div
              ref={deleteModalRef}
              className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-white/10 w-full max-w-md rounded-2xl shadow-2xl shadow-red-500/10 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3 p-5 border-b border-white/5 bg-gradient-to-r from-red-500/10 via-transparent to-transparent">
                <div className="p-2.5 bg-red-500/20 rounded-xl">
                  <Trash2 size={20} className="text-red-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg">Delete Entry</h3>
                  <p className="text-xs text-gray-400">This action cannot be undone</p>
                </div>
              </div>

              {/* Content */}
              <div className="p-5">
                <p className="text-gray-200 text-sm leading-relaxed">
                  Are you sure you want to delete <span className="font-semibold text-white">"{entry.name}"</span>?
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  This will permanently remove the entry from your library.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 p-5 pt-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmOpen(false);
                  }}
                  className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    confirmDelete();
                  }}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl font-semibold text-white transition-colors shadow-lg shadow-red-500/25"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Duplicates Modal - rendered via Portal */}
        {duplicatesModalOpen && createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={(e) => {
              e.stopPropagation();
              setDuplicatesModalOpen(false);
            }}
          >
            <div
              ref={duplicatesModalRef}
              className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-white/10 w-full max-w-2xl rounded-2xl shadow-2xl shadow-amber-500/10 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/5 bg-gradient-to-r from-amber-500/10 via-transparent to-transparent">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/20 rounded-lg">
                    <Copy size={18} className="text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Duplicates & Rewatches</h3>
                    <p className="text-xs text-gray-400 line-clamp-1">All entries matching "{entry.name}"</p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDuplicatesModalOpen(false);
                  }}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {duplicatesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" />
                  </div>
                ) : duplicateEntries.length > 1 ? (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500 mb-4">
                      Found {duplicateEntries.length} entries with this name
                    </p>
                    {duplicateEntries.map((dup) => (
                      <div
                        key={dup.id}
                        className={cn(
                          "flex items-center gap-4 p-3 rounded-xl border transition-colors",
                          dup.id === entry.id
                            ? "bg-amber-500/10 border-amber-500/30"
                            : "bg-white/5 border-white/10 hover:bg-white/10"
                        )}
                      >
                        {/* Rating */}
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shrink-0",
                          dup.review_score !== null
                            ? dup.review_score >= 9
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : dup.review_score >= 7
                                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                : dup.review_score >= 5
                                  ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                                  : "bg-red-500/20 text-red-400 border border-red-500/30"
                            : "bg-gray-500/20 text-gray-400 border border-gray-500/30"
                        )}>
                          {dup.review_score !== null ? dup.review_score.toFixed(1) : "—"}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-gray-200 font-medium truncate">{dup.name}</span>
                            {dup.id === entry.id && (
                              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-semibold rounded-full">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            {/* Date */}
                            {dup.completion_date && (
                              <span className="flex items-center gap-1">
                                <Calendar size={11} />
                                {formatDate(dup.completion_date)}
                              </span>
                            )}
                            {/* Type */}
                            {dup.entry_type && (
                              <span className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">
                                {dup.entry_type}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="flex items-center gap-2 shrink-0">
                          {dup.entry_type?.toLowerCase().includes("game") && dup.is_platinum === 1 && (
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400/30 to-cyan-400/30 border border-cyan-300 flex items-center justify-center" title="Platinum / 100%">
                              <Trophy size={12} className="text-cyan-100" />
                            </div>
                          )}
                          {dup.is_rewatch === 1 && (
                            <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center" title="Rewatch/Replay">
                              <RotateCcw size={12} className="text-amber-500" />
                            </div>
                          )}
                          {dup.own_local_copy === 1 && (
                            <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center" title="Local Copy">
                              <Check size={12} className="text-emerald-500" />
                            </div>
                          )}
                          {dup.has_subtitles === 1 && (
                            <div className="w-7 h-7 rounded-full bg-orange-500/20 border border-orange-500 flex items-center justify-center" title="Subtitles">
                              <Captions size={12} className="text-orange-400" />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Copy size={40} className="mx-auto text-gray-600 mb-3" />
                    <p className="text-gray-500 text-sm">No duplicate entries found</p>
                    <p className="text-gray-600 text-xs mt-1">This is the only entry with this name</p>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
      </motion.div>
    </>
  );
});
