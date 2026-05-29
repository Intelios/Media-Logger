import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EyeOff, Trash2, X } from "lucide-react";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Visual tone. 'danger' (default) is the destructive red/Trash2 style used by
   * delete confirmations. 'default' is a non-destructive amber/EyeOff style for
   * reversible actions such as hiding content.
   */
  tone?: "danger" | "default";
  /** Small line under the title. Defaults per tone (danger: "This action cannot be undone"). */
  subtitle?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
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
  const Icon = isDanger ? Trash2 : EyeOff;
  const accentText = isDanger ? "text-red-400" : "text-amber-400";
  const accentIconBg = isDanger ? "bg-red-500/20" : "bg-amber-500/20";
  const headerGradient = isDanger ? "from-red-500/10" : "from-amber-500/10";
  const containerShadow = isDanger ? "shadow-red-500/10" : "shadow-amber-500/10";
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
      <div
        ref={modalRef}
        className={`bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-white/10 w-full max-w-md rounded-2xl shadow-2xl ${containerShadow} overflow-hidden animate-in fade-in zoom-in-95 duration-200`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`flex items-center gap-3 p-5 border-b border-white/5 bg-gradient-to-r ${headerGradient} via-transparent to-transparent`}>
          <div className={`p-2.5 ${accentIconBg} rounded-xl`}>
            <Icon size={20} className={accentText} />
          </div>
          <div>
            <h3 className="font-bold text-white text-lg">{title}</h3>
            {subtitleText && <p className="text-xs text-gray-400">{subtitleText}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="ml-auto p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <p className="text-gray-200 text-sm leading-relaxed">{children}</p>
          {detail && (
            <p className="text-gray-500 text-xs mt-2">{detail}</p>
          )}
        </div>

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
      </div>
    </div>,
    document.body
  );
}
