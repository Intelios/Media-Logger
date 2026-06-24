import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Play, Pause, Check, Pencil, Trash2, MoreVertical, Film, Tv, MonitorPlay, Gamepad2, BookOpen, Disc3, Heart, Monitor, Tag, Calendar } from "lucide-react";
import { DEFAULT_COVER_IMAGE, useImageUrl } from "../lib/utils";
import { cn } from "../lib/utils_ui";
import type { BacklogItem } from "../lib/db";

const getSpineColor = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes("album")) return "bg-emerald-600";
  if (t.includes("game")) return "bg-purple-600";
  if (t.includes("anime")) return "bg-pink-500";
  if (t.includes("k-drama")) return "bg-teal-600";
  if (t.includes("movie")) return "bg-blue-600";
  if (t.includes("show")) return "bg-cyan-600";
  if (t.includes("book")) return "bg-amber-600";
  if (t.includes("jav") || t.includes("hentai")) return "bg-rose-600";
  if (t.includes("visual novel")) return "bg-indigo-600";
  return "bg-gray-600";
};

const getTypeIcon = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes("album")) return <Disc3 size={28} />;
  if (t.includes("game")) return <Gamepad2 size={28} />;
  if (t.includes("anime")) return <MonitorPlay size={28} />;
  if (t.includes("k-drama")) return <Tv size={28} />;
  if (t.includes("movie")) return <Film size={28} />;
  if (t.includes("show")) return <Tv size={28} />;
  if (t.includes("book")) return <BookOpen size={28} />;
  if (t.includes("jav") || t.includes("hentai")) return <Heart size={28} />;
  if (t.includes("visual novel")) return <Monitor size={28} />;
  return <Tag size={28} />;
};

const getSpineGradient = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes("album")) return "from-emerald-700 to-emerald-500";
  if (t.includes("game")) return "from-purple-700 to-purple-500";
  if (t.includes("anime")) return "from-pink-600 to-pink-400";
  if (t.includes("k-drama")) return "from-teal-700 to-teal-500";
  if (t.includes("movie")) return "from-blue-700 to-blue-500";
  if (t.includes("show")) return "from-cyan-700 to-cyan-500";
  if (t.includes("book")) return "from-amber-700 to-amber-500";
  if (t.includes("jav") || t.includes("hentai")) return "from-rose-700 to-rose-500";
  if (t.includes("visual novel")) return "from-indigo-700 to-indigo-500";
  return "from-gray-700 to-gray-500";
};

interface BacklogCaseProps {
  item: BacklogItem;
  index: number;
  onStart: (id: number) => void;
  onPause: (id: number) => void;
  onComplete: (item: BacklogItem) => void;
  onEdit: (item: BacklogItem) => void;
  onRemove: (id: number) => void;
}

