import type { Collection } from "../collections-logic";

// How the Collections screen orders its cards. `custom` is the user's own
// arrangement, persisted per collection as `collections.sort_order` (schema v4)
// and edited by dragging cards; every other mode is derived and read-only.
export type CollectionSortMode =
  | "custom"
  | "name-asc"
  | "name-desc"
  | "items-desc"
  | "items-asc"
  | "created-desc"
  | "created-asc";

export interface CollectionSortOption {
  mode: CollectionSortMode;
  label: string;
  // Shown under the label in the sort menu — what the order actually means,
  // since "Newest" alone doesn't say newest by what.
  hint: string;
}

// Order here is the order the sort menu lists them in.
export const COLLECTION_SORT_OPTIONS: CollectionSortOption[] = [
  { mode: "custom", label: "Custom", hint: "Your own arrangement — drag to reorder" },
  { mode: "name-asc", label: "Alphabetical", hint: "A to Z" },
  { mode: "name-desc", label: "Reverse alphabetical", hint: "Z to A" },
  { mode: "items-desc", label: "Most items", hint: "Largest collection first" },
  { mode: "items-asc", label: "Fewest items", hint: "Smallest collection first" },
  { mode: "created-desc", label: "Newest", hint: "Recently created first" },
  { mode: "created-asc", label: "Oldest", hint: "Earliest created first" },
];

const SORT_MODES = new Set<string>(COLLECTION_SORT_OPTIONS.map(option => option.mode));

export function isCollectionSortMode(value: unknown): value is CollectionSortMode {
  return typeof value === "string" && SORT_MODES.has(value);
}

export function getCollectionSortLabel(mode: CollectionSortMode): string {
  return COLLECTION_SORT_OPTIONS.find(option => option.mode === mode)?.label ?? "Custom";
}

// Locale-aware so "Éclipse" and "Zelda II" land where a person would look for
// them; numeric so "Season 2" precedes "Season 10".
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

const byName = (a: Collection, b: Collection) => collator.compare(a.name, b.name);

// Dates are SQLite `datetime('now')` strings ('YYYY-MM-DD HH:MM:SS'), which
// compare correctly as text. `id` breaks ties within the same second.
const byCreated = (a: Collection, b: Collection) =>
  a.created_date === b.created_date ? a.id - b.id : a.created_date < b.created_date ? -1 : 1;

const byItemCount = (a: Collection, b: Collection) => (a.item_count ?? 0) - (b.item_count ?? 0);

const COMPARATORS: Record<CollectionSortMode, (a: Collection, b: Collection) => number> = {
  // The query already returns rows in `sort_order`; comparing again keeps the
  // function total and self-contained rather than trusting the caller's input.
  custom: (a, b) => (a.sort_order === b.sort_order ? byName(a, b) : a.sort_order - b.sort_order),
  "name-asc": byName,
  "name-desc": (a, b) => byName(b, a),
  // Count ties fall back to name so equally sized collections stay stable and
  // alphabetical instead of jittering with whatever the DB returned.
  "items-desc": (a, b) => byItemCount(b, a) || byName(a, b),
  "items-asc": (a, b) => byItemCount(a, b) || byName(a, b),
  "created-desc": (a, b) => byCreated(b, a),
  "created-asc": byCreated,
};

/** Sort a copy of `collections` for the given mode. Never mutates the input. */
export function sortCollections(
  collections: Collection[],
  mode: CollectionSortMode,
): Collection[] {
  return [...collections].sort(COMPARATORS[mode]);
}
