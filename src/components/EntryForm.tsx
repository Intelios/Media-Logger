import { useState, useEffect } from "react";
import { X, Upload, Save, Calendar as CalIcon } from "lucide-react";
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { saveImage, getImageUrl } from "../lib/utils"; // Import getImageUrl
import type { MediaEntry } from "../lib/db";

interface EntryFormProps {
  initialData?: MediaEntry | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<MediaEntry>) => void;
}

const ENTRY_TYPES = [
  "Movie", "Show", "Anime", "Book", "Album", "K-Drama", 
  "JAV", "Hentai", "Game", "Adult Visual Novel", "Other"
];

export function EntryForm({ initialData, isOpen, onClose, onSave }: EntryFormProps) {
  const [formData, setFormData] = useState<Partial<MediaEntry>>({});
  const [previewImage, setPreviewImage] = useState<string>("");
  
  // NEW: Specific state to hold the raw path selected from file picker
  const [rawImagePath, setRawImagePath] = useState<string | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRawImagePath(null); // Reset raw path
      
      if (initialData) {
        setFormData(initialData);
        // Load existing image for preview
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
      
      console.log("Dialog result raw:", file); // <--- Add this

      if (file) {
        // In v2, if multiple: false, it might return the file object directly OR the path string depending on the exact beta version.
        // Let's handle both possibilities safely.
        const path = typeof file === 'string' ? file : file.path;
        
        console.log("Extracted path:", path); 

        if (path) {
          setRawImagePath(path);
          setFormData({ ...formData, image_url: path });
          // Note: convertFileSrc expects a string path
          setPreviewImage(convertFileSrc(path));
        } else {
            console.error("Path was undefined on file object:", file);
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

      // ONLY save if we have a new raw path from the picker
      if (rawImagePath) {
        console.log("Attempting to save image from:", rawImagePath);
        const savedPath = await saveImage(rawImagePath);
        if (savedPath) {
            finalImageUrl = savedPath;
            console.log("Image saved as:", finalImageUrl);
        }
      }

      // Prepare year from date
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-white/10 w-full max-w-4xl rounded-2xl shadow-2xl flex overflow-hidden max-h-[90vh]">
        
        {/* Left Side: Preview */}
        <div className="w-1/3 bg-black/30 relative hidden md:block">
          {previewImage ? (
            <img 
              src={previewImage} 
              className="w-full h-full object-cover opacity-60" 
              alt="Preview" 
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600">
              No Image
            </div>
          )}
          <div className="absolute bottom-0 left-0 p-6 bg-gradient-to-t from-black to-transparent w-full">
            <h2 className="text-2xl font-bold text-white line-clamp-2">{formData.name || "New Entry"}</h2>
            <p className="text-primary font-medium">{formData.entry_type}</p>
          </div>
        </div>

        {/* Right Side: Form */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-w-0">
          <div className="p-6 border-b border-white/5 flex justify-between items-center">
            <h3 className="text-xl font-bold">
              {initialData ? "Edit Entry" : "Add New Entry"}
            </h3>
            <button type="button" onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
            
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Title</label>
                <input 
                  required
                  type="text" 
                  value={formData.name || ""} 
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-primary focus:outline-none transition-colors"
                  placeholder="Enter title..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Type</label>
                  <select 
                    value={formData.entry_type || "Movie"}
                    onChange={e => setFormData({...formData, entry_type: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-primary outline-none appearance-none"
                  >
                    {ENTRY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Date</label>
                  <div className="relative">
                    <input 
                      type="date" 
                      value={formData.completion_date || ""}
                      onChange={e => setFormData({...formData, completion_date: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-primary outline-none"
                    />
                    <CalIcon className="absolute right-3 top-3 text-gray-500 pointer-events-none" size={18} />
                  </div>
                </div>
              </div>
            </div>

            {/* Conditional Fields based on Python logic */}
            {formData.entry_type === 'Game' && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Platform</label>
                <input 
                  type="text" 
                  value={formData.platform || ""} 
                  onChange={e => setFormData({...formData, platform: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3"
                  placeholder="PC, PS5, Switch..."
                />
              </div>
            )}
            
            {(formData.entry_type === 'Book' || formData.entry_type === 'Adult Visual Novel') && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Author</label>
                <input 
                  type="text" 
                  value={formData.author || ""} 
                  onChange={e => setFormData({...formData, author: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3"
                />
              </div>
            )}

            {/* Image & Rating */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Image</label>
                <button 
                  type="button"
                  onClick={handleImagePick}
                  className="w-full bg-white/5 border border-white/10 border-dashed rounded-lg p-3 text-sm text-gray-400 hover:text-white hover:border-primary flex items-center justify-center gap-2 transition-all"
                >
                  <Upload size={16} />
                  {rawImagePath || formData.image_url ? "Change Image" : "Select Image"}
                </button>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Score (0-10)</label>
                <select 
                  value={formData.review_score || ""}
                  onChange={e => setFormData({...formData, review_score: e.target.value ? parseInt(e.target.value) : null})}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-primary outline-none"
                >
                  <option value="">N/A</option>
                  {[...Array(11)].map((_, i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Genre (comma separated)</label>
              <input 
                type="text" 
                value={formData.genre || ""} 
                onChange={e => setFormData({...formData, genre: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-lg p-3"
                placeholder="Action, Sci-Fi..."
              />
            </div>

          </div>

          <div className="p-6 border-t border-white/5 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl font-medium hover:bg-white/5 text-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl font-bold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25 flex items-center gap-2 transition-all"
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