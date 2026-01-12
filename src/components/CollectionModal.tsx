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
      <div className="collection-modal-glass border border-white/10 w-full max-w-lg rounded-2xl shadow-2xl shadow-blue-500/10 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Enhanced Header with gradient */}
        <div className="flex items-center gap-3 p-5 border-b border-white/5 bg-gradient-to-r from-blue-500/10 via-purple-500/5 to-transparent">
          <div className="p-2.5 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl">
            <Layers size={20} className="text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
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
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
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
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 outline-none h-28 resize-none transition-all"
                placeholder="What makes this collection special?"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>

            {/* Tip */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-gradient-to-r from-blue-500/5 to-purple-500/5 border border-white/5">
              <Sparkles size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
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
              className="flex-1 px-4 py-3 rounded-xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500 text-white flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-blue-500/30"
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