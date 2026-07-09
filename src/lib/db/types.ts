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
