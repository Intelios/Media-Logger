import * as React from "react";
import { Suspense, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { Monitor, Disc3, BookOpen, Gamepad2, Film, Heart, Check, Pencil, Trash2, FileText, Image as ImageIcon, Copy, CopyPlus, Crop } from "lucide-react";
import { dbService, type EntryCardSummary, type MediaEntry } from "../lib/db";
import type { CoverPriority } from "./CoverImage";
import { MediaCardPoster } from "./MediaCardPoster";
import type { MediaCardDialogKind } from "./MediaCardDialogs";
import type { PosterMenuAction } from "./PosterActionSheet";

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
  const contextInfo = getContextInfo(entry);

  // Stable, so the sheet's open effect only runs when it actually opens.
  const handleMenuOpenChange = useCallback((open: boolean) => {
    // Warm the dialogs chunk while the user is still choosing.
    if (open) void loadMediaCardDialogs();
    setMenuOpen(open);
  }, []);

  const getDetail = async (): Promise<MediaEntry> => {
    if (isEntryDetail(entry)) return entry;
    return await dbService.getEntryById(entry.id) ?? materializeSummary(entry);
  };

  const confirmDelete = () => {
    if (entry.id) {
      onDelete?.(entry.id);
    }
  };

  const openDialog = (kind: MediaCardDialogKind) => {
    setDialogEntry(materializeSummary(entry));
    setActiveDialog(kind);
  };

  // The sheet closes itself before running an action.
  const actions: PosterMenuAction[] = [
    {
      id: "details",
      label: "View Details",
      shortLabel: "Details",
      icon: <FileText size={17} />,
      onSelect: () => {
        void getDetail().then((detail) => {
          setDialogEntry(detail);
          setActiveDialog("details");
        });
      },
    },
    { id: "image", label: "View Image", shortLabel: "Image", icon: <ImageIcon size={17} />, onSelect: () => openDialog("image") },
    ...(entry.image_url
      ? [{ id: "cover", label: "Adjust Cover", shortLabel: "Frame", icon: <Crop size={17} />, onSelect: () => openDialog("cover") }]
      : []),
    {
      id: "edit",
      label: "Edit",
      shortLabel: "Edit",
      icon: <Pencil size={17} />,
      onSelect: () => {
        if (onEdit) void getDetail().then(onEdit);
      },
    },
    {
      id: "duplicate",
      label: "Duplicate",
      shortLabel: "Duplicate",
      icon: <CopyPlus size={17} />,
      onSelect: () => {
        if (onDuplicate) void getDetail().then(onDuplicate);
      },
    },
    { id: "find-duplicates", label: "Find Duplicates", shortLabel: "Find Dupes", icon: <Copy size={17} />, onSelect: () => openDialog("duplicates") },
    { id: "delete", label: "Delete", shortLabel: "Delete", icon: <Trash2 size={14} />, onSelect: () => setActiveDialog("delete"), tone: "danger" },
  ];

  const openProfile = (profileType: string, name: string) => {
    const params = new URLSearchParams({ type: profileType, name });
    if (entry.year_completed) params.set('fromYear', String(entry.year_completed));
    if (entry.id) params.set('fromEntry', String(entry.id));
    if (entry.entry_type) params.set('fromType', entry.entry_type);
    navigate(`/profiles?${params.toString()}`);
  };

  return (
    <>
      <MediaCardPoster
        entry={entry}
        awards={awards}
        contextInfo={contextInfo}
        profileKeys={profileKeys}
        imagePriority={imagePriority}
        topLeftActions={topLeftActions}
        actions={actions}
        menuOpen={menuOpen}
        onMenuOpenChange={handleMenuOpenChange}
        dateEmphasis={dateEmphasis}
        dateAccentClass={dateAccentClass}
        dateTintClass={dateTintClass}
        onOpenProfile={openProfile}
        onNavigateToParent={onNavigateToParent}
      />
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
