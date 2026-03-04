import { useEffect, useRef } from "react";

const modalStack: symbol[] = [];

export function useEscapeToClose(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const modalId = Symbol("modal-escape");
    modalStack.push(modalId);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (modalStack[modalStack.length - 1] !== modalId) return;

      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      const index = modalStack.lastIndexOf(modalId);
      if (index !== -1) {
        modalStack.splice(index, 1);
      }
    };
  }, [isOpen]);
}
