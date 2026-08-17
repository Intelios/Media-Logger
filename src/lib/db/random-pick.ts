import { isAdultMediaEnabled } from '../settings';
import { ADULT_ENTRY_TYPES } from '../media-config';
import { connect } from './connection';
import { adultExclusionSql, escapeLike } from './shared';
import { getDistinctColumnValues } from './distinct-values';
import type { MediaEntry, RandomPickFilters, RandomPickFilterOptions } from './types';

export async function getRandomPickFilterOptions(): Promise<RandomPickFilterOptions> {
  const db = await connect();

  const [platforms, franchises, series, genres, years, entryTypes] = await Promise.all([
    getDistinctColumnValues(db, 'platform'),
    getDistinctColumnValues(db, 'franchise'),
    getDistinctColumnValues(db, 'series'),
    db.select<{ value: string }[]>(
      `WITH RECURSIVE split(value, rest) AS (
         SELECT '', TRIM(genre) || ','
         FROM entries
         WHERE genre IS NOT NULL AND TRIM(genre) <> ''${adultExclusionSql()}
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
    ),
    db.select<{ value: number }[]>(
      `SELECT DISTINCT year_completed as value
       FROM entries
       WHERE year_completed IS NOT NULL${adultExclusionSql()}
       ORDER BY year_completed DESC`
    ),
    db.select<{ value: string }[]>(
      `SELECT DISTINCT entry_type as value
       FROM entries
       WHERE entry_type IS NOT NULL AND TRIM(entry_type) <> ''${adultExclusionSql()}
       ORDER BY value COLLATE NOCASE ASC`
    ),
  ]);

  return {
    genres: genres.map(({ value }) => value),
    platforms,
    franchises,
    series,
    years: years.map(({ value }) => value),
    entryTypes: entryTypes.map(({ value }) => value),
  };
}

function buildRandomPickWhere(filters: RandomPickFilters): { whereClause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  // Free-text query matches the same columns as searchEntries so
  // "Use current search" yields the same pool as the search page.
  const query = filters.query?.trim().toLowerCase();
  if (query) {
    const searchableColumns = [
      'name',
      'author',
      'artist',
      'genre',
      'director',
      'actress',
      'platform',
      'series',
    ];

    const likeValue = `%${escapeLike(query)}%`;
    const searchClauses = searchableColumns.map((column) => {
      params.push(likeValue);
      return `LOWER(COALESCE(${column}, '')) LIKE $${params.length} ESCAPE '\\'`;
    });

    conditions.push(`(${searchClauses.join(' OR ')})`);
  }

  if (filters.entryTypes.length > 0) {
    const placeholders = filters.entryTypes.map((v) => {
      params.push(v);
      return `$${params.length}`;
    });
    conditions.push(`entry_type IN (${placeholders.join(', ')})`);
  }

  if (filters.ratingOperator !== "any") {
    const ops = { eq: "=", gte: ">=", lte: "<=" } as const;
    params.push(filters.ratingValue);
    conditions.push(`review_score ${ops[filters.ratingOperator]} $${params.length}`);
  }

  if (filters.yearMode === "exact" && filters.yearExact != null) {
    params.push(filters.yearExact);
    conditions.push(`year_completed = $${params.length}`);
  } else if (filters.yearMode === "range") {
    if (filters.yearFrom != null) {
      params.push(filters.yearFrom);
      conditions.push(`year_completed >= $${params.length}`);
    }
    if (filters.yearTo != null) {
      params.push(filters.yearTo);
      conditions.push(`year_completed <= $${params.length}`);
    }
  }

  if (filters.localCopy === "yes") {
    conditions.push(`own_local_copy = 1`);
  } else if (filters.localCopy === "no") {
    conditions.push(`own_local_copy = 0`);
  }

  if (filters.rewatchStatus === "never") {
    conditions.push(`is_rewatch = 0`);
  } else if (filters.rewatchStatus === "has") {
    conditions.push(`is_rewatch = 1`);
  }

  if (filters.duplicates !== "any") {
    // Names appearing on more than one row, compared case-insensitively with
    // surrounding whitespace ignored. The subquery applies the same adult
    // exclusion as the outer query so a hidden adult row never makes a
    // visible entry count as logged twice.
    const duplicateNames =
      `SELECT LOWER(TRIM(name)) FROM entries` +
      ` WHERE name IS NOT NULL${adultExclusionSql()}` +
      ` GROUP BY LOWER(TRIM(name)) HAVING COUNT(*) > 1`;
    conditions.push(
      filters.duplicates === "yes"
        ? `LOWER(TRIM(name)) IN (${duplicateNames})`
        : `LOWER(TRIM(name)) NOT IN (${duplicateNames})`
    );
  }

  if (filters.genres.length > 0) {
    const genreClauses = filters.genres.map((g) => {
      const escaped = escapeLike(g);
      params.push(`%${escaped}%`);
      return `genre LIKE $${params.length} ESCAPE '\\'`;
    });
    conditions.push(`(${genreClauses.join(' OR ')})`);
  }

  const addInFilter = (column: string, values: string[]) => {
    if (values.length === 0) return;
    const placeholders = values.map((v) => {
      params.push(v);
      return `$${params.length}`;
    });
    conditions.push(`${column} IN (${placeholders.join(', ')})`);
  };

  addInFilter('platform', filters.platforms);
  addInFilter('director', filters.directors);
  addInFilter('author', filters.authors);
  addInFilter('franchise', filters.franchises);
  addInFilter('series', filters.series);

  if (filters.actresses.length > 0) {
    const normalizedActressColumn = `(',' || REPLACE(REPLACE(COALESCE(actress, ''), ', ', ','), ' ,', ',') || ',')`;
    const actressClauses = filters.actresses.map((actress) => {
      params.push(actress);
      return `INSTR(${normalizedActressColumn}, ',' || $${params.length} || ',') > 0`;
    });
    conditions.push(`(${actressClauses.join(' OR ')})`);
  }

  // Hide adult entries from random picks (count and result) when disabled,
  // regardless of any stale entryTypes filter that might include them.
  if (!isAdultMediaEnabled()) {
    const list = ADULT_ENTRY_TYPES.map((t) => `'${t.replace(/'/g, "''")}'`).join(', ');
    conditions.push(`(entry_type IS NULL OR entry_type NOT IN (${list}))`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}

export async function getRandomPickCount(filters: RandomPickFilters): Promise<number> {
  const db = await connect();
  const { whereClause, params } = buildRandomPickWhere(filters);
  const result = await db.select<{ count: number }[]>(
    `SELECT COUNT(*) as count FROM entries ${whereClause}`,
    params
  );
  return result[0].count;
}

// Number of candidate names shown in the Random Pick reel. The winner is drawn
// from this same batch, so every name that flashes by is a genuine candidate
// from the filtered pool.
const RANDOM_PICK_POOL_SIZE = 12;

/**
 * A random batch of entries from the filtered pool. The modal rolls through
 * these names and picks the winner from the batch — one query serves both the
 * animation and the result, and the winner always appears in the reel.
 */
export async function getRandomPickCandidates(filters: RandomPickFilters): Promise<MediaEntry[]> {
  const db = await connect();
  const { whereClause, params } = buildRandomPickWhere(filters);
  return db.select<MediaEntry[]>(
    `SELECT * FROM entries ${whereClause} ORDER BY RANDOM() LIMIT ${RANDOM_PICK_POOL_SIZE}`,
    params
  );
}
