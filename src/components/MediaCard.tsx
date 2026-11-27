import * as React from "react";
import { Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { MoreVertical, Monitor, Disc3, BookOpen, Gamepad2, Film, Heart, Check, Pencil, Trash2, FileText, Image as ImageIcon, Copy, CopyPlus } from "lucide-react";
import { dbService, type EntryCardSummary, type MediaEntry } from "../lib/db";
import { cn } from "../lib/utils_ui";
import type { CoverPriority } from "./CoverImage";
import { MediaCardPoster } from "./MediaCardPoster";
import type { MediaCardDialogKind } from "./MediaCardDialogs";

const loadMediaCardDialogs = () => import("./MediaCardDialogs");
const LazyMediaCardDialogs = React.lazy(loadMediaCardDialogs);

// Get context info based on entry type - returns an array for entries with multiple fields
// profileType maps to the profile system's type key (null means no profile possible)
type MediaCardEntry = MediaEntry | EntryCardSummary;

function isEntryDetail(entry: MediaCardEntry): entry is MediaEntry {
  return 'description' in entry && 'notes' in entry;
}

function materializeSummary(entry: MediaCardEntry): MediaEntry {
  return isEntryDetail(entry) ? entry : { ...entry, description: null, notes: null };
}

export interface MediaCardContextItem {
  label: string;
  value: string;
  icon: React.ReactNode;
  profileType: string | null;
  badgeClass?: string;
  /** Lead word for the card's byline ("by", "on"); omitted for status items. */
  lead?: string;
}

const getContextInfo = (entry: MediaCardEntry): MediaCardContextItem[] => {
  const type = (entry.entry_type || "").toLowerCase();
  const items: MediaCardContextItem[] = [];

  if (type.includes("album") && entry.artist) {
    items.push({ label: "Artist", value: entry.artist, icon: <Disc3 size={12} />, profileType: "artist", lead: "by" });
  }
  if (type.includes("book") && entry.author) {
    items.push({ label: "Author", value: entry.author, icon: <BookOpen size={12} />, profileType: "author", lead: "by" });
  }
  if (type.includes("game") && entry.platform) {
    items.push({ label: "Platform", value: entry.platform, icon: <Gamepad2 size={12} />, profileType: "platform", lead: "on" });
  }
  if (type.includes("jav") || type.includes("hentai")) {
    if (entry.actress) {
      items.push({ label: "Actress", value: entry.actress, icon: <Heart size={12} />, profileType: "actress", lead: "with" });
    }
    if (entry.director) {
      items.push({ label: "Director/Studio", value: entry.director, icon: <Film size={12} />, profileType: "director", lead: "from" });
    }
  }
  if (type.includes("visual novel")) {
    if (entry.is_completed === 1) {
      items.push({ label: "Status", value: "Completed", icon: <Check size={12} className="text-emerald-400" />, profileType: null, badgeClass: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" });
    } else if (entry.update_version) {
      items.push({ label: "Version", value: entry.update_version, icon: <Monitor size={12} />, profileType: null, lead: "played to" });
    }
  }
  return items;
};

// Award type for badges
export interface MediaAward {
  categoryName: string;
  year: number;
  /** Person credited beside the win (Best Actor), when the award credits one. */
  creditedPerson?: string | null;
}

interface MediaCardProps {
  entry: MediaCardEntry;
  awards?: MediaAward[];
  profileKeys?: Set<string>;
  onEdit?: (entry: MediaEntry) => void;
  onDelete?: (id: number) => void;
  onDuplicate?: (entry: MediaEntry) => void;
  // Date footer emphasis. 'default' is the quiet footer date used everywhere;
  // 'prominent' is an opt-in loud date (used on the Profiles page, where the
  // date is what you're scanning for). Accent classes tint it to the context —
  // e.g. the profile's own accent color.
  dateEmphasis?: 'default' | 'prominent';
  dateAccentClass?: string; // text color, e.g. "text-blue-400"
  dateTintClass?: string;   // gradient bg, e.g. "from-blue-500/12 to-cyan-500/6"
  imagePriority?: CoverPriority;
  /** Host-page controls, shown as one row under the platinum and award chips. */
  topLeftActions?: React.ReactNode;
  onNavigateToParent?: (parentEntryId: number, parentName: string) => void;
}

function MediaCardDialogFallback() {
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>,
    document.body
  );
}

export const MediaCard = React.memo(function MediaCard({
  entry,
  onEdit,
  onDelete,
  onDuplicate,
  awards = [],
  profileKeys,
  dateEmphasis = 'default',
  dateAccentClass,
  dateTintClass,
  imagePriority = 'auto',
  topLeftActions,
  onNavigateToParent,
}: MediaCardProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState<MediaCardDialogKind | null>(null);
  const [dialogEntry, setDialogEntry] = useState<MediaEntry | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuDropdownRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const contextInfo = getContextInfo(entry);

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

  const getDetail = async (): Promise<MediaEntry> => {
    if (isEntryDetail(entry)) return entry;
    return await dbService.getEntryById(entry.id) ?? materializeSummary(entry);
  };

  const handleEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!onEdit) return;
    onEdit(await getDetail());
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

  const handleViewDescription = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setDialogEntry(await getDetail());
    setActiveDialog("details");
  };

  const handleViewImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setDialogEntry(materializeSummary(entry));
    setActiveDialog("image");
  };

  const handleFindDuplicates = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setDialogEntry(materializeSummary(entry));
    setActiveDialog("duplicates");
  };

  const openProfile = (profileType: string, name: string) => {
    const params = new URLSearchParams({ type: profileType, name });
    if (entry.year_completed) params.set('fromYear', String(entry.year_completed));
    if (entry.id) params.set('fromEntry', String(entry.id));
    if (entry.entry_type) params.set('fromType', entry.entry_type);
    navigate(`/profiles?${params.toString()}`);
  };

  // Parked beside the score ring, or in the corner when the entry is unscored
  // and has no ring.
  const hasScore = entry.review_score !== null && entry.review_score !== undefined;
  const menuAnchorClass = hasScore ? "top-[15px] right-[56px]" : "top-2.5 right-2.5";
  const menuButton = (
    <div
      className={cn("absolute z-20", menuAnchorClass)}
      ref={menuRef}
    >
      <button
        ref={menuButtonRef}
        onClick={handleMenuClick}
        className={cn(
          "w-7 h-7 flex items-center justify-center bg-black/50 backdrop-blur-sm border border-white/10 rounded-full transition-all hover:bg-black/70 hover:border-white/20 text-white/80 hover:text-white shadow-sm",
          menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
      >
        <MoreVertical size={14} />
      </button>
    </div>
  );

  const menuPortal = menuOpen && createPortal(
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
        onClick={async (e) => {
          e.stopPropagation();
          setMenuOpen(false);
          if (onDuplicate) onDuplicate(await getDetail());
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
  );

  return (
    <>
      <MediaCardPoster
        entry={entry}
        awards={awards}
        contextInfo={contextInfo}
        profileKeys={profileKeys}
        imagePriority={imagePriority}
        topLeftActions={topLeftActions}
        menu={menuButton}
        dateEmphasis={dateEmphasis}
        dateAccentClass={dateAccentClass}
        dateTintClass={dateTintClass}
        onOpenProfile={openProfile}
        onNavigateToParent={onNavigateToParent}
      />
      {menuPortal}
      {activeDialog && (
        <Suspense fallback={<MediaCardDialogFallback />}>
          <LazyMediaCardDialogs
            dialog={activeDialog}
            entry={dialogEntry ?? materializeSummary(entry)}
            onClose={() => {
              setActiveDialog(null);
              setDialogEntry(null);
            }}
            onConfirmDelete={confirmDelete}
          />
        </Suspense>
      )}
    </>
  );
});
