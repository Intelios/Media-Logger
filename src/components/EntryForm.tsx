import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Upload, Save, Calendar as CalIcon, Sparkles, Tag, Star, Music, Book, Gamepad, FileText, StickyNote, Trophy, Check, Clock, RotateCcw, Captions } from "lucide-react";
import { open } from '@tauri-apps/plugin-dialog';
import type { MediaEntry, AutocompleteOptions } from "../lib/db";
import { dbService } from "../lib/db";
import { cn } from "../lib/utils_ui";
import { getReplayTerm, getVisibleEntryTypeOptions } from "../lib/media-config";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";
import { AutocompleteInput } from "./AutocompleteInput";
import {
  cancelCoverImport,
  commitCoverImport,
  stageCoverImport,
  type StagedCoverImport,
} from "../lib/image-service";
import { CoverImage } from "./CoverImage";

interface EntryFormProps {
  initialData?: MediaEntry | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<MediaEntry>) => void | Promise<void>;
}

export function EntryForm({ initialData, isOpen, onClose, onSave }: EntryFormProps) {
  const [formData, setFormData] = useState<Partial<MediaEntry>>({});
  const [previewImage, setPreviewImage] = useState<string>("");
  const [, setStagedCover] = useState<StagedCoverImport | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const stagedCoverRef = useRef<StagedCoverImport | null>(null);
  const [suggestions, setSuggestions] = useState<AutocompleteOptions>({
    platforms: [],
    franchises: [],
    series: [],
    authors: [],
    artists: [],
    directors: [],
    actresses: [],
    genres: [],
  });
  const modalRef = useRef<HTMLDivElement>(null);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  // Load lightweight autocomplete suggestions from the DB instead of fetching
  // the entire entries table.
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    dbService.getAutocompleteOptions()
      .then((options) => {
        if (!cancelled) {
          setSuggestions(options);
        }
      })
      .catch((error) => {
        console.error("Failed to load autocomplete options:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      stagedCoverRef.current = null;
      setStagedCover(null);

      if (initialData) {
        setFormData({
          ...initialData,
          is_rewatch: initialData.is_rewatch ?? 0,
          own_local_copy: initialData.own_local_copy ?? 0,
          has_subtitles: initialData.has_subtitles ?? 0,
          is_platinum: initialData.is_platinum ?? 0,
          is_completed: initialData.is_completed ?? 0,
          is_early_access: initialData.is_early_access ?? 0,
          early_access_version: initialData.early_access_version ?? null,
        });
        setPreviewImage("");
      } else {
        setFormData({
          entry_type: "Movie",
          review_score: null,
          is_rewatch: 0,
          own_local_copy: 0,
          has_subtitles: 0,
          is_platinum: 0,
          is_completed: 0,
          is_early_access: 0,
          early_access_version: null,
          completion_date: new Date().toISOString().split('T')[0]
        });
        setPreviewImage("");
      }
    }

    return () => {
      const staged = stagedCoverRef.current;
      stagedCoverRef.current = null;
      if (staged) {
        void cancelCoverImport(staged.token).catch((error) => {
          console.error('Failed to cancel staged cover:', error);
        });
      }
    };
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
          try {
            const nextStage = await stageCoverImport(path);
            const previous = stagedCoverRef.current;
            stagedCoverRef.current = nextStage;
            setStagedCover(nextStage);
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
    setIsSaving(true);

    try {
      let finalImageUrl = formData.image_url;

      if (stagedCoverRef.current) {
        const committed = await commitCoverImport(stagedCoverRef.current.token);
        stagedCoverRef.current = null;
        setStagedCover(null);
        finalImageUrl = committed.imagePath;
      }

      let yearCompleted = formData.year_completed;
      if (formData.completion_date) {
        yearCompleted = parseInt(formData.completion_date.split('-')[0]);
      }

      await onSave({
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

      // Platform, Franchise, Platinum, and Early Access apply only to games.
      if (key === "entry_type" && value !== "Game") {
        next.platform = null;
        next.franchise = null;
        next.is_platinum = 0;
        next.is_early_access = 0;
        next.early_access_version = null;
      }

      // Completed and Update Version apply only to Adult Visual Novels.
      if (key === "entry_type" && value !== "Adult Visual Novel") {
        next.is_completed = 0;
        next.update_version = null;
      }

      // Series applies only to Show, K-Drama, and Anime.
      if (key === "entry_type" && !["Show", "K-Drama", "Anime"].includes(value as string)) {
        next.series = null;
      }

      // Author applies only to books.
      if (key === "entry_type" && value !== "Book") {
        next.author = null;
      }

      // Artist applies only to albums.
      if (key === "entry_type" && value !== "Album") {
        next.artist = null;
      }

      // Studio (director) and Actress apply only to JAV.
      if (key === "entry_type" && value !== "JAV") {
        next.director = null;
        next.actress = null;
      }

      return next;
    });
  };

  if (!isOpen) return null;

const typeOption = getVisibleEntryTypeOptions().find(o => o.value === formData.entry_type);

  const scoreColor = (score: number) => {
    if (score >= 9) return "text-emerald-400";
    if (score >= 7) return "text-blue-400";
    if (score >= 5) return "text-yellow-400";
    return "text-red-400";
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div
        ref={modalRef}
        className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-white/10 w-full max-w-5xl rounded-3xl shadow-2xl shadow-primary/10 overflow-hidden max-h-[90vh] flex flex-row"
      >
        {/* LEFT COLUMN — Cover + Summary */}
        <div className="w-[300px] min-w-[260px] flex-shrink-0 border-r border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent flex flex-col overflow-hidden">
          <div className="p-5 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">
              {initialData?.id ? "Edit Entry" : "Add New Entry"}
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
            <div
              onClick={handleImagePick}
              className="group relative w-full aspect-[2/3] bg-white/5 border border-dashed border-white/20 rounded-xl overflow-hidden cursor-pointer hover:border-primary/50 transition-all"
            >
              {previewImage || formData.image_url ? (
                <>
                  {previewImage ? (
                    <img src={previewImage} className="w-full h-full object-cover" alt="Preview" />
                  ) : (
                    <CoverImage
                      path={formData.image_url}
                      alt="Preview"
                      variant="card"
                      priority="high"
                      sizes="300px"
                      containerClassName="h-full w-full"
                      imageClassName="h-full w-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white">
                    <Upload size={24} />
                    <span className="text-xs font-medium">Change Image</span>
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 group-hover:text-primary transition-colors">
                  <Upload size={32} className="mb-2" />
                  <span className="text-xs font-medium">Click to upload</span>
                  <span className="text-[10px] mt-0.5">PNG, JPG, WebP</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-white font-semibold text-sm line-clamp-2 leading-snug">
                  {formData.name || "Untitled"}
                </p>
                {formData.entry_type && (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/15 text-primary text-xs font-medium border border-primary/20">
                    {typeOption?.icon}
                    <span>{formData.entry_type}</span>
                  </div>
                )}
              </div>

              {formData.review_score !== null && formData.review_score !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Star size={14} className={cn("fill-current", scoreColor(formData.review_score))} />
                  <span className={cn("text-sm font-bold", scoreColor(formData.review_score))}>
                    {formData.review_score}
                  </span>
                  <span className="text-xs text-gray-500">/10</span>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {formData.is_rewatch === 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 font-medium">{getReplayTerm(formData.entry_type).label}</span>
                )}
                {formData.own_local_copy === 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-medium">Own Copy</span>
                )}
                {formData.has_subtitles === 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 border border-orange-500/25 font-medium">Subtitles</span>
                )}
                {formData.is_platinum === 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25 font-medium">Platinum</span>
                )}
                {formData.is_early_access === 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/25 font-medium">Early Access</span>
                )}
                {formData.is_completed === 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-medium">Completed</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — Form Fields */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-end px-5 py-4 border-b border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-5">
              {/* Title */}
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

              {/* Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {getVisibleEntryTypeOptions().map(type => (
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

              {/* Date + Score side by side */}
              <div className="grid grid-cols-2 gap-4">
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
                          "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
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
                </div>
              </div>

              {/* Type-specific fields */}
              {formData.entry_type === "Game" && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                      <Gamepad size={14} className="text-purple-400" />
                      Platform
                    </label>
                    <AutocompleteInput
                      value={formData.platform || ""}
                      onChange={v => updateField("platform", v)}
                      suggestions={suggestions.platforms}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      placeholder="PC, PS5, Switch..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                      <Sparkles size={14} className="text-indigo-400" />
                      Franchise
                    </label>
                    <AutocompleteInput
                      value={formData.franchise || ""}
                      onChange={v => updateField("franchise", v)}
                      suggestions={suggestions.franchises}
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
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                      <Clock size={14} className="text-violet-400" />
                      Early Access
                    </label>
                    <button
                      type="button"
                      onClick={() => updateField("is_early_access", formData.is_early_access === 1 ? 0 : 1)}
                      className={cn(
                        "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all border",
                        formData.is_early_access === 1
                          ? "bg-violet-500/20 border-violet-500 text-violet-400 shadow-lg shadow-violet-500/20"
                          : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <Clock size={16} />
                      <span>{formData.is_early_access === 1 ? "Early Access" : "Mark as Early Access"}</span>
                    </button>
                    <p className="text-xs text-gray-500">Use this for games that are still in development or early access.</p>
                    {formData.is_early_access === 1 && (
                      <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                        <label className="text-xs font-medium text-gray-400 mb-1.5 block">Version / Build / Date</label>
                        <input
                          type="text"
                          value={formData.early_access_version || ""}
                          onChange={e => updateField("early_access_version", e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none transition-all"
                          placeholder="e.g. v0.9.2, Build 1423, Jan 2026..."
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {formData.entry_type === "Book" && (
                <div className="space-y-2 animate-in fade-in duration-300">
                  <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <Book size={14} className="text-amber-400" />
                    Author
                  </label>
                  <AutocompleteInput
                    value={formData.author || ""}
                    onChange={v => updateField("author", v)}
                    suggestions={suggestions.authors}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    placeholder="Author name..."
                  />
                </div>
              )}

              {["Show", "K-Drama", "Anime"].includes(formData.entry_type || "") && (
                <div className="space-y-2 animate-in fade-in duration-300">
                  <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <Sparkles size={14} className="text-teal-400" />
                    Series
                  </label>
                  <AutocompleteInput
                    value={formData.series || ""}
                    onChange={v => updateField("series", v)}
                    suggestions={suggestions.series}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    placeholder="Breaking Bad, Stranger Things, One Piece..."
                  />
                </div>
              )}

              {formData.entry_type === "Album" && (
                <div className="space-y-2 animate-in fade-in duration-300">
                  <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <Music size={14} className="text-emerald-400" />
                    Artist
                  </label>
                  <AutocompleteInput
                    value={formData.artist || ""}
                    onChange={v => updateField("artist", v)}
                    suggestions={suggestions.artists}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    placeholder="Artist name..."
                  />
                </div>
              )}

              {formData.entry_type === "JAV" && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Studio</label>
                    <AutocompleteInput
                      value={formData.director || ""}
                      onChange={v => updateField("director", v)}
                      suggestions={suggestions.directors}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      placeholder="Studio name..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Actress</label>
                    <AutocompleteInput
                      value={formData.actress || ""}
                      onChange={v => updateField("actress", v)}
                      suggestions={suggestions.actresses}
                      multiValue
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      placeholder="Actress name..."
                    />
                  </div>
                </div>
              )}

              {formData.entry_type === "Adult Visual Novel" && (
                <div className="space-y-4 animate-in fade-in duration-300">
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
                <AutocompleteInput
                  value={formData.genre || ""}
                  onChange={v => updateField("genre", v)}
                  suggestions={suggestions.genres}
                  multiValue
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

              {/* Global Toggles */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => updateField("is_rewatch", formData.is_rewatch === 1 ? 0 : 1)}
                  className={cn(
                    "flex items-center justify-center gap-2 px-3 py-3 rounded-xl font-medium transition-all border",
                    formData.is_rewatch === 1
                      ? "bg-amber-500/20 border-amber-500 text-amber-400"
                      : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                  )}
                >
                  <RotateCcw size={16} />
                  <span>{getReplayTerm(formData.entry_type).label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateField("own_local_copy", formData.own_local_copy === 1 ? 0 : 1)}
                  className={cn(
                    "flex items-center justify-center gap-2 px-3 py-3 rounded-xl font-medium transition-all border",
                    formData.own_local_copy === 1
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                      : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                  )}
                >
                  <Save size={16} />
                  <span>Own Copy</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateField("has_subtitles", formData.has_subtitles === 1 ? 0 : 1)}
                  className={cn(
                    "flex items-center justify-center gap-2 px-3 py-3 rounded-xl font-medium transition-all border",
                    formData.has_subtitles === 1
                      ? "bg-orange-500/20 border-orange-500 text-orange-400"
                      : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                  )}
                >
                  <Captions size={16} />
                  <span>Subtitles</span>
                </button>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-white/5 bg-black/20 flex justify-end gap-3 flex-shrink-0">
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
    </div>,
    document.body
  );
}
