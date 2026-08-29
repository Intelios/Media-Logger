// Era bands — the tinted bracket drawn behind the cards of a collection era.
//
// The band is not one measured rectangle per era. Every member card carries its
// own segment, sized so that it bleeds half a gutter toward each neighbour in the
// same run. Neighbouring segments therefore abut exactly and the union reads as a
// single continuous band, with no DOM measurement anywhere.
//
// Where a run spans multiple rows, segments bleed to the gutter midline toward
// vertically/horizontally adjacent era neighbours, while outer boundaries seal cleanly
// with padded borders and rounded corners. Each wrapped row begins with a continuation chip.

import type { CollectionItemView } from "../collections-logic";

// Grid geometry. GUTTER matches the `gap-6` / `gap={24}` the collection grid uses;
// PAD is how far a band reaches past a card on a side where the run ends.
const GUTTER = 24;
const PAD = 6;
const RADIUS = 16; // matches the cards' `rounded-2xl`

// Half a gutter, plus a hair on the right/bottom only. Column widths come from
// `minmax(0, 1fr)` and land on fractional pixels, so two segments meeting exactly
// at the midline can leave an antialiased seam. Overlapping from one side only
// closes it without ever double-blending the tint by more than half a pixel.
const BLEED = GUTTER / 2;
const BLEED_OVERLAP = GUTTER / 2 + 0.5;

export type EraBandLabel = "primary" | "continuation";

export interface EraBandSegment {
  eraId: number;
  name: string;
  color: string;
  borderTop: boolean;
  borderRight: boolean;
  borderBottom: boolean;
  borderLeft: boolean;
  insetTop: number;
  insetRight: number;
  insetBottom: number;
  insetLeft: number;
  /** tl, tr, br, bl */
  radii: [number, number, number, number];
  label: EraBandLabel | null;
}

// A maximal stretch of consecutive items sharing one era. Splitting on runs is
// what keeps an untagged card that sits between two members of the same era from
// being swallowed by the band.
interface EraRun {
  eraId: number;
  name: string;
  color: string;
  startIndex: number;
  endIndex: number; // inclusive
}

function collectRuns(items: readonly CollectionItemView[]): EraRun[] {
  const runs: EraRun[] = [];
  let current: EraRun | null = null;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const eraId = item.era_id;

    if (eraId === null || eraId === undefined) {
      current = null;
      continue;
    }

    if (current && current.eraId === eraId) {
      current.endIndex = index;
      continue;
    }

    current = {
      eraId,
      name: item.era_name ?? "",
      color: item.era_color ?? "#888888",
      startIndex: index,
      endIndex: index,
    };
    runs.push(current);
  }

  return runs;
}

/**
 * Per-item band geometry, keyed by entry id. Items without an era are absent.
 *
 * Runs are contiguous, so the grid rows a run covers are always consecutive: its
 * first row spans `[startCol, columnCount - 1]`, any middle rows span the full
 * width, and its last row spans `[0, endCol]`.
 */
export function buildEraBands(
  items: readonly CollectionItemView[],
  columnCount: number,
): Map<number, EraBandSegment> {
  const bands = new Map<number, EraBandSegment>();
  const columns = Math.max(1, Math.floor(columnCount));
  if (items.length === 0) return bands;

  // The era's very first member carries the full pill; every later row start
  // carries the dimmed continuation chip.
  const labelledEras = new Set<number>();

  for (const run of collectRuns(items)) {
    const firstRow = Math.floor(run.startIndex / columns);
    const lastRow = Math.floor(run.endIndex / columns);
    const startCol = run.startIndex % columns;
    const endCol = run.endIndex % columns;

    const minColOf = (row: number) => (row === firstRow ? startCol : 0);
    const maxColOf = (row: number) => (row === lastRow ? endCol : columns - 1);

    for (let index = run.startIndex; index <= run.endIndex; index += 1) {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const minCol = minColOf(row);
      const maxCol = maxColOf(row);

      const leftInRun = col > minCol;
      const rightInRun = col < maxCol;
      const topInRun = row > firstRow
        && col >= minColOf(row - 1)
        && col <= maxColOf(row - 1);
      const bottomInRun = row < lastRow
        && col >= minColOf(row + 1)
        && col <= maxColOf(row + 1);

      // Any side that continues into a neighbour reaches the gutter midline
      // so the two halves meet and seamlessly blend. Outer sides where the run
      // ends stop one PAD past the card.
      const insetLeft = leftInRun ? BLEED : PAD;
      const insetRight = rightInRun ? BLEED_OVERLAP : PAD;
      const insetTop = topInRun ? BLEED : PAD;
      const insetBottom = bottomInRun ? BLEED_OVERLAP : PAD;

      const borderLeft = !leftInRun;
      const borderRight = !rightInRun;
      const borderTop = !topInRun;
      const borderBottom = !bottomInRun;

      // A corner is only rounded where two real outer edges meet.
      const radii: [number, number, number, number] = [
        borderTop && borderLeft ? RADIUS : 0,
        borderTop && borderRight ? RADIUS : 0,
        borderBottom && borderRight ? RADIUS : 0,
        borderBottom && borderLeft ? RADIUS : 0,
      ];

      let label: EraBandLabel | null = null;
      if (col === minCol) {
        if (labelledEras.has(run.eraId)) {
          label = "continuation";
        } else {
          label = "primary";
          labelledEras.add(run.eraId);
        }
      }

      bands.set(items[index].id, {
        eraId: run.eraId,
        name: run.name,
        color: run.color,
        borderTop,
        borderRight,
        borderBottom,
        borderLeft,
        insetTop,
        insetRight,
        insetBottom,
        insetLeft,
        radii,
        label,
      });
    }
  }

  return bands;
}
