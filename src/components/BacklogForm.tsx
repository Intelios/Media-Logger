import { useState, useEffect, useRef } from "react";
import { X, Upload, Save, Sparkles, Image as ImageIcon } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { saveImage, getImageUrl, releaseImageUrl, getLocalFileBlobUrl } from "../lib/utils";
import { cn } from "../lib/utils_ui";
import { getVisibleEntryTypeOptions } from "../lib/media-config";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";
import type { BacklogItem } from "../lib/db";

interface BacklogFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string; entry_type: string; genre: string | null; image_url: string | null }) => void;
  initialData?: BacklogItem | null;
}

export function BacklogForm({ isOpen, onClose, onSave, initialData }: BacklogFormProps) {
  const [name, setName] = useState("");
  const [entryType, setEntryType] = useState("Movie");
  const [genre, setGenre] = useState("");
  const [previewImage, setPreviewImage] = useState("");
  const [rawImagePath, setRawImagePath] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  // Tracks a blob: URL created from a freshly picked file so we can revoke it
  // when it's replaced or the modal closes. Null when previewImage is either
  // empty or sourced from getImageUrl (which has its own ref-counted cache).
  const pickedPreviewUrlRef = useRef<string | null>(null);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  useEffect(() => {
    let cancelled = false;
    let acquiredImagePath: string | null = null;

    if (isOpen) {
      setRawImagePath(null);
      // Drop any blob URL held over from a previous pick; the preview is
      // about to be reset/replaced below.
      if (pickedPreviewUrlRef.current) {
        URL.revokeObjectURL(pickedPreviewUrlRef.current);
        pickedPreviewUrlRef.current = null;
      }
      if (initialData) {
        setName(initialData.name);
        setEntryType(initialData.entry_type);
        setGenre(initialData.genre || "");
        setExistingImageUrl(initialData.image_url);
        if (initialData.image_url) {
          const imagePath = initialData.image_url;
          getImageUrl(imagePath).then((url) => {
            if (cancelled) {
              releaseImageUrl(imagePath);
              return;
            }

            acquiredImagePath = imagePath;
            setPreviewImage(url);
          });
        } else {
          setPreviewImage("");
        }
      } else {
        setName("");
        setEntryType("Movie");
        setGenre("");
        setPreviewImage("");
        setExistingImageUrl(null);
      }
    }

    return () => {
      cancelled = true;
      releaseImageUrl(acquiredImagePath);
      // Revoke any picked-file blob URL still outstanding on unmount/close.
      if (pickedPreviewUrlRef.current) {
        URL.revokeObjectURL(pickedPreviewUrlRef.current);
        pickedPreviewUrlRef.current = null;
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
            const blobUrl = await getLocalFileBlobUrl(path);
            // Revoke the previous picked preview before installing the new one.
            if (pickedPreviewUrlRef.current) {
              URL.revokeObjectURL(pickedPreviewUrlRef.current);
            }
            pickedPreviewUrlRef.current = blobUrl;

            setRawImagePath(path);
            setPreviewImage(blobUrl);
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

      if (rawImagePath) {
        const savedPath = await saveImage(rawImagePath);
        if (savedPath) finalImageUrl = savedPath;
      }

      onSave({
        name: name.trim(),
        entry_type: entryType,
        genre: genre.trim() || null,
        image_url: finalImageUrl,
      });
    } catch (error) {
      console.error("Failed to save backlog item:", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-amber-500/10 to-orange-500/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
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
              className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-black/30 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-colors"
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
                    entryType === t.value
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                      : "bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10 hover:text-gray-300"
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
              className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-black/30 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-colors"
            />
          </div>

          {/* Image */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Cover Image</label>
            <div className="flex items-center gap-4">
              {previewImage ? (
                <div className="relative w-16 h-24 rounded-lg overflow-hidden border border-white/10 shadow-lg">
                  <img src={previewImage} alt="Cover" className="w-full h-full object-cover" />
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
                <span>{previewImage ? "Change Image" : "Choose Image"}</span>
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
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-lg hover:shadow-amber-500/25 hover:scale-[1.02] active:scale-[0.98]"
                  : "bg-gray-700 text-gray-500 cursor-not-allowed"
              )}
            >
              <Save size={14} />
              <span>{isSaving ? "Saving..." : initialData ? "Update" : "Add to Backlog"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
