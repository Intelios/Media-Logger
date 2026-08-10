import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useEscapeToClose } from "../../../lib/useEscapeToClose";
import { useFocusTrap } from "../../../lib/useFocusTrap";

interface PanelExpandOverlayProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Full-size view of a single plate panel. The plate itself never scrolls, so
 * anything a panel cannot show at quarter size lives here rather than being cut.
 */
export function PanelExpandOverlay({ isOpen, title, subtitle, onClose, children }: PanelExpandOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, overlayRef);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div
        ref={overlayRef}
        className="glass-surface fixed inset-4 z-50 flex flex-col overflow-hidden rounded-3xl animate-in fade-in zoom-in-95 duration-200 md:inset-10 lg:inset-16"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-primary/15 px-6 py-5">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-bold text-text">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-text-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl p-2 text-text-muted transition-colors hover:bg-primary/10 hover:text-primary"
          >
            <X size={22} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </>,
    document.body
  );
}
