import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Tag } from "lucide-react";
import type { Era } from "../lib/collections-logic";

interface EraAssignMenuProps {
  eras: Era[];
  currentEraId: number | null;
  onAssign: (eraId: number | null) => void;
}

export function EraAssignMenu({ eras, currentEraId, onAssign }: EraAssignMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node)) return;
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const current = eras.find(e => e.id === currentEraId);

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setPosition({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen(true);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); open ? setOpen(false) : openMenu(); }}
        className="absolute top-2 left-12 z-30 flex items-center justify-center w-9 h-9 rounded-full border transition-all shadow-lg opacity-0 group-hover:opacity-100 hover:scale-110"
        style={{
          background: current ? current.color : "rgba(0, 0, 0, 0.55)",
          borderColor: current ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.25)",
        }}
        title={current ? `Era: ${current.name}` : "Assign to era"}
      >
        {!current && <Tag size={14} className="text-white/80" />}
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed w-52 max-h-64 overflow-y-auto rounded-xl border border-white/20 shadow-2xl shadow-black/45 custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-150 z-[200] py-1"
          style={{
            top: position.top,
            left: position.left,
            background: "color-mix(in srgb, var(--color-surface) 42%, transparent)",
            backdropFilter: "blur(24px) saturate(170%)",
            WebkitBackdropFilter: "blur(24px) saturate(170%)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {eras.length === 0 ? (
            <div className="px-3.5 py-2.5 text-xs text-gray-400">
              No eras yet — manage eras from the collection header.
            </div>
          ) : (
            eras.map(era => (
              <button
                key={era.id}
                onClick={() => { onAssign(era.id); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left transition-colors ${currentEraId === era.id ? "bg-white/10 text-white" : "text-gray-200 hover:bg-white/5 hover:text-white"}`}
              >
                <span className="w-3 h-3 rounded-full shrink-0 border border-white/25" style={{ background: era.color }} />
                <span className="truncate">{era.name}</span>
              </button>
            ))
          )}
          {currentEraId !== null && <div className="border-t border-white/10 my-1" />}
          <button
            onClick={() => { onAssign(null); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-gray-300 hover:bg-white/5 transition-colors"
          >
            <span className="w-3 h-3 rounded-full shrink-0 border border-white/30" />
            No era
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
