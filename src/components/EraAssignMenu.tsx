import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Tag } from "lucide-react";
import type { Era } from "../lib/collections-logic";
import { useHoverTooltip } from "./HoverTooltip";
import { cn } from "../lib/utils_ui";

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
  const { bindTooltip } = useHoverTooltip();

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
        type="button"
        onClick={(e) => { e.stopPropagation(); open ? setOpen(false) : openMenu(); }}
        {...bindTooltip(
          <span className="text-xs font-medium text-text">
            {current ? `Era: ${current.name}` : "Assign to era"}
          </span>,
          { width: "content", className: "rounded-lg px-3 py-1.5 whitespace-nowrap" }
        )}
        className={cn(
          "w-7 h-7 flex items-center justify-center rounded-full transition-all shadow-sm",
          open ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          current
            ? "border border-white/30 text-white hover:brightness-110"
            : "bg-black/50 backdrop-blur-sm border border-white/10 hover:bg-black/70 hover:border-white/20 text-white/80 hover:text-white"
        )}
        style={current ? { background: current.color } : undefined}
      >
        <Tag size={13} className={current ? "text-white drop-shadow-sm" : undefined} />
        <span className="sr-only">{current ? `Era: ${current.name}` : "Assign to era"}</span>
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
                type="button"
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
            type="button"
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
