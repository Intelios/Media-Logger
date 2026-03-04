import { RefObject, useEffect, useRef } from "react";

const focusTrapStack: symbol[] = [];

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

const isVisible = (element: HTMLElement): boolean => {
  if (element.hasAttribute("hidden")) return false;
  if (element.getAttribute("aria-hidden") === "true") return false;
  return element.getClientRects().length > 0;
};

const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (!isVisible(element)) return false;
    if (element instanceof HTMLInputElement || element instanceof HTMLButtonElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      if (element.disabled) return false;
    }
    return true;
  });
};

export function useFocusTrap(isOpen: boolean, containerRef: RefObject<HTMLElement | null>) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const container = containerRef.current;
    if (!container) return;

    const trapId = Symbol("focus-trap");
    focusTrapStack.push(trapId);
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const moveFocusInside = () => {
      if (focusTrapStack[focusTrapStack.length - 1] !== trapId) return;
      if (container.contains(document.activeElement)) return;

      const focusables = getFocusableElements(container);
      const autofocusTarget = focusables.find((el) => el.hasAttribute("autofocus"));
      const target = autofocusTarget ?? focusables[0];

      if (target) {
        target.focus();
        return;
      }

      if (!container.hasAttribute("tabindex")) {
        container.setAttribute("tabindex", "-1");
      }
      container.focus();
    };

    // Delay to allow React's autoFocus to run first.
    const focusTimer = window.setTimeout(moveFocusInside, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      if (focusTrapStack[focusTrapStack.length - 1] !== trapId) return;

      const focusables = getFocusableElements(container);
      if (focusables.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (!activeElement || !container.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);

      const index = focusTrapStack.lastIndexOf(trapId);
      if (index !== -1) {
        focusTrapStack.splice(index, 1);
      }

      const previousFocus = previousFocusRef.current;
      if (previousFocus && typeof previousFocus.focus === "function" && document.contains(previousFocus)) {
        previousFocus.focus();
      }
    };
  }, [isOpen, containerRef]);
}
