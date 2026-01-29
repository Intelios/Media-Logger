import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Star, Calendar, MoreVertical, Monitor, Disc3, BookOpen, Gamepad2, Film, Tv, MonitorPlay, Heart, RotateCcw, Check, Pencil, Trash2, Trophy, FileText, X, Image as ImageIcon, Copy, CopyPlus } from "lucide-react";
import { getImageUrl } from "../lib/utils";
import { dbService, type MediaEntry } from "../lib/db";
import { cn } from "../lib/utils_ui";

// Type badge colors matching Flet version
const getTypeBadgeStyle = (type: string | null) => {
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
const getRatingColor = (score: number | null) => {
  if (!score && score !== 0) return "bg-gray-700/80 text-gray-300";
  if (score >= 9) return "bg-emerald-500 text-white";
  if (score >= 7) return "bg-blue-500 text-white";
  if (score >= 5) return "bg-yellow-500 text-white";
  return "bg-red-500 text-white";
};

// Format date to "14th March 2026" style
const formatDate = (dateString: string | null): string => {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleString('en-US', { month: 'long' });
    const year = date.getFullYear();

    // Add ordinal suffix
    const suffix = (d: number) => {
      if (d > 3 && d < 21) return 'th';
      switch (d % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };

    return `${day}${suffix(day)} ${month} ${year}`;
  } catch {
    return dateString;
  }
};

// Get context info based on entry type - returns an array for entries with multiple fields
const getContextInfo = (entry: MediaEntry): { label: string; value: string; icon: React.ReactNode }[] => {
  const type = (entry.entry_type || "").toLowerCase();
  const items: { label: string; value: string; icon: React.ReactNode }[] = [];

  if (type.includes("album") && entry.artist) {
    items.push({ label: "Artist", value: entry.artist, icon: <Disc3 size={12} /> });
  }
  if (type.includes("book") && entry.author) {
    items.push({ label: "Author", value: entry.author, icon: <BookOpen size={12} /> });
  }
  if (type.includes("game") && entry.platform) {
    items.push({ label: "Platform", value: entry.platform, icon: <Gamepad2 size={12} /> });
  }
  if (type.includes("jav") || type.includes("hentai")) {
    // Add both actress and director/studio for JAV/Hentai entries
    if (entry.actress) {
      items.push({ label: "Actress", value: entry.actress, icon: <Heart size={12} /> });
    }
    if (entry.director) {
      items.push({ label: "Director/Studio", value: entry.director, icon: <Film size={12} /> });
    }
  }
  if (type.includes("visual novel") && entry.update_version) {
    items.push({ label: "Version", value: entry.update_version, icon: <Monitor size={12} /> });
  }
  return items;
};

// Parse genres from comma-separated string
const parseGenres = (genre: string | null): string[] => {
  if (!genre) return [];
  return genre.split(',').map(g => g.trim()).filter(g => g.length > 0);
};

// Check if entry is a perfect 10
const isPerfectTen = (score: number | null | undefined): boolean => {
  return score === 10;
};

// Award type for badges
export interface MediaAward {
  categoryName: string;
  year: number;
}

interface MediaCardProps {
  entry: MediaEntry;
  awards?: MediaAward[];
  onEdit?: (entry: MediaEntry) => void;
  onDelete?: (id: number) => void;
  onDuplicate?: (entry: MediaEntry) => void;
}

export function MediaCard({ entry, onEdit, onDelete, onDuplicate, awards = [] }: MediaCardProps) {
  const [imgSrc, setImgSrc] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [imageViewOpen, setImageViewOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [duplicatesModalOpen, setDuplicatesModalOpen] = useState(false);
  const [duplicateEntries, setDuplicateEntries] = useState<MediaEntry[]>([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const typeBadge = getTypeBadgeStyle(entry.entry_type);
  const contextInfo = getContextInfo(entry);
  const perfectTen = isPerfectTen(entry.review_score);
  const hasAwards = awards.length > 0;
  const genres = parseGenres(entry.genre);

  // Check boolean flags (stored as 0/1 in SQLite)
  const isRewatch = entry.is_rewatch === 1;
  const hasLocalCopy = entry.own_local_copy === 1;

  useEffect(() => {
    getImageUrl(entry.image_url).then(setImgSrc);
  }, [entry.image_url]);

  // Click outside to close menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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
      <div className={cn(
        "group relative bg-surface/80 backdrop-blur-md rounded-2xl hover:scale-[1.03] transition-all duration-300 cursor-pointer",
        perfectTen
          ? "border-2 border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4),0_0_40px_rgba(52,211,153,0.2)] hover:shadow-[0_0_25px_rgba(52,211,153,0.5),0_0_50px_rgba(52,211,153,0.3)] hover:border-emerald-300 animate-perfect-glow"
          : "border border-white/10 hover:shadow-2xl hover:shadow-primary/20 hover:border-primary/40"
      )}>

        {/* Image Container */}
        <div className="h-52 w-full relative overflow-hidden rounded-t-2xl">
          <img
            src={imgSrc}
            alt={entry.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
          />

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

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

          {/* Rating Badge - single badge that moves on hover */}
          {(entry.review_score !== null && entry.review_score !== undefined) && (
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
            <div className="absolute bottom-2 left-2 group/award">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full shadow-lg shadow-amber-500/30 cursor-pointer">
                <Trophy size={14} className="text-white fill-white/20" />
                {awards.length > 1 && (
                  <span className="text-xs font-bold text-white">{awards.length}</span>
                )}
              </div>
              {/* Tooltip */}
              <div className="absolute bottom-full left-0 mb-2 w-48 opacity-0 invisible group-hover/award:opacity-100 group-hover/award:visible transition-all duration-200 z-30">
                <div className="bg-surface/95 backdrop-blur-xl border border-amber-500/30 rounded-xl p-3 shadow-2xl shadow-black/50">
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
              </div>
            </div>
          )}
        </div>

        {/* Dropdown Menu - rendered via Portal */}
        {menuOpen && createPortal(
          <div
            ref={menuRef}
            className="fixed w-44 bg-surface/95 backdrop-blur-xl border border-white/15 rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-[200]"
            style={{ top: menuPosition.top, right: menuPosition.right }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleViewDescription}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-200 hover:bg-purple-500/20 hover:text-purple-400 transition-colors"
            >
              <FileText size={14} />
              <span>View Description</span>
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
                  {info.value.split(',').map((item, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-white/5 rounded-lg text-[11px] text-gray-300"
                    >
                      {item.trim()}
                    </span>
                  ))}
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
                <div className="relative group/genres">
                  <span className="px-2 py-0.5 bg-white/5 rounded-md text-[10px] text-gray-500 font-medium cursor-pointer hover:bg-white/10 hover:text-gray-300 transition-colors">
                    +{genres.length - 3}
                  </span>
                  {/* Genres Overflow Tooltip */}
                  <div className="absolute bottom-full left-0 mb-2 opacity-0 invisible group-hover/genres:opacity-100 group-hover/genres:visible transition-all duration-200 z-[100]">
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
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Rewatch / Local Copy Badges */}
          {(isRewatch || hasLocalCopy) && (
            <div className="flex items-center gap-1.5">
              {isRewatch && (
                <div className="relative group/rewatch">
                  <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center cursor-pointer">
                    <RotateCcw size={12} className="text-amber-500" />
                  </div>
                  {/* Rewatch Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 invisible group-hover/rewatch:opacity-100 group-hover/rewatch:visible transition-all duration-200 z-[100]">
                    <div className="bg-surface/95 backdrop-blur-xl border border-amber-500/30 rounded-lg px-3 py-1.5 shadow-2xl shadow-black/50 whitespace-nowrap">
                      <span className="text-xs font-medium text-amber-400">Replay / Rewatch</span>
                    </div>
                  </div>
                </div>
              )}
              {hasLocalCopy && (
                <div className="relative group/local">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center cursor-pointer">
                    <Check size={12} className="text-emerald-500" />
                  </div>
                  {/* Local Copy Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 invisible group-hover/local:opacity-100 group-hover/local:visible transition-all duration-200 z-[100]">
                    <div className="bg-surface/95 backdrop-blur-xl border border-emerald-500/30 rounded-lg px-3 py-1.5 shadow-2xl shadow-black/50 whitespace-nowrap">
                      <span className="text-xs font-medium text-emerald-400">Own Local Copy</span>
                    </div>
                  </div>
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

        {/* Description Modal - rendered via Portal */}
        {descriptionOpen && createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={(e) => {
              e.stopPropagation();
              setDescriptionOpen(false);
            }}
          >
            <div
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
                    <h3 className="font-bold text-white">Description</h3>
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
              <div className="p-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {entry.description ? (
                  <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                    {entry.description}
                  </p>
                ) : (
                  <div className="text-center py-8">
                    <FileText size={40} className="mx-auto text-gray-600 mb-3" />
                    <p className="text-gray-500 text-sm">No description available</p>
                    <p className="text-gray-600 text-xs mt-1">Edit the entry to add one</p>
                  </div>
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
              className="relative flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Image */}
              <img
                src={imgSrc}
                alt={entry.name}
                className="max-w-[90vw] max-h-[80vh] object-contain rounded-2xl shadow-2xl"
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
      </div>
    </>
  );
}