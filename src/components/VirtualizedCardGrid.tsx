import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Key,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useOptionalMainScrollContainer } from "../lib/scroll-container";
import { cn } from "../lib/utils_ui";

export const DEFAULT_GRID_VIRTUALIZATION_THRESHOLD = 80;
export const DEFAULT_GRID_OVERSCAN_ROWS = 2;
export const DEFAULT_GRID_END_THRESHOLD_ROWS = 2;

export interface ResponsiveGridColumns {
  base: number;
  sm?: number;
  md?: number;
  lg?: number;
  xl?: number;
  "2xl"?: number;
}

export interface VirtualizedCardGridScrollOptions {
  align?: "auto" | "start" | "center" | "end";
  behavior?: "auto" | "smooth";
}

export interface VirtualizedCardGridHandle {
  scrollToIndex: (
    index: number,
    options?: VirtualizedCardGridScrollOptions,
  ) => void;
  scrollToKey: (
    key: Key,
    options?: VirtualizedCardGridScrollOptions,
  ) => void;
  getScrollElement: () => HTMLElement | null;
}

export interface VirtualizedCardGridProps<T> {
  items: readonly T[];
  getItemKey: (item: T, index: number) => Key;
  renderItem: (item: T, index: number) => ReactNode;
  columns?: ResponsiveGridColumns;
  gap?: number;
  estimatedRowHeight?: number;
  threshold?: number;
  overscanRows?: number;
  className?: string;
  itemClassName?: string;
  style?: CSSProperties;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  scrollToIndex?: number | null;
  scrollOptions?: VirtualizedCardGridScrollOptions;
  highlightedKey?: Key | null;
  highlightClassName?: string;
  scrollToHighlighted?: boolean;
  onEndReached?: () => void;
  endReachedThresholdRows?: number;
  ariaLabel?: string;
}

interface GridRow {
  startIndex: number;
  endIndex: number;
  key: string;
}

const DEFAULT_COLUMNS: ResponsiveGridColumns = {
  base: 1,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 5,
};

