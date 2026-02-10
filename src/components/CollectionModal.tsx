import { useState, useEffect } from "react";
import { X, Save, Layers, Sparkles } from "lucide-react";

interface CollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, desc: string) => void;
}

export function CollectionModal({ isOpen, onClose, onSubmit }: CollectionModalProps) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    if (isOpen) {
      setName("");
      setDesc("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="collection-modal-glass border border-white/10 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Enhanced Header with gradient */}
        <div className="flex items-center gap-3 p-5 border-b border-white/5" style={{ background: `linear-gradient(to right, color-mix(in srgb, var(--color-primary) 10%, transparent), transparent)` }}>
          <div className="p-2.5 rounded-xl" style={{ background: `linear-gradient(to bottom right, color-mix(in srgb, var(--color-primary) 20%, transparent), color-mix(in srgb, var(--color-secondary) 20%, transparent))` }}>
            <Layers size={20} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(to right, var(--color-primary), var(--color-secondary))` }}>
              New Collection
            </h3>
            <p className="text-xs text-gray-400">Create a new collection to organize your media</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onSubmit(name, desc); onClose(); }}>
          <div className="p-5 space-y-5">
            {/* Name Input */}
            <div>
              <label className="block text-sm text-gray-400 mb-2 font-medium">Collection Name</label>
              <input
                autoFocus
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 outline-none transition-all focus:ring-2"
                style={{ '--tw-ring-color': 'color-mix(in srgb, var(--color-primary) 20%, transparent)' } as React.CSSProperties}
                placeholder="e.g. Top 10 Movies of 2024"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Description Input */}
            <div>
              <label className="block text-sm text-gray-400 mb-2 font-medium">
                Description
                <span className="text-gray-600 font-normal ml-1">(Optional)</span>
              </label>
              <textarea
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 outline-none h-28 resize-none transition-all focus:ring-2"
                style={{ '--tw-ring-color': 'color-mix(in srgb, var(--color-primary) 20%, transparent)' } as React.CSSProperties}
                placeholder="What makes this collection special?"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>

            {/* Tip */}
            <div className="flex items-start gap-3 p-3 rounded-xl border border-white/5" style={{ background: `linear-gradient(to right, color-mix(in srgb, var(--color-primary) 5%, transparent), color-mix(in srgb, var(--color-secondary) 5%, transparent))` }}>
              <Sparkles size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
              <p className="text-xs text-gray-400">
                Collections help you organize media into themed groups. Add items after creating.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 p-5 pt-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl font-medium hover:bg-white/5 text-gray-400 border border-white/10 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 px-4 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
              style={{ background: `linear-gradient(to right, var(--color-primary), var(--color-secondary))`, boxShadow: `0 10px 15px -3px color-mix(in srgb, var(--color-primary) 20%, transparent)` }}
            >
              <Save size={18} />
              Create Collection
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}