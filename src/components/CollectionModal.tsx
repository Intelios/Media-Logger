import { useState, useEffect } from "react";
import { X, Save } from "lucide-react";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-white/10 w-full max-w-lg rounded-2xl shadow-2xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">New Collection</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onSubmit(name, desc); onClose(); }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <input
                autoFocus
                required
                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-primary outline-none"
                placeholder="e.g. Top 10 Movies"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Description (Optional)</label>
              <textarea
                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-primary outline-none h-24 resize-none"
                placeholder="What is this collection about?"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 rounded-lg font-medium hover:bg-white/5 text-gray-300"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 rounded-lg font-bold bg-primary hover:bg-primary/90 text-white flex items-center gap-2"
            >
              <Save size={18} />
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}