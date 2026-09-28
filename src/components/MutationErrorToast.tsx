import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, X } from "lucide-react";

// Shared "mutation failed" toast. Mutation handlers (entry save/delete, backlog
// moves, …) live in plain async functions across pages and modals, so the
// reporter is an imperative function rather than context: any catch block can
// call reportMutationError() and the single <MutationErrorToast /> host mounted
// in App shows it. Without this, a failed save either vanishes into
// console.error or becomes an unhandled rejection with zero UI feedback.

interface MutationError {
  message: string;
  detail: string | null;
}

type Listener = () => void;

let currentError: MutationError | null = null;
const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): MutationError | null {
  return currentError;
}

function publish(next: MutationError | null): void {
  currentError = next;
  for (const listener of listeners) listener();
}

/**
 * Show the shared mutation-failure toast. `message` is the human sentence
 * ("Could not delete this entry."); `error` is the optional thrown value whose
 * text is shown as a smaller detail line.
 */
export function reportMutationError(message: string, error?: unknown): void {
  let detail: string | null = null;
  if (error != null) {
    const text = error instanceof Error ? error.message : String(error);
    detail = text.trim() || null;
  }
  publish({ message, detail });
}

function dismissMutationError(): void {
  publish(null);
}

const TOAST_AUTO_DISMISS_MS = 5000;

// Single-slot latest-wins, matching the Awards error toast precedent: a newer
// failure replaces the visible one and resets the auto-dismiss timer.
export function MutationErrorToast() {
  const error = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(dismissMutationError, TOAST_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [error]);

  return createPortal(
    <AnimatePresence>
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          role="alert"
          className="fixed bottom-6 right-6 z-[110] flex items-start gap-3 max-w-sm bg-[#2a1a1a] border border-red-500/40 rounded-xl p-4 shadow-2xl"
        >
          <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-200">{error.message}</p>
            {error.detail && (
              <p className="mt-1 text-xs text-red-300/70 break-words">{error.detail}</p>
            )}
          </div>
          <button
            onClick={dismissMutationError}
            className="p-1 hover:bg-white/10 rounded-full transition-colors flex-shrink-0"
            aria-label="Dismiss error"
          >
            <X size={14} className="text-red-300" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
