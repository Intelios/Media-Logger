// Interfaces matching the original Python `database.py` schema
export interface MediaEntry {
  id: number;
  name: string;
  genre: string | null;
  completion_date: string | null;
  review_score: number | null;
  description: string | null;
  notes: string | null;
  year_completed: number | null;
  is_rewatch: number; // SQLite stores booleans as 0/1
  own_local_copy: number;
  has_subtitles: number;
  is_platinum: number;
  is_completed: number;
  is_early_access: number;
  early_access_version: string | null;
  image_url: string | null;
  entry_type: string | null;
  platform: string | null;
  author: string | null;
  artist: string | null;
  director: string | null;
  actress: string | null;
  update_version: string | null;
  franchise: string | null;
  series: string | null;
}

/** Full row used by edit/detail surfaces. */
export type EntryDetail = MediaEntry;

/**
 * Lightweight row for cards and lists. Large free-form text fields are loaded
 * only when a detail/edit surface asks for them.
 */
export type EntryCardSummary = Omit<MediaEntry, 'description' | 'notes'>;

/**
 * Projection consumed by the in-memory Stats pipeline. Stats deliberately
 * keeps all filtering/brush derivation client-side, but does not need prose or
 * version-note fields from SQLite.
 */
export type StatsEntry = Omit<
  MediaEntry,
  'description' | 'notes' | 'early_access_version' | 'update_version'
>;

/** A zero-based page of query results. Search pages are capped at 100 rows. */
export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface BacklogItem {
  id: number;
  name: string;
  entry_type: string;
  genre: string | null;
  image_url: string | null;
  status: 'planning' | 'in_progress' | 'unreleased';
  added_date: string;
  sort_order: number;
  release_date: string | null;
  // Date the item most recently entered In Progress (schema v5). Optional
  // because items in progress before v5 have no recorded start, and the
  // column is cleared whenever the item leaves In Progress.
  in_progress_since?: string | null;
}

// A single snapshot of a profile's average rating at a point in time.
// Captured on entry mutation (source='mutation') for tracked profiles, or
// backfilled (source='backfill') when tracking is first enabled.
export interface AvgHistoryPoint {
  captured_at: string;
  average_score: number;
  rated_count: number;
  total_count: number;
  source: string;
}

export interface EntrySearchFilters {
  query?: string;
  entryTypes: string[];
  platforms: string[];
  actresses: string[];
  directors: string[];
  authors: string[];
  franchises: string[];
  series: string[];
  /** Optional inclusive score bounds (0–10). Entries with no score are never matched. */
  scoreMin?: number;
  scoreMax?: number;
}

export interface SearchFilterOptions {
  platforms: string[];
  actresses: string[];
  directors: string[];
  authors: string[];
  franchises: string[];
  series: string[];
}

export interface RandomPickFilters {
  query: string;
  entryTypes: string[];
  ratingOperator: "any" | "eq" | "gte" | "lte";
  ratingValue: number;
  yearMode: "any" | "exact" | "range";
  yearExact: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  localCopy: "any" | "yes" | "no";
  rewatchStatus: "any" | "never" | "has";
  duplicates: "any" | "yes" | "no";
  genres: string[];
  platforms: string[];
  actresses: string[];
  directors: string[];
  authors: string[];
  franchises: string[];
  series: string[];
}

export interface RandomPickFilterOptions {
  genres: string[];
  platforms: string[];
  franchises: string[];
  series: string[];
  years: number[];
  entryTypes: string[];
}

export interface AutocompleteOptions {
  platforms: string[];
  franchises: string[];
  series: string[];
  authors: string[];
  artists: string[];
  directors: string[];
  actresses: string[];
  genres: string[];
}
