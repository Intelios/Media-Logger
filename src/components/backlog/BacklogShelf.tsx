import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "../../lib/utils_ui";
import { HOVER_LIFT, ITEM_HEIGHT } from "./backlog-visuals";
import type { BacklogItem } from "../../lib/db";

interface BacklogShelfProps {
  /** Droppable id for cross-section drags. */
  containerId: string;
  items: BacklogItem[];
  itemWidth: number;
  itemGap: number;
  /** Hides the items but keeps the plank and its label rail on screen. */
  collapsed?: boolean;
  renderItem: (item: BacklogItem, index: number) => ReactNode;
  /** Optional shelf-edge label printed on the plank beneath each item. */
  renderLabel?: (item: BacklogItem) => ReactNode;
  /** Renders the section's empty state; true while a drag hovers this shelf. */
  renderEmptyState: (highlighted: boolean) => ReactNode;
  /** False for shelves that reject cross-section drops (e.g. Unreleased). */
  dropTarget?: boolean;
  /** True while any item is being dragged (cross-section or within-section). */
  isDragging?: boolean;
  /** Page-tracked drag hover for this shelf; lights it even when the cursor is
   *  over one of its items rather than the bare container. */
  overOverride?: boolean;
}

/**
 * How many items fit one shelf at the current width. Measured rather than
 * wrapped with flex so each shelf can carry a full-width plank and a label rail
 * whose cells line up with the items above them.
 */
function useItemsPerShelf(itemWidth: number, itemGap: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [perShelf, setPerShelf] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const width = element.clientWidth;
      if (width <= 0) return;
      // n items and n-1 gaps: n = (width + gap) / (itemWidth + gap)
      setPerShelf(Math.max(1, Math.floor((width + itemGap) / (itemWidth + itemGap))));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [itemWidth, itemGap]);

  return { ref, perShelf };
}

// A run of shelves holding one backlog section. Items flow left to right and
// wrap onto the next plank down, so the section reads as a bookcase rather than
// a grid — and 30-odd items fit where seven cards used to.
export function BacklogShelf({
  containerId,
  items,
  itemWidth,
  itemGap,
  collapsed = false,
  renderItem,
  renderLabel,
  renderEmptyState,
  dropTarget = true,
  isDragging = false,
  overOverride = false,
}: BacklogShelfProps) {
  const { setNodeRef, isOver } = useDroppable({ id: containerId, disabled: !dropTarget });
  const { ref: measureRef, perShelf } = useItemsPerShelf(itemWidth, itemGap);

  // Before the first measurement lands (same frame, via layout effect) keep
  // everything on one shelf rather than guessing one-per-shelf.
  const chunkSize = perShelf > 0 ? perShelf : items.length || 1;
  const shelves: BacklogItem[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    shelves.push(items.slice(i, i + chunkSize));
  }

  // isOver only lights up when the shelf container itself wins the collision —
  // during a drag the cursor usually sits over one of the shelf's sortable
  // items, which leaves the container dark. The page tracks the hovered
  // section through onDragOver (items included) and passes it back as
  // overOverride, so the glow always matches where a release would land.
  const over = (isOver || overOverride) && dropTarget;

  // During a drag every shelf but the hovered one recedes — source included —
  // so there is never any doubt about where a release would land.
  const receded = isDragging && !over;
  const shelfClass = cn(
    receded && "backlog-shelf-neutral",
    isDragging && dropTarget && "backlog-shelf-valid",
    over && "backlog-shelf-over",
  );

  return (
    <div ref={setNodeRef} className={shelfClass || undefined}>
      <div ref={measureRef}>
        {items.length === 0 ? (
          renderEmptyState(over)
        ) : (
          // Collapsing wraps the whole run of shelves — planks and label rails
          // included. Leaving the rail behind reads as a rendering bug rather
          // than a feature: a minimised section should be minimised.
          <div className={cn("backlog-shelf-collapse", collapsed && "backlog-shelf-collapse-closed")}>
            <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
              {shelves.map((shelf, shelfIndex) => (
                <div key={shelfIndex} className="backlog-shelf-unit">
                  <div
                    className="flex items-end overflow-visible"
                    style={{ gap: itemGap, minHeight: ITEM_HEIGHT + HOVER_LIFT }}
                  >
                    {shelf.map((item, indexInShelf) =>
                      renderItem(item, shelfIndex * chunkSize + indexInShelf)
                    )}
                  </div>

                  <div aria-hidden className={cn("backlog-plank", over && "backlog-plank-over")} />

                  {renderLabel && (
                    <div className="flex" style={{ gap: itemGap }}>
                      {shelf.map((item) => (
                        <div key={item.id} className="backlog-rail-cell" style={{ width: itemWidth }}>
                          {renderLabel(item)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </SortableContext>
          </div>
        )}
      </div>
    </div>
  );
}
