/**
 * How much of a queued item's artwork the Backlog shelves show.
 *
 * - `spines`: no artwork at all, just the colour extracted from the cover.
 *   Densest and cheapest — a shelf of any size costs zero image requests.
 * - `strips`: the cover is printed onto the spine face the way a real jacket
 *   wraps around one, blurred at rest and sharpened on hover.
 * - `covers`: cases turned face-out on the shelf. Roughly half the density,
 *   every cover fully readable.
 *
 * Only Planning and Unreleased are affected; In Progress is always face-out.
 *
 * This lives in `lib/` rather than with the shelf components so `settings.ts`
 * can persist it without importing from the component tree.
 */
export type BacklogDensity = 'spines' | 'strips' | 'covers';

export const BACKLOG_DENSITIES: readonly BacklogDensity[] = ['spines', 'strips', 'covers'];

export const BACKLOG_DENSITY_LABELS: Record<BacklogDensity, string> = {
  spines: 'Spines',
  strips: 'Strips',
  covers: 'Covers',
};

/** Hover hint for the density control, so the trade-off isn't guesswork. */
export const BACKLOG_DENSITY_HINTS: Record<BacklogDensity, string> = {
  spines: 'Colour only — the most items per shelf',
  strips: 'Cover art printed down each spine',
  covers: 'Cases turned face-out — fewer per shelf',
};

export const isBacklogDensity = (value: unknown): value is BacklogDensity =>
  typeof value === 'string' && (BACKLOG_DENSITIES as readonly string[]).includes(value);
