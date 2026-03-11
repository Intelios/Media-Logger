import { useState, useEffect, useRef } from "react";
import { X, Upload, Save, Calendar as CalIcon, Sparkles, Image as ImageIcon, Tag, Star, Music, Book, Gamepad, Film, FileText, StickyNote, Trophy, Check } from "lucide-react";
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { saveImage, getImageUrl } from "../lib/utils";
import type { MediaEntry } from "../lib/db";
import { cn } from "../lib/utils_ui";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";

interface EntryFormProps {
  initialData?: MediaEntry | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<MediaEntry>) => void;
}

const ENTRY_TYPES = [
  { value: "Movie", icon: <Film size={14} /> },
  { value: "Show", icon: <Film size={14} /> },
  { value: "Anime", icon: <Sparkles size={14} /> },
  { value: "Book", icon: <Book size={14} /> },
  { value: "Album", icon: <Music size={14} /> },
  { value: "K-Drama", icon: <Film size={14} /> },
  { value: "JAV", icon: <Star size={14} /> },
  { value: "Hentai", icon: <Star size={14} /> },
  { value: "Game", icon: <Gamepad size={14} /> },
  { value: "Adult Visual Novel", icon: <Gamepad size={14} /> },
  { value: "Other", icon: <Tag size={14} /> },
];

type TabId = "basic" | "details" | "media";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "basic", label: "Basic Info", icon: <Tag size={15} /> },
  { id: "details", label: "Details", icon: <Sparkles size={15} /> },
  { id: "media", label: "Media", icon: <ImageIcon size={15} /> },
];

