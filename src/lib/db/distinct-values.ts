import type Database from '@tauri-apps/plugin-sql';
import { connect } from './connection';
import { adultExclusionSql } from './shared';
import { onEntriesMutated } from './events';
import type { AutocompleteOptions, SearchFilterOptions } from './types';

/**
 * Full set of distinct values for every filterable column. Both
 * AutocompleteOptions and SearchFilterOptions are derived from this single
 * object so the expensive recursive CTEs for actress/genre splitting run only
 * once per cache lifetime.
 */
interface DistinctValuesCache {
  platforms: string[];
  franchises: string[];
  series: string[];
  authors: string[];
  artists: string[];
  directors: string[];
  actresses: string[];
  genres: string[];
}

// Unified cache of all distinct column values (plain + comma-split fields)
// shared by getAutocompleteOptions() and getSearchFilterOptions(). Building
// these requires expensive recursive CTEs over the entries table, so we
// compute them once and reuse the result until entries are mutated.
// Invalidated by invalidateAutocompleteCache() (kept name for compat).
let distinctValuesCache: DistinctValuesCache | null = null;
// Guards the cache build so concurrent callers (Search page + EntryForm
// mounting simultaneously) share one set of queries instead of duplicating.
// Monotonic epoch: incrementing it on invalidation cancels any in-flight
// build so its (now-stale) result is never written back to the cache.
let distinctValuesEpoch: number = 0;
let distinctValuesPromise: Promise<DistinctValuesCache> | null = null;

export async function getDistinctColumnValues(
  db: Database,
  column: 'platform' | 'director' | 'author' | 'artist' | 'franchise' | 'series'
): Promise<string[]> {
  const results = await db.select<{ value: string }[]>(
    `SELECT DISTINCT TRIM(${column}) as value
     FROM entries
     WHERE ${column} IS NOT NULL AND TRIM(${column}) <> ''${adultExclusionSql()}
     ORDER BY value COLLATE NOCASE ASC`
  );

  return results.map(({ value }) => value);
}

export async function getDistinctSplitValues(
  db: Database,
  column: 'actress' | 'genre'
): Promise<string[]> {
  const results = await db.select<{ value: string }[]>(
    `WITH RECURSIVE split(value, rest) AS (
       SELECT '', TRIM(${column}) || ','
       FROM entries
       WHERE ${column} IS NOT NULL AND TRIM(${column}) <> ''${adultExclusionSql()}
       UNION ALL
       SELECT
         TRIM(SUBSTR(rest, 0, INSTR(rest, ','))),
         LTRIM(SUBSTR(rest, INSTR(rest, ',') + 1))
       FROM split
       WHERE rest <> ''
     )
     SELECT DISTINCT value
     FROM split
     WHERE value <> ''
     ORDER BY value COLLATE NOCASE ASC`
  );

  return results.map(({ value }) => value);
}

/**
 * Build the full set of distinct column values once and cache it. Both
 * getAutocompleteOptions() and getSearchFilterOptions() share this single
 * cached build so the recursive CTEs that split comma-delimited fields
 * (actress, genre) only run once per cache lifetime.
 *
 * Concurrent callers share the same in-flight promise to avoid duplicate
 * work when the Search page and EntryForm mount simultaneously.
 */
function getDistinctValues(): Promise<DistinctValuesCache> {
  if (distinctValuesCache) {
    return Promise.resolve(distinctValuesCache);
  }
  if (distinctValuesPromise) {
    return distinctValuesPromise;
  }

  const buildEpoch = distinctValuesEpoch;
  distinctValuesPromise = (async () => {
    const db = await connect();

    const [platforms, franchises, series, authors, artists, directors, actresses, genres] =
      await Promise.all([
        getDistinctColumnValues(db, 'platform'),
        getDistinctColumnValues(db, 'franchise'),
        getDistinctColumnValues(db, 'series'),
        getDistinctColumnValues(db, 'author'),
        getDistinctColumnValues(db, 'artist'),
        getDistinctColumnValues(db, 'director'),
        getDistinctSplitValues(db, 'actress'),
        getDistinctSplitValues(db, 'genre'),
      ]);

    const cache: DistinctValuesCache = {
      platforms,
      franchises,
      series,
      authors,
      artists,
      directors,
      actresses,
      genres,
    };
    // Only commit the cache if no invalidation happened during the build.
    if (buildEpoch === distinctValuesEpoch) {
      distinctValuesCache = cache;
    }
    return cache;
  })().finally(() => {
    // Drop the in-flight guard so the next caller retries. If an
    // invalidation landed during the build, it already cleared this.
    if (buildEpoch === distinctValuesEpoch) {
      distinctValuesPromise = null;
    }
  });

  return distinctValuesPromise;
}

export async function getSearchFilterOptions(): Promise<SearchFilterOptions> {
  const cache = await getDistinctValues();
  return {
    platforms: cache.platforms,
    actresses: cache.actresses,
    directors: cache.directors,
    authors: cache.authors,
    franchises: cache.franchises,
    series: cache.series,
  };
}

export async function getAutocompleteOptions(): Promise<AutocompleteOptions> {
  const cache = await getDistinctValues();
  return {
    platforms: cache.platforms,
    franchises: cache.franchises,
    series: cache.series,
    authors: cache.authors,
    artists: cache.artists,
    directors: cache.directors,
    actresses: cache.actresses,
    genres: cache.genres,
  };
}

export function invalidateAutocompleteCache(): void {
  // Bump the epoch so any in-flight build is discarded before it writes
  // its (now-stale) result back, then drop the cached values and guard.
  distinctValuesEpoch++;
  distinctValuesCache = null;
  distinctValuesPromise = null;
}

// The cache describes the entries table, so flush it on every entry mutation
// (previously done inline by notifyEntriesMutated).
onEntriesMutated(invalidateAutocompleteCache);
