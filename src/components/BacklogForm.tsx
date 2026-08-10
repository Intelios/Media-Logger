import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Upload, Save, Sparkles, Image as ImageIcon, CalendarClock } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { cn } from "../lib/utils_ui";
import { getVisibleEntryTypeOptions } from "../lib/media-config";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";
import type { BacklogItem } from "../lib/db";
import {
  cancelCoverImport,
  commitCoverImport,
  stageCoverImport,
  type StagedCoverImport,
} from "../lib/image-service";
import { CoverImage } from "./CoverImage";

interface BacklogFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string; entry_type: string; genre: string | null; image_url: string | null; release_date: string | null; is_unreleased: boolean }) => void | Promise<void>;
  initialData?: BacklogItem | null;
}

export function BacklogForm({ isOpen, onClose, onSave, initialData }: BacklogFormProps) {
  const [name, setName] = useState("");
  const [entryType, setEntryType] = useState("Movie");
  const [genre, setGenre] = useState("");
  const [isUnreleased, setIsUnreleased] = useState(false);
  const [releaseDate, setReleaseDate] = useState("");
  const [previewImage, setPreviewImage] = useState("");
  const stagedCoverRef = useRef<StagedCoverImport | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  useEffect(() => {
    if (isOpen) {
      stagedCoverRef.current = null;
      if (initialData) {
        setName(initialData.name);
        setEntryType(initialData.entry_type);
        setGenre(initialData.genre || "");
        setIsUnreleased(initialData.status === 'unreleased');
        setReleaseDate(initialData.release_date || "");
        setExistingImageUrl(initialData.image_url);
        setPreviewImage("");
      } else {
        setName("");
        setEntryType("Movie");
        setGenre("");
        setIsUnreleased(false);
        setReleaseDate("");
        setPreviewImage("");
        setExistingImageUrl(null);
      }
    }

    return () => {
      const staged = stagedCoverRef.current;
      stagedCoverRef.current = null;
      if (staged) {
        void cancelCoverImport(staged.token).catch((error) => {
          console.error('Failed to cancel staged backlog cover:', error);
        });
      }
    };
  }, [isOpen, initialData]);

  const handleImagePick = async () => {
    try {
      const file = await open({
        multiple: false,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
      });
      if (file) {
        const path = file as string;
        if (path) {
          try {
            const nextStage = await stageCoverImport(path);
            const previous = stagedCoverRef.current;
            stagedCoverRef.current = nextStage;
            setPreviewImage(nextStage.previewUrl);
            if (previous) void cancelCoverImport(previous.token);
          } catch (err) {
            console.error("Failed to load preview for picked image:", err);
          }
        }
      }
    } catch (e) {
      console.error("Dialog failed:", e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      let finalImageUrl = existingImageUrl;

      if (stagedCoverRef.current) {
        const committed = await commitCoverImport(stagedCoverRef.current.token);
        stagedCoverRef.current = null;
        finalImageUrl = committed.imagePath;
      }

      await onSave({
        name: name.trim(),
        entry_type: entryType,
        genre: genre.trim() || null,
        image_url: finalImageUrl,
        release_date: isUnreleased ? (releaseDate || null) : null,
        is_unreleased: isUnreleased,
      });
    } catch (error) {
      console.error("Failed to save backlog item:", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  // Portalled to <body> so a parent's `space-y-*` margin can't offset the
  // fixed overlay — see the note in EntryForm.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-white/10"
          style={{
            background: `linear-gradient(to right, color-mix(in srgb, var(--color-primary) 12%, transparent), color-mix(in srgb, var(--color-secondary) 8%, transparent))`,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
              style={{
                background: `linear-gradient(to bottom right, var(--color-primary), var(--color-secondary))`,
                boxShadow: `0 10px 15px -3px color-mix(in srgb, var(--color-primary) 20%, transparent)`,
              }}
            >
              <Sparkles size={18} className="text-white" />
            </div>
            <h2 className="text-lg font-bold text-white">
              {initialData ? "Edit Backlog Item" : "Add to Backlog"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Title</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="What do you want to watch, play, or read?"
              className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-black/30 text-white placeholder-gray-500 themed-field focus:outline-none transition-colors"
              autoFocus
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Type</label>
            <div className="flex flex-wrap gap-1.5">
              {getVisibleEntryTypeOptions().map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setEntryType(t.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                    "border",
                    entryType === t.value
                      ? "themed-chip-active"
                      : "bg-white/5 text-gray-400 border-white/5 hover:bg-white/10 hover:text-gray-300"
                  )}
                >
                  {t.icon}
                  <span>{t.value}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Genre */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Genre</label>
            <input
              type="text"
              value={genre}
              onChange={e => setGenre(e.target.value)}
              placeholder="Action, RPG, Drama... (comma-separated)"
              className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-black/30 text-white placeholder-gray-500 themed-field focus:outline-none transition-colors"
            />
          </div>

          {/* Unreleased toggle + optional release date */}
          <div>
            <button
              type="button"
              onClick={() => setIsUnreleased(v => !v)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                isUnreleased
                  ? "bg-sky-500/20 text-sky-400 border-sky-500/40"
                  : "bg-white/5 text-gray-400 border-white/5 hover:bg-white/10 hover:text-gray-300"
              )}
            >
              <CalendarClock size={14} />
              <span>Not released yet</span>
            </button>
            {isUnreleased && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Release Date <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  type="date"
                  value={releaseDate}
                  onChange={e => setReleaseDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-black/30 text-white focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30 transition-colors"
                />
              </div>
            )}
          </div>

          {/* Image */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Cover Image</label>
            <div className="flex items-center gap-4">
              {previewImage || existingImageUrl ? (
                <div className="relative w-16 h-24 rounded-lg overflow-hidden border border-white/10 shadow-lg">
                  {previewImage ? (
                    <img src={previewImage} alt="Cover" className="w-full h-full object-cover" />
                  ) : (
                    <CoverImage
                      path={existingImageUrl}
                      alt="Cover"
                      variant="small"
                      priority="high"
                      sizes="64px"
                      containerClassName="h-full w-full"
                      imageClassName="h-full w-full object-cover"
                    />
                  )}
                </div>
              ) : (
                <div className="w-16 h-24 rounded-lg border border-dashed border-white/20 flex items-center justify-center"
                  style={{ backgroundColor: "var(--color-background)" }}
                >
                  <ImageIcon size={20} className="text-gray-600" />
                </div>
              )}
              <button
                type="button"
                onClick={handleImagePick}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Upload size={14} />
                <span>{previewImage || existingImageUrl ? "Change Image" : "Choose Image"}</span>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSaving}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all",
                name.trim() && !isSaving
                  ? "themed-cta text-white hover:scale-[1.02] active:scale-[0.98]"
                  : "bg-gray-700 text-gray-500 cursor-not-allowed"
              )}
            >
              <Save size={14} />
              <span>{isSaving ? "Saving..." : initialData ? "Update" : "Add to Backlog"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
