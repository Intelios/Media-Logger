import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IndexTabPanel } from "../../IndexTabPanel";
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
  const prefersReducedMotion = useReducedMotion();

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, overlayRef);

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: prefersReducedMotion ? 0 : 0.18 } }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <motion.div
            key="panel"
            ref={overlayRef}
            className="pointer-events-none fixed inset-4 z-50 md:inset-10 lg:inset-16"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.97,
              y: 8,
              transition: { duration: prefersReducedMotion ? 0 : 0.18 },
            }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <IndexTabPanel
              size="sheet"
              tab={title}
              title={subtitle}
              onClose={onClose}
              className="h-full"
            >
              <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
            </IndexTabPanel>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
