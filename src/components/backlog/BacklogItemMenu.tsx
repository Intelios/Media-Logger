import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Play, Pause, Check, Pencil, Trash2 } from "lucide-react";
import type { BacklogItem } from "../../lib/db";

const MENU_WIDTH = 176;
const VIEWPORT_MARGIN = 8;

export interface MenuAnchor {
  item: BacklogItem;
  /** Viewport rect of the element the menu was opened from. */
  rect: DOMRect;
}

interface BacklogItemMenuProps {
  anchor: MenuAnchor;
  onClose: () => void;
  onStart: (id: number) => void;
  onPause: (id: number) => void;
  onComplete: (item: BacklogItem) => void;
  onEdit: (item: BacklogItem) => void;
  onRemove: (id: number) => void;
}

// One action menu shared by spines and face-out cases. It is portalled to
// <body> and positioned from the anchor's viewport rect, so a 34px spine can
// open a 176px menu without the shelf clipping it.
export function BacklogItemMenu({
  anchor,
  onClose,
  onStart,
  onPause,
  onComplete,
  onEdit,
  onRemove,
}: BacklogItemMenuProps) {
  const { item, rect } = anchor;

  // Any click outside, scroll, resize or Escape dismisses. The click listener
  // is registered on the next frame so the very click that opened the menu
  // doesn't immediately close it again.
  useEffect(() => {
    const close = () => onClose();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const frame = requestAnimationFrame(() => {
      window.addEventListener("click", close);
      window.addEventListener("contextmenu", close);
    });
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  // Prefer below-left of the anchor, then flip/clamp to stay on screen. The
  // height is an estimate (five rows plus a divider) — good enough to decide
  // which side to open on without measuring after paint.
  const estimatedHeight = 230;
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(rect.left, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN)
  );
  const openBelow = rect.bottom + estimatedHeight + VIEWPORT_MARGIN < window.innerHeight;
  const top = openBelow
    ? rect.bottom + 6
    : Math.max(VIEWPORT_MARGIN, rect.top - estimatedHeight - 6);

  const run = (action: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation();
    action();
    onClose();
  };

  return createPortal(
    <div
      role="menu"
      aria-label={`Actions for ${item.name}`}
      className="fixed z-[9999] w-44 overflow-hidden rounded-xl border border-white/10 shadow-2xl"
      style={{ top, left, backgroundColor: "var(--color-surface)" }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-white/5 px-3.5 py-2">
        <p className="truncate text-[11px] font-semibold text-white">{item.name}</p>
        <p className="text-[10px] text-gray-500">{item.entry_type}</p>
      </div>

      {item.status !== "in_progress" && (
        <button
          role="menuitem"
          onClick={run(() => onStart(item.id))}
          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-200 transition-colors hover:bg-amber-500/20 hover:text-amber-400"
        >
          <Play size={14} />
          <span>Start</span>
        </button>
      )}
      {item.status !== "planning" && (
        <button
          role="menuitem"
          onClick={run(() => onPause(item.id))}
          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-200 transition-colors hover:bg-amber-500/20 hover:text-amber-400"
        >
          <Pause size={14} />
          <span>Move to Planning</span>
        </button>
      )}
      <button
        role="menuitem"
        onClick={run(() => onComplete(item))}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-200 transition-colors hover:bg-emerald-500/20 hover:text-emerald-400"
      >
        <Check size={14} />
        <span>Mark Complete</span>
      </button>
      <button
        role="menuitem"
        onClick={run(() => onEdit(item))}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-200 transition-colors hover:bg-blue-500/20 hover:text-blue-400"
      >
        <Pencil size={14} />
        <span>Edit</span>
      </button>
      <div className="h-px bg-white/5" />
      <button
        role="menuitem"
        onClick={run(() => onRemove(item.id))}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-500/20"
      >
        <Trash2 size={14} />
        <span>Remove</span>
      </button>
    </div>,
    document.body
  );
}
