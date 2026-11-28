import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";
import { IndexTabCloseButton, IndexTabPanel } from "./IndexTabPanel";

interface ConfirmDialogProps {
  isOpen: boolean;
  /** The action, shown on the index tab ("Delete Award Year"). */
  title: string;
  /**
   * What the action applies to ("Mister Goon"). When given it leads the panel
   * as the title and `children` becomes supporting copy; without it,
   * `children` leads.
   */
  subject?: string;
  children: ReactNode;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Visual tone. 'danger' (default) is the destructive red style used by
   * delete confirmations. 'default' is a non-destructive amber style for
   * reversible actions such as hiding content.
   */
  tone?: "danger" | "default";
  /** Small line under the lead. Defaults per tone (danger: "This action cannot be undone"). */
  subtitle?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  subject,
  children,
  detail,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  tone = "danger",
  subtitle,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const isDanger = tone === "danger";
  const confirmBtn = isDanger
    ? "bg-red-600 hover:bg-red-500 shadow-red-500/25"
    : "bg-amber-600 hover:bg-amber-500 shadow-amber-500/25";
  const subtitleText = subtitle ?? (isDanger ? "This action cannot be undone" : undefined);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  useEffect(() => {
    if (!isOpen) {
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error("Confirmation action failed:", error);
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <IndexTabPanel
        ref={modalRef}
        tab={title}
        tone={isDanger ? "red" : "amber"}
        title={subject}
        meta={subject ? subtitleText : undefined}
        onClose={subject ? onClose : undefined}
        closeDisabled={isSubmitting}
        className="w-full max-w-md animate-in fade-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        {subject ? (
          <div className="p-5">
            <p className="text-gray-300 text-sm leading-relaxed">{children}</p>
            {detail && <p className="text-gray-500 text-xs mt-2">{detail}</p>}
          </div>
        ) : (
          <div className="flex items-start gap-4 px-5 pt-4 pb-5">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium leading-snug text-white">{children}</p>
              {subtitleText && <p className="mt-1 text-[13px] text-white/45">{subtitleText}</p>}
              {detail && <p className="mt-3 text-xs leading-relaxed text-gray-500">{detail}</p>}
            </div>
            <IndexTabCloseButton onClick={onClose} disabled={isSubmitting} />
          </div>
        )}

        <div className="flex gap-3 p-5 pt-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className={`flex-1 px-4 py-2.5 ${confirmBtn} rounded-xl font-semibold text-white transition-colors shadow-lg disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {isSubmitting ? "Working..." : confirmLabel}
          </button>
        </div>
      </IndexTabPanel>
    </div>,
    document.body
  );
}