function positiveColumnCount(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function resolveColumnCount(
  viewportWidth: number,
  columns: ResponsiveGridColumns,
): number {
  let count = positiveColumnCount(columns.base, 1);
  if (viewportWidth >= 640) count = positiveColumnCount(columns.sm, count);
  if (viewportWidth >= 768) count = positiveColumnCount(columns.md, count);
  if (viewportWidth >= 1024) count = positiveColumnCount(columns.lg, count);
  if (viewportWidth >= 1280) count = positiveColumnCount(columns.xl, count);
  if (viewportWidth >= 1536) count = positiveColumnCount(columns["2xl"], count);
  return count;
}

function getViewportWidth(): number {
  return typeof window === "undefined" ? 1280 : window.innerWidth;
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(getViewportWidth);

  useEffect(() => {
    const handleResize = () => setWidth(getViewportWidth());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return width;
}

function keyToken(key: Key): string {
  return `${typeof key}:${String(key)}`;
}

function VirtualizedCardGridInner<T>(
  {
    items,
    getItemKey,
    renderItem,
    columns = DEFAULT_COLUMNS,
    gap = 24,
    estimatedRowHeight = 520,
    threshold = DEFAULT_GRID_VIRTUALIZATION_THRESHOLD,
    overscanRows = DEFAULT_GRID_OVERSCAN_ROWS,
    className,
    itemClassName,
    style,
    scrollContainerRef,
    scrollToIndex: requestedScrollIndex,
    scrollOptions,
    highlightedKey,
    highlightClassName,
    scrollToHighlighted = true,
    onEndReached,
    endReachedThresholdRows = DEFAULT_GRID_END_THRESHOLD_ROWS,
    ariaLabel,
  }: VirtualizedCardGridProps<T>,
  forwardedRef: Ref<VirtualizedCardGridHandle>,
) {
  const mainScrollContainer = useOptionalMainScrollContainer();
  const viewportWidth = useViewportWidth();
  const columnCount = resolveColumnCount(viewportWidth, columns);
  const normalizedGap = Number.isFinite(gap) ? Math.max(0, gap) : 24;
  const normalizedEstimatedRowHeight = Number.isFinite(estimatedRowHeight)
    ? Math.max(1, estimatedRowHeight)
    : 520;
  const virtualizeAt = Number.isFinite(threshold)
    ? Math.max(1, Math.floor(threshold))
    : DEFAULT_GRID_VIRTUALIZATION_THRESHOLD;
  const normalizedOverscan = Number.isFinite(overscanRows)
    ? Math.max(0, Math.floor(overscanRows))
    : DEFAULT_GRID_OVERSCAN_ROWS;
  const hasScrollContainer = Boolean(scrollContainerRef || mainScrollContainer);
  const shouldVirtualize = hasScrollContainer && items.length >= virtualizeAt;
  const rootRef = useRef<HTMLDivElement>(null);
  const normalItemRefs = useRef(new Map<number, HTMLDivElement>());
  const lastEndReachedSignature = useRef<string | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  const getScrollElement = useCallback(
    () => scrollContainerRef?.current ?? mainScrollContainer?.scrollRef.current ?? null,
    [mainScrollContainer, scrollContainerRef],
  );

  const rows = useMemo<GridRow[]>(() => {
    const nextRows: GridRow[] = [];
    for (let startIndex = 0; startIndex < items.length; startIndex += columnCount) {
      const endIndex = Math.min(startIndex + columnCount, items.length);
      const itemKeys: string[] = [];
      for (let index = startIndex; index < endIndex; index += 1) {
        itemKeys.push(keyToken(getItemKey(items[index], index)));
      }
      nextRows.push({
        startIndex,
        endIndex,
        key: `${columnCount}:${itemKeys.join("|")}`,
      });
    }
    return nextRows;
  }, [columnCount, getItemKey, items]);

  const getRowKey = useCallback(
    (rowIndex: number) => rows[rowIndex]?.key ?? `row:${columnCount}:${rowIndex}`,
    [columnCount, rows],
  );

  const rowVirtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: shouldVirtualize ? rows.length : 0,
    getScrollElement,
    estimateSize: () => normalizedEstimatedRowHeight,
    getItemKey: getRowKey,
    gap: normalizedGap,
    overscan: normalizedOverscan,
    scrollMargin,
    enabled: shouldVirtualize,
  });

  useLayoutEffect(() => {
    if (!shouldVirtualize) return;

    const root = rootRef.current;
    const scrollElement = getScrollElement();
    if (!root || !scrollElement) return;

    const updateScrollMargin = () => {
      const rootRect = root.getBoundingClientRect();
      const scrollRect = scrollElement.getBoundingClientRect();
      const nextMargin = rootRect.top - scrollRect.top + scrollElement.scrollTop;
      setScrollMargin((current) =>
        Math.abs(current - nextMargin) < 0.5 ? current : nextMargin,
      );
    };

    updateScrollMargin();
    const observer = new ResizeObserver(updateScrollMargin);
    observer.observe(root);
    observer.observe(scrollElement);
    if (root.parentElement) observer.observe(root.parentElement);
    window.addEventListener("resize", updateScrollMargin);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScrollMargin);
    };
  }, [columnCount, getScrollElement, items.length, shouldVirtualize]);

  useLayoutEffect(() => {
    if (shouldVirtualize) rowVirtualizer.measure();
  }, [columnCount, rowVirtualizer, shouldVirtualize]);

  const findIndexByKey = useCallback(
    (key: Key): number => {
      for (let index = 0; index < items.length; index += 1) {
        if (Object.is(getItemKey(items[index], index), key)) return index;
      }
      return -1;
    },
    [getItemKey, items],
  );

  const scrollToItemIndex = useCallback(
    (
      rawIndex: number,
      options: VirtualizedCardGridScrollOptions = {},
    ) => {
      if (items.length === 0 || !Number.isFinite(rawIndex)) return;
      const itemIndex = Math.min(items.length - 1, Math.max(0, Math.floor(rawIndex)));
      const align = options.align ?? "center";
      const behavior = options.behavior ?? "auto";

      if (shouldVirtualize) {
        rowVirtualizer.scrollToIndex(Math.floor(itemIndex / columnCount), {
          align,
          behavior,
        });
        return;
      }

      normalItemRefs.current.get(itemIndex)?.scrollIntoView({
        behavior,
        block: align === "auto" ? "nearest" : align,
      });
    },
    [columnCount, items.length, rowVirtualizer, shouldVirtualize],
  );

  const scrollToItemKey = useCallback(
    (key: Key, options?: VirtualizedCardGridScrollOptions) => {
      const index = findIndexByKey(key);
      if (index >= 0) scrollToItemIndex(index, options);
    },
    [findIndexByKey, scrollToItemIndex],
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      scrollToIndex: scrollToItemIndex,
      scrollToKey: scrollToItemKey,
      getScrollElement,
    }),
    [getScrollElement, scrollToItemIndex, scrollToItemKey],
  );

  const highlightedIndex = useMemo(() => {
    if (highlightedKey === null || highlightedKey === undefined) return -1;
    return findIndexByKey(highlightedKey);
  }, [findIndexByKey, highlightedKey]);

  const endReachedSignature = useMemo(() => {
    if (items.length === 0) return "empty";
    const lastIndex = items.length - 1;
    return `${items.length}:${keyToken(getItemKey(items[lastIndex], lastIndex))}`;
  }, [getItemKey, items]);

  const notifyEndReached = useCallback(() => {
    if (!onEndReached || items.length === 0) return;
    if (lastEndReachedSignature.current === endReachedSignature) return;
    lastEndReachedSignature.current = endReachedSignature;
    onEndReached();
  }, [endReachedSignature, items.length, onEndReached]);

  const rearmEndReached = useCallback(() => {
    if (lastEndReachedSignature.current === endReachedSignature) {
      lastEndReachedSignature.current = null;
    }
  }, [endReachedSignature]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastVirtualRowIndex = virtualRows.length > 0
    ? virtualRows[virtualRows.length - 1].index
    : -1;
  const normalizedEndThreshold = Number.isFinite(endReachedThresholdRows)
    ? Math.max(0, Math.floor(endReachedThresholdRows))
    : DEFAULT_GRID_END_THRESHOLD_ROWS;

  useEffect(() => {
    if (!shouldVirtualize || lastVirtualRowIndex < 0) return;
    if (lastVirtualRowIndex >= rows.length - 1 - normalizedEndThreshold) {
      notifyEndReached();
    } else {
      rearmEndReached();
    }
  }, [
    lastVirtualRowIndex,
    normalizedEndThreshold,
    notifyEndReached,
    rearmEndReached,
    rows.length,
    shouldVirtualize,
  ]);

  useEffect(() => {
    if (shouldVirtualize || !onEndReached || items.length === 0) return;

    const targetRowIndex = Math.max(0, rows.length - 1 - normalizedEndThreshold);
    const targetItemIndex = rows[targetRowIndex]?.startIndex;
    if (targetItemIndex === undefined) return;
    const target = normalItemRefs.current.get(targetItemIndex);
    const scrollElement = getScrollElement();
    if (!target || !scrollElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) notifyEndReached();
        else rearmEndReached();
      },
      { root: scrollElement },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    getScrollElement,
    items.length,
    normalizedEndThreshold,
    notifyEndReached,
    onEndReached,
    rearmEndReached,
    rows,
    shouldVirtualize,
  ]);

  useEffect(() => {
    const targetIndex = requestedScrollIndex
      ?? (scrollToHighlighted && highlightedIndex >= 0 ? highlightedIndex : null);
    if (targetIndex === null || targetIndex === undefined) return;

    const frame = window.requestAnimationFrame(() => {
      scrollToItemIndex(targetIndex, {
        align: scrollOptions?.align,
        behavior: scrollOptions?.behavior,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    highlightedIndex,
    requestedScrollIndex,
    scrollOptions?.align,
    scrollOptions?.behavior,
    scrollToHighlighted,
    scrollToItemIndex,
  ]);

  const renderGridItem = (
    item: T,
    index: number,
    trackNormalItemRef: boolean,
  ): ReactElement => {
    const key = getItemKey(item, index);
    const isHighlighted = highlightedKey !== null
      && highlightedKey !== undefined
      && Object.is(key, highlightedKey);

    return (
      <div
        key={key}
        ref={trackNormalItemRef
          ? (node) => {
              if (node) normalItemRefs.current.set(index, node);
              else normalItemRefs.current.delete(index);
            }
          : undefined}
        role="listitem"
        data-card-index={index}
        data-card-key={String(key)}
        data-highlighted={isHighlighted || undefined}
        className={cn(
          "min-w-0",
          itemClassName,
          isHighlighted
            && (highlightClassName ?? "rounded-2xl ring-2 ring-primary ring-offset-2 ring-offset-transparent"),
        )}
      >
        {renderItem(item, index)}
      </div>
    );
  };

  const gridStyle: CSSProperties = {
    ...style,
    display: "grid",
    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
    gap: normalizedGap,
  };

  if (!shouldVirtualize) {
    return (
      <div
        ref={rootRef}
        role="list"
        aria-label={ariaLabel}
        data-virtualized="false"
        className={className}
        style={gridStyle}
      >
        {items.map((item, index) => renderGridItem(item, index, true))}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      role="list"
      aria-label={ariaLabel}
      data-virtualized="true"
      className={cn("relative w-full", className)}
      style={style}
    >
      <div
        className="relative w-full"
        style={{ height: rowVirtualizer.getTotalSize() }}
      >
        {virtualRows.map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;

          const rowItems: ReactElement[] = [];
          for (let index = row.startIndex; index < row.endIndex; index += 1) {
            rowItems.push(renderGridItem(items[index], index, false));
          }

          return (
            <div
              key={row.key}
              ref={rowVirtualizer.measureElement}
              role="presentation"
              data-index={virtualRow.index}
              className="absolute left-0 top-0 w-full"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                columnGap: normalizedGap,
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
              }}
            >
              {rowItems}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const VirtualizedCardGrid = forwardRef(VirtualizedCardGridInner) as <T>(
  props: VirtualizedCardGridProps<T> & { ref?: Ref<VirtualizedCardGridHandle> },
) => ReactElement;