export function BacklogCase({ item, index, onStart, onPause, onComplete, onEdit, onRemove }: BacklogCaseProps) {
  const imageUrl = useImageUrl(item.image_url);
  const [showMenu, setShowMenu] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const caseRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuButtonRef.current?.contains(e.target as Node)) return;
      setShowMenu(false);
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [showMenu]);

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showMenu) {
      setShowMenu(false);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPosition({ top: rect.bottom + 4, left: rect.right - 176 });
    setShowMenu(true);
  };

  const handleMouseEnter = () => {
    tooltipTimeoutRef.current = setTimeout(() => setShowTooltip(true), 400);
  };

  const handleMouseLeave = () => {
    clearTimeout(tooltipTimeoutRef.current);
    setShowTooltip(false);
  };

  const hasImage = item.image_url && imageUrl !== DEFAULT_COVER_IMAGE;
  const genres = item.genre?.split(",").map(g => g.trim()).filter(Boolean) || [];
  const spineColor = getSpineColor(item.entry_type);
  const spineGradient = getSpineGradient(item.entry_type);

  return (
    <div
      ref={caseRef}
      className="backlog-case-enter group relative"
      style={{ animationDelay: `${index * 40}ms` }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* The case */}
      <div className="relative w-[140px] h-[210px] rounded-r-md rounded-l-sm cursor-pointer transition-all duration-300 ease-out group-hover:-translate-y-1.5 group-hover:scale-[1.04] backlog-case-shadow group-hover:backlog-case-shadow-hover">
        {/* Spine */}
        <div className={cn(
          "absolute left-0 top-0 bottom-0 w-[5px] rounded-l-sm bg-gradient-to-b z-10",
          spineGradient
        )} />

        {/* Cover */}
        <div className="absolute inset-0 rounded-r-md rounded-l-sm overflow-hidden">
          {hasImage ? (
            <img
              src={imageUrl}
              alt={item.name}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div className={cn(
              "w-full h-full flex flex-col items-center justify-center gap-2",
              spineColor, "bg-opacity-20"
            )}
              style={{ backgroundColor: "var(--color-surface)" }}
            >
              <div className="text-white/40">
                {getTypeIcon(item.entry_type)}
              </div>
              <p className="text-[10px] text-white/30 text-center px-2 leading-tight line-clamp-2 font-medium">
                {item.name}
              </p>
            </div>
          )}

          {/* Top edge shadow for depth */}
          <div className="absolute inset-0 rounded-r-md shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_-2px_4px_rgba(0,0,0,0.2)]" />

          {/* In Progress indicator */}
          {item.status === 'in_progress' && (
            <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-amber-500/90 flex items-center justify-center shadow-lg backdrop-blur-sm">
              <Play size={11} className="text-white ml-0.5" fill="white" />
            </div>
          )}

          {/* Hover overlay with menu button */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-r-md">
            <button
              ref={menuButtonRef}
              onClick={handleMenuClick}
              className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors"
            >
              <MoreVertical size={14} className="text-white" />
            </button>

            {/* Title at bottom of hover overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-2">
              <p className="text-[11px] text-white font-semibold leading-tight line-clamp-2">
                {item.name}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Context menu (portal) */}
      {showMenu && menuPosition && createPortal(
        <div
          className="fixed z-[9999] w-44 rounded-xl overflow-hidden shadow-2xl border border-white/10"
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            backgroundColor: "var(--color-surface)",
          }}
        >
          {item.status === 'planning' ? (
            <button
              onClick={() => { onStart(item.id); setShowMenu(false); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-200 hover:bg-amber-500/20 hover:text-amber-400 transition-colors"
            >
              <Play size={14} />
              <span>Start</span>
            </button>
          ) : (
            <button
              onClick={() => { onPause(item.id); setShowMenu(false); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-200 hover:bg-amber-500/20 hover:text-amber-400 transition-colors"
            >
              <Pause size={14} />
              <span>Move to Planning</span>
            </button>
          )}
          <button
            onClick={() => { onComplete(item); setShowMenu(false); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-200 hover:bg-emerald-500/20 hover:text-emerald-400 transition-colors"
          >
            <Check size={14} />
            <span>Mark Complete</span>
          </button>
          <button
            onClick={() => { onEdit(item); setShowMenu(false); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-200 hover:bg-blue-500/20 hover:text-blue-400 transition-colors"
          >
            <Pencil size={14} />
            <span>Edit</span>
          </button>
          <div className="h-px bg-white/5" />
          <button
            onClick={() => { onRemove(item.id); setShowMenu(false); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Trash2 size={14} />
            <span>Remove</span>
          </button>
        </div>,
        document.body
      )}

      {/* Tooltip (portal) */}
      {showTooltip && !showMenu && caseRef.current && createPortal(
        <BacklogTooltip item={item} genres={genres} anchorEl={caseRef.current} />,
        document.body
      )}
    </div>
  );
}

function BacklogTooltip({ item, genres, anchorEl }: { item: BacklogItem; genres: string[]; anchorEl: HTMLElement }) {
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rect = anchorEl.getBoundingClientRect();
    const tooltipWidth = 220;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));
    setPos({ top: rect.bottom + 8, left });
  }, [anchorEl]);

  return (
    <div
      ref={tooltipRef}
      className="glass-tooltip fixed z-[9998] w-[220px] rounded-xl p-3"
      style={{
        top: pos.top,
        left: pos.left,
      }}
    >
      <p className="text-sm font-semibold text-text leading-tight mb-1.5">{item.name}</p>

      <div className="flex items-center gap-1.5 mb-2">
        <span className={cn(
          "px-1.5 py-0.5 text-[10px] font-bold rounded text-white",
          getSpineColor(item.entry_type)
        )}>
          {item.entry_type}
        </span>
        {item.status === 'in_progress' && (
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
            In Progress
          </span>
        )}
      </div>

      {genres.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {genres.slice(0, 4).map(g => (
            <span key={g} className="px-1.5 py-0.5 text-[9px] rounded-full bg-primary/10 text-text">
              {g}
            </span>
          ))}
          {genres.length > 4 && (
            <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-primary/5 text-text-muted">
              +{genres.length - 4}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
        <Calendar size={10} />
        <span>Added {item.added_date}</span>
      </div>
    </div>
  );
}
