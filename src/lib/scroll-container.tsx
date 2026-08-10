import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
  type RefObject,
} from "react";

export interface MainScrollContainerValue {
  scrollRef: RefObject<HTMLElement | null>;
  getScrollElement: () => HTMLElement | null;
  scrollToTop: (behavior?: ScrollBehavior) => void;
}

const MainScrollContainerContext = createContext<MainScrollContainerValue | null>(null);

interface MainScrollContainerProviderProps {
  scrollRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export function MainScrollContainerProvider({
  scrollRef,
  children,
}: MainScrollContainerProviderProps) {
  const getScrollElement = useCallback(() => scrollRef.current, [scrollRef]);
  const scrollToTop = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      scrollRef.current?.scrollTo({ top: 0, left: 0, behavior });
    },
    [scrollRef],
  );
  const value = useMemo<MainScrollContainerValue>(
    () => ({ scrollRef, getScrollElement, scrollToTop }),
    [getScrollElement, scrollRef, scrollToTop],
  );

  return (
    <MainScrollContainerContext.Provider value={value}>
      {children}
    </MainScrollContainerContext.Provider>
  );
}

export function useMainScrollContainer(): MainScrollContainerValue {
  const value = useContext(MainScrollContainerContext);
  if (!value) {
    throw new Error("useMainScrollContainer must be used within MainScrollContainerProvider");
  }
  return value;
}

export function useOptionalMainScrollContainer(): MainScrollContainerValue | null {
  return useContext(MainScrollContainerContext);
}
