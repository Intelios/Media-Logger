import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Save, Plus, Layers, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";
import type { Era } from "../lib/collections-logic";

interface ErasModalProps {
  isOpen: boolean;
  eras: Era[];
  onClose: () => void;
  onSave: (eras: Era[]) => Promise<void>;
}

// Pleasant defaults for newly-added eras. Cycles through these so adjacent eras
// rarely collide before the user picks their own hex.
const ERA_PALETTE = ["#0EA5E9", "#F59E0B", "#10B981", "#EC4899", "#8B5CF6", "#EF4444"];

let tempIdCounter = -1;
const nextTempId = () => --tempIdCounter;

export function ErasModal({ isOpen, eras, onClose, onSave }: ErasModalProps) {
  const [localEras, setLocalEras] = useState<Era[]>([]);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(ERA_PALETTE[0]);
  const [saving, setSaving] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  useEffect(() => {
    if (isOpen) {
      setLocalEras(eras.map(e => ({ ...e })));
      setNewName("");
      setNewColor(ERA_PALETTE[eras.length % ERA_PALETTE.length]);
    }
  }, [isOpen, eras]);

  if (!isOpen) return null;

  const updateEra = (id: number, patch: Partial<Era>) => {
    setLocalEras(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)));
  };

  const moveEra = (index: number, delta: number) => {
    setLocalEras(prev => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addEra = () => {
    const name = newName.trim();
    if (!name) return;
    setLocalEras(prev => [
      ...prev,
      {
        id: nextTempId(),
        collection_id: prev[0]?.collection_id ?? 0,
        name,
        color: newColor,
        sort_order: prev.length,
        created_date: new Date().toISOString(),
      },
    ]);
    setNewName("");
    setNewColor(ERA_PALETTE[localEras.length % ERA_PALETTE.length]);
  };

  const removeEra = (id: number) => {
    setLocalEras(prev => prev.filter(e => e.id !== id));
  };

  const handleSave = async () => {
    const cleaned = localEras.filter(e => e.name.trim() !== "");
    if (cleaned.length === 0) return;
    setSaving(true);
    try {
      await onSave(cleaned);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div
        ref={modalRef}
        className="bg-[#1a1a1a] border border-white/10 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-white/5" style={{ background: `linear-gradient(to right, color-mix(in srgb, var(--color-primary) 10%, transparent), transparent)` }}>
          <div className="p-2.5 rounded-xl" style={{ background: `linear-gradient(to bottom right, color-mix(in srgb, var(--color-primary) 20%, transparent), color-mix(in srgb, var(--color-secondary) 20%, transparent))` }}>
            <Layers size={20} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(to right, var(--color-primary), var(--color-secondary))` }}>
              Manage Eras
            </h3>
            <p className="text-xs text-gray-400">Name and color grouped spans within this collection</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {localEras.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-white/10 rounded-xl">
              <p className="text-sm text-gray-500">No eras yet. Add one below to start grouping items.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {localEras.map((era, index) => (
                <div
                  key={era.id}
                  className="flex items-center gap-3 p-2.5 bg-white/5 border border-white/10 rounded-xl"
                >
                  {/* Color swatch (click to pick) */}
                  <label
                    className="relative w-9 h-9 rounded-full cursor-pointer border border-white/20 shadow-md shrink-0 overflow-hidden"
                    style={{ background: era.color }}
                    title="Choose color"
                  >
                    <input
                      type="color"
                      value={era.color}
                      onChange={(e) => updateEra(era.id, { color: e.target.value })}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </label>

                  {/* Name */}
                  <input
                    value={era.name}
                    onChange={(e) => updateEra(era.id, { name: e.target.value })}
                    className="flex-1 min-w-0 bg-transparent border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-primary/50 transition-colors"
                    placeholder="Era name"
                  />

                  {/* Reorder */}
                  <div className="flex flex-col">
                    <button
                      onClick={() => moveEra(index, -1)}
                      disabled={index === 0}
                      className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move up"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      onClick={() => moveEra(index, 1)}
                      disabled={index === localEras.length - 1}
                      className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move down"
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => removeEra(era.id)}
                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Delete era"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add era */}
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
            <label
              className="relative w-9 h-9 rounded-full cursor-pointer border border-white/20 shadow-md shrink-0 overflow-hidden"
              style={{ background: newColor }}
              title="Choose color"
            >
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addEra(); }}
              className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-primary/50 transition-colors"
              placeholder="New era name"
            />
            <button
              onClick={addEra}
              disabled={!newName.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-primary hover:bg-primary/90 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              Add
            </button>
          </div>

          <p className="text-xs text-gray-500 mt-4 leading-relaxed">
            Eras only draw a colored bracket around their items — they never reorder anything. Sort your
            items first (Reorder), then assign the items that belong together to an era.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-5 pt-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl font-medium hover:bg-white/5 text-gray-400 border border-white/10 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || localEras.length === 0}
            className="flex-1 px-4 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
            style={{ background: `linear-gradient(to right, var(--color-primary), var(--color-secondary))`, boxShadow: `0 10px 15px -3px color-mix(in srgb, var(--color-primary) 20%, transparent)` }}
          >
            <Save size={18} />
            Save Eras
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