export function EntryForm({ initialData, isOpen, onClose, onSave }: EntryFormProps) {
  const [formData, setFormData] = useState<Partial<MediaEntry>>({});
  const [previewImage, setPreviewImage] = useState<string>("");
  const [rawImagePath, setRawImagePath] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("basic");
  const modalRef = useRef<HTMLDivElement>(null);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  useEffect(() => {
    if (isOpen) {
      setRawImagePath(null);
      setActiveTab("basic");

      if (initialData) {
        setFormData({
          ...initialData,
          is_rewatch: initialData.is_rewatch ?? 0,
          own_local_copy: initialData.own_local_copy ?? 0,
          is_platinum: initialData.is_platinum ?? 0,
          is_completed: initialData.is_completed ?? 0,
        });
        if (initialData.image_url) {
          getImageUrl(initialData.image_url).then(setPreviewImage);
        } else {
          setPreviewImage("");
        }
      } else {
        setFormData({
          entry_type: "Movie",
          review_score: null,
          is_rewatch: 0,
          own_local_copy: 0,
          is_platinum: 0,
          is_completed: 0,
          completion_date: new Date().toISOString().split('T')[0]
        });
        setPreviewImage("");
      }
    }
  }, [isOpen, initialData]);

  const handleImagePick = async () => {
    try {
      const file = await open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
      });

      if (file) {
        const path = file as string;
        if (path) {
          setRawImagePath(path);
          setFormData({ ...formData, image_url: path });
          setPreviewImage(convertFileSrc(path));
        }
      }
    } catch (e) {
      console.error("Dialog failed:", e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      let finalImageUrl = formData.image_url;

      if (rawImagePath) {
        const savedPath = await saveImage(rawImagePath);
        if (savedPath) finalImageUrl = savedPath;
      }

      let yearCompleted = formData.year_completed;
      if (formData.completion_date) {
        yearCompleted = parseInt(formData.completion_date.split('-')[0]);
      }

      onSave({
        ...formData,
        image_url: finalImageUrl,
        year_completed: yearCompleted
      });
      onClose();
    } catch (err) {
      console.error("Error in submit:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = (key: keyof MediaEntry, value: unknown) => {
    setFormData(prev => {
      const next = { ...prev, [key]: value } as Partial<MediaEntry>;

      // Platinum applies only to games.
      if (key === "entry_type" && value !== "Game") {
        next.is_platinum = 0;
      }

      // Completed applies only to Adult Visual Novels.
      if (key === "entry_type" && value !== "Adult Visual Novel") {
        next.is_completed = 0;
      }

      return next;
    });
  };

  if (!isOpen) return null;

  const renderBasicTab = () => (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Title Input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <Tag size={14} className="text-primary" />
          Title
        </label>
        <input
          required
          type="text"
          value={formData.name || ""}
          onChange={e => updateField("name", e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
          placeholder="Enter title..."
        />
      </div>

      {/* Type Selection Grid */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-300">Type</label>
        <div className="grid grid-cols-3 gap-2">
          {ENTRY_TYPES.map(type => (
            <button
              key={type.value}
              type="button"
              onClick={() => updateField("entry_type", type.value)}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border",
                formData.entry_type === type.value
                  ? "bg-primary/20 border-primary text-primary shadow-lg shadow-primary/10"
                  : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
              )}
            >
              {type.icon}
              <span className="truncate">{type.value}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Date Input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <CalIcon size={14} className="text-primary" />
          Completion Date
        </label>
        <input
          type="date"
          value={formData.completion_date || ""}
          onChange={e => updateField("completion_date", e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
        />
      </div>

      {/* Score Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <Star size={14} className="text-primary" />
          Rating
        </label>
        <div className="flex gap-1">
          {[...Array(11)].map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => updateField("review_score", formData.review_score === i ? null : i)}
              className={cn(
                "flex-1 py-2.5 rounded-lg text-sm font-bold transition-all",
                formData.review_score === i
                  ? i >= 9 ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                    : i >= 7 ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30"
                      : i >= 5 ? "bg-yellow-500 text-white shadow-lg shadow-yellow-500/30"
                        : "bg-red-500 text-white shadow-lg shadow-red-500/30"
                  : "bg-white/5 text-gray-500 hover:bg-white/10 hover:text-white"
              )}
            >
              {i}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 text-center">
          {formData.review_score !== null && formData.review_score !== undefined
            ? `Score: ${formData.review_score}/10`
            : "Click to select a score"}
        </p>
      </div>
    </div>
  );

  const renderDetailsTab = () => (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Conditional Fields Based on Type */}
      {formData.entry_type === 'Game' && (
        <>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <Gamepad size={14} className="text-purple-400" />
              Platform
            </label>
            <input
              type="text"
              value={formData.platform || ""}
              onChange={e => updateField("platform", e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              placeholder="PC, PS5, Switch..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <Sparkles size={14} className="text-indigo-400" />
              Franchise
            </label>
            <input
              type="text"
              value={formData.franchise || ""}
              onChange={e => updateField("franchise", e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              placeholder="Zelda, Mario, Final Fantasy..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <Trophy size={14} className="text-amber-400" />
              Completion Badge
            </label>
            <button
              type="button"
              onClick={() => updateField("is_platinum", formData.is_platinum === 1 ? 0 : 1)}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all border",
                formData.is_platinum === 1
                  ? "bg-gradient-to-r from-amber-500/25 to-cyan-500/25 border-amber-400/80 text-amber-300 shadow-lg shadow-amber-500/20"
                  : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
              )}
            >
              <Trophy size={16} />
              <span>{formData.is_platinum === 1 ? "Platinum / 100% Complete" : "Mark as Platinum / 100%"}</span>
            </button>
            <p className="text-xs text-gray-500">Use this for games you fully completed (Platinum / 100%).</p>
          </div>
        </>
      )}

      {formData.entry_type === 'Book' && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Book size={14} className="text-amber-400" />
            Author
          </label>
          <input
            type="text"
            value={formData.author || ""}
            onChange={e => updateField("author", e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            placeholder="Author name..."
          />
        </div>
      )}

      {formData.entry_type === 'Album' && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Music size={14} className="text-emerald-400" />
            Artist
          </label>
          <input
            type="text"
            value={formData.artist || ""}
            onChange={e => updateField("artist", e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            placeholder="Artist name..."
          />
        </div>
      )}

      {formData.entry_type === 'JAV' && (
        <>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Studio</label>
            <input
              type="text"
              value={formData.director || ""}
              onChange={e => updateField("director", e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              placeholder="Studio name..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Actress</label>
            <input
              type="text"
              value={formData.actress || ""}
              onChange={e => updateField("actress", e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              placeholder="Actress name..."
            />
          </div>
        </>
      )}

      {formData.entry_type === 'Adult Visual Novel' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Version / Update</label>
            <input
              type="text"
              value={formData.update_version || ""}
              onChange={e => updateField("update_version", e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              placeholder="v1.0, Update 5..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <Check size={14} className="text-emerald-400" />
              Completion Status
            </label>
            <button
              type="button"
              onClick={() => updateField("is_completed", formData.is_completed === 1 ? 0 : 1)}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all border",
                formData.is_completed === 1
                  ? "bg-gradient-to-r from-emerald-500/25 to-teal-500/25 border-emerald-400/80 text-emerald-300 shadow-lg shadow-emerald-500/20"
                  : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
              )}
            >
              <Check size={16} />
              <span>{formData.is_completed === 1 ? "Completed" : "Mark as Completed"}</span>
            </button>
            <p className="text-xs text-gray-500">Signifies the visual novel is fully complete and not a work in progress.</p>
          </div>
        </div>
      )}

      {/* Genre */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <Tag size={14} className="text-primary" />
          Genre
        </label>
        <input
          type="text"
          value={formData.genre || ""}
          onChange={e => updateField("genre", e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
          placeholder="Action, Sci-Fi, Drama..."
        />
        <p className="text-xs text-gray-500">Separate multiple genres with commas</p>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <FileText size={14} className="text-primary" />
          Description
        </label>
        <textarea
          value={formData.description || ""}
          onChange={e => updateField("description", e.target.value)}
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all resize-none"
          placeholder="Summary or details about this entry..."
        />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <StickyNote size={14} className="text-amber-400" />
          Notes
        </label>
        <textarea
          value={formData.notes || ""}
          onChange={e => updateField("notes", e.target.value)}
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition-all resize-none"
          placeholder="Your personal thoughts or notes..."
        />
      </div>

      {/* Toggle Options */}
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => updateField("is_rewatch", formData.is_rewatch === 1 ? 0 : 1)}
          className={cn(
            "flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all border",
            formData.is_rewatch === 1
              ? "bg-amber-500/20 border-amber-500 text-amber-400"
              : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
          )}
        >
          <span>🔄</span>
          <span>Rewatch</span>
        </button>
        <button
          type="button"
          onClick={() => updateField("own_local_copy", formData.own_local_copy === 1 ? 0 : 1)}
          className={cn(
            "flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all border",
            formData.own_local_copy === 1
              ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
              : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
          )}
        >
          <span>💾</span>
          <span>Own Copy</span>
        </button>
      </div>
    </div>
  );

  const renderMediaTab = () => (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Image Upload */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <ImageIcon size={14} className="text-primary" />
          Cover Image
        </label>
        <div
          onClick={handleImagePick}
          className="group relative w-full aspect-[2/3] bg-white/5 border-2 border-dashed border-white/20 rounded-2xl overflow-hidden cursor-pointer hover:border-primary/50 transition-all"
        >
          {previewImage ? (
            <>
              <img
                src={previewImage}
                className="w-full h-full object-cover"
                alt="Preview"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-white">
                  <Upload size={32} />
                  <span className="font-medium">Change Image</span>
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 group-hover:text-primary transition-colors">
              <Upload size={48} className="mb-3" />
              <span className="font-medium">Click to upload</span>
              <span className="text-xs mt-1">PNG, JPG, WebP supported</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      {/* Modal Container */}
      <div
        ref={modalRef}
        className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-white/10 w-full max-w-2xl rounded-3xl shadow-2xl shadow-primary/10 overflow-hidden max-h-[90vh] flex flex-col"
      >

        {/* Header with Preview */}
        <div className="relative bg-gradient-to-r from-primary/20 via-purple-500/10 to-transparent p-6 border-b border-white/5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {/* Mini Preview */}
              {previewImage && (
                <div className="w-14 h-20 rounded-xl overflow-hidden border border-white/20 shadow-lg">
                  <img src={previewImage} className="w-full h-full object-cover" alt="" />
                </div>
              )}
              <div>
                <h3 className="text-xl font-bold text-white">
                  {initialData ? "Edit Entry" : "Add New Entry"}
                </h3>
                <p className="text-gray-400 text-sm mt-0.5 line-clamp-1">
                  {formData.name || "Untitled"}
                  {formData.entry_type && <span className="text-primary ml-2">• {formData.entry_type}</span>}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 py-3 border-b border-white/5 bg-black/20">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                activeTab === tab.id
                  ? "bg-primary text-white shadow-lg shadow-primary/25"
                  : "text-gray-400 hover:bg-white/5 hover:text-white"
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
            {activeTab === "basic" && renderBasicTab()}
            {activeTab === "details" && renderDetailsTab()}
            {activeTab === "media" && renderMediaTab()}
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-white/5 bg-black/20 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-medium text-gray-400 hover:bg-white/5 hover:text-white transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !formData.name}
              className={cn(
                "px-6 py-2.5 rounded-xl font-bold bg-gradient-to-r from-primary to-purple-500 text-white shadow-lg shadow-primary/25 flex items-center gap-2 transition-all",
                (isSaving || !formData.name) ? "opacity-50 cursor-not-allowed" : "hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02]"
              )}
            >
              <Save size={18} />
              {isSaving ? "Saving..." : "Save Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
