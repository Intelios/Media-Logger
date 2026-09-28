import { ADULT_ENTRY_TYPES } from '../media-config';
import { connect } from './connection';
import { adultExclusionSql, escapeLike } from './shared';
import { notifyEntriesMutated } from './events';
import { recordAvgHistoryForEntryMutation } from './avg-history';
import type {
  EntryCardSummary,
  EntryDetail,
  EntrySearchFilters,
  MediaEntry,
  PagedResult,
  SearchPageCursor,
  StatsEntry,
} from './types';

export const ENTRY_SEARCH_PAGE_SIZE = 100;
const ENTRY_DETAIL_BATCH_SIZE = 900;

const ENTRY_CARD_SUMMARY_COLUMNS = [
  'id',
  'name',
  'genre',
  'completion_date',
  'review_score',
  'year_completed',
  'is_rewatch',
  'own_local_copy',
  'has_subtitles',
  'is_platinum',
  'is_completed',
  'is_early_access',
  'early_access_version',
  'is_expansion',
  'parent_entry_id',
  'image_url',
  'entry_type',
  'platform',
  'author',
  'artist',
  'director',
  'actress',
  'update_version',
  'franchise',
  'series',
] as const satisfies readonly (keyof EntryCardSummary)[];

const STATS_ENTRY_COLUMNS = [
  'id',
  'name',
  'genre',
  'completion_date',
  'review_score',
  'year_completed',
  'is_rewatch',
  'own_local_copy',
  'has_subtitles',
  'is_platinum',
  'is_completed',
  'is_early_access',
  'is_expansion',
  'parent_entry_id',
  'image_url',
  'entry_type',
  'platform',
  'author',
  'artist',
  'director',
  'actress',
  'franchise',
  'series',
] as const satisfies readonly (keyof StatsEntry)[];

// Writable columns of the entries table. addEntry/updateEntry build their SQL
// from this whitelist so stray properties on the object (e.g. UI decorations
// like ReorderModal's `subtitle` or our display-only `parent_name`) can never
// leak into an INSERT/UPDATE and fail with "no such column".
const ENTRY_COLUMNS = [
  'name',
  'genre',
  'completion_date',
  'review_score',
  'description',
  'notes',
  'year_completed',
  'is_rewatch',
  'own_local_copy',
  'has_subtitles',
  'is_platinum',
  'is_completed',
  'is_early_access',
  'early_access_version',
  'is_expansion',
  'parent_entry_id',
  'image_url',
  'entry_type',
  'platform',
  'author',
  'artist',
  'director',
  'actress',
  'update_version',
  'franchise',
  'series',
] as const satisfies readonly (keyof Omit<MediaEntry, 'id'>)[];
function selectColumns(columns: readonly string[], alias?: string): string {
  const prefix = alias ? `${alias}.` : '';
  return columns.map((column) => `${prefix}${column}`).join(', ');
}

// Display-only projections joined via correlated scalar subqueries. A plain
// self-LEFT JOIN would make the bare `entry_type` inside adultExclusionSql()
// ambiguous, so we resolve the parent name and the expansion count without
// touching the FROM clause (and therefore without touching any existing SQL).
const EXPANSION_PROJECTIONS = `,
       (SELECT p.name FROM entries p WHERE p.id = entries.parent_entry_id) AS parent_name,
       (SELECT COUNT(*) FROM entries c WHERE c.parent_entry_id = entries.id) AS expansion_count`;
const EXPANSION_PROJECTIONS_E = `,
       (SELECT p.name FROM entries p WHERE p.id = e.parent_entry_id) AS parent_name,
       (SELECT COUNT(*) FROM entries c WHERE c.parent_entry_id = e.id) AS expansion_count`;

export async function getAllEntries(): Promise<MediaEntry[]> {
  const db = await connect();
  return db.select<MediaEntry[]>(
    `SELECT *${EXPANSION_PROJECTIONS}
     FROM entries
     WHERE 1 = 1${adultExclusionSql()}
     ORDER BY completion_date DESC, id DESC`,
  );
}

export async function getAllEntrySummaries(): Promise<EntryCardSummary[]> {
  const db = await connect();
  return db.select<EntryCardSummary[]>(
    `SELECT ${selectColumns(ENTRY_CARD_SUMMARY_COLUMNS)}${EXPANSION_PROJECTIONS}
     FROM entries
     WHERE 1 = 1${adultExclusionSql()}
     ORDER BY completion_date DESC, id DESC`,
  );
}

/** Fetch the expansion rows linked to a base game for the parent-card modal. */
export async function getExpansionsForEntry(parentEntryId: number): Promise<EntryCardSummary[]> {
  const db = await connect();
  return db.select<EntryCardSummary[]>(
    `SELECT ${selectColumns(ENTRY_CARD_SUMMARY_COLUMNS)}${EXPANSION_PROJECTIONS}
     FROM entries
     WHERE parent_entry_id = $1${adultExclusionSql()}
     ORDER BY completion_date DESC, id DESC`,
    [parentEntryId],
  );
}

export async function getEntryById(id: number): Promise<EntryDetail | null> {
  const db = await connect();
  const rows = await db.select<EntryDetail[]>(
    `SELECT *${EXPANSION_PROJECTIONS} FROM entries WHERE id = $1${adultExclusionSql()}`,
    [id],
  );
  return rows[0] ?? null;
}

/** Fetch full detail rows for an explicit UI action without an N+1 invoke loop. */
export async function getEntriesByIds(ids: number[]): Promise<EntryDetail[]> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return [];

  const db = await connect();
  const byId = new Map<number, EntryDetail>();
  for (let index = 0; index < uniqueIds.length; index += ENTRY_DETAIL_BATCH_SIZE) {
    const batch = uniqueIds.slice(index, index + ENTRY_DETAIL_BATCH_SIZE);
    const placeholders = batch.map((_, paramIndex) => `$${paramIndex + 1}`).join(', ');
    const rows = await db.select<EntryDetail[]>(
      `SELECT *${EXPANSION_PROJECTIONS}
       FROM entries
       WHERE id IN (${placeholders})${adultExclusionSql()}`,
      batch,
    );
    for (const row of rows) byId.set(row.id, row);
  }
  return uniqueIds
    .map((id) => byId.get(id))
    .filter((entry): entry is EntryDetail => entry !== undefined);
}

/** True when the database contains any entry, including currently hidden adult entries. */
export async function hasEntries(): Promise<boolean> {
  const db = await connect();
  const rows = await db.select<Array<{ has_entries: number }>>(
    'SELECT EXISTS(SELECT 1 FROM entries LIMIT 1) AS has_entries',
  );
  return rows[0]?.has_entries === 1;
}

/**
 * Every image filename referenced anywhere in the DB (entries, backlog
 * items, and profiles), lowercased, for unused-image cleanup. Deliberately
 * NOT built on getAllEntries(), which excludes hidden/adult rows and would
 * therefore omit covers that are still in use.
 * Any query failure propagates: callers must abort rather than treat a
 * DB error as "no references".
 */
export async function getAllReferencedImagePaths(): Promise<Set<string>> {
  const paths = await getAllReferencedCoverPaths();
  const referenced = new Set<string>();
  for (const value of paths) {
    const basename = value.split(/[/\\]/).pop();
    if (basename) referenced.add(basename.toLowerCase());
  }
  return referenced;
}

/** Relative local cover identities used by native derivative prewarming. */
export async function getAllReferencedCoverPaths(): Promise<string[]> {
  const db = await connect();
  const rows = await db.select<{ image_url: string }[]>(
    `SELECT image_url FROM entries WHERE image_url IS NOT NULL AND image_url <> ''
     UNION
     SELECT image_url FROM backlog_items WHERE image_url IS NOT NULL AND image_url <> ''
     UNION
     SELECT image_url FROM profiles WHERE image_url IS NOT NULL AND image_url <> ''`,
  );
  return rows
    .map((row) => row.image_url.trim().replace(/\\/gu, '/'))
    .filter((value) => value.length > 0 && !/^https?:\/\//iu.test(value));
}

/**
 * Count of adult entries, ignoring the Adult Media setting. Used by the
 * Settings confirmation dialog to tell the user how many entries will be
 * hidden (not deleted) when they turn the setting off.
 */
export async function countAdultEntries(): Promise<number> {
  const db = await connect();
  const list = ADULT_ENTRY_TYPES.map((t) => `'${t.replace(/'/g, "''")}'`).join(', ');
  const result = await db.select<{ count: number }[]>(
    `SELECT COUNT(*) as count FROM entries WHERE entry_type IN (${list})`
  );
  return result[0]?.count ?? 0;
}

interface SearchQueryParts {
  fromClause: string;
  whereClause: string;
  params: unknown[];
}

function toFtsPhrase(query: string): string {
  return `"${query.replace(/"/g, '""')}"`;
}

function buildSearchQuery(filters: EntrySearchFilters): SearchQueryParts {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let fromClause = 'entries e';

  const query = filters.query?.trim().toLowerCase();
  if (query) {
    if ([...query].length >= 3) {
      fromClause = 'entries e JOIN entries_fts ON entries_fts.rowid = e.id';
      params.push(toFtsPhrase(query));
      conditions.push(`entries_fts MATCH $${params.length}`);
    } else {
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
        return `LOWER(COALESCE(e.${column}, '')) LIKE $${params.length} ESCAPE '\\'`;
      });
      conditions.push(`(${searchClauses.join(' OR ')})`);
    }
  }

  const addInFilter = (column: string, values: string[]) => {
    if (values.length === 0) return;
    const placeholders = values.map((value) => {
      params.push(value);
      return `$${params.length}`;
    });
    conditions.push(`e.${column} IN (${placeholders.join(', ')})`);
  };

  addInFilter('entry_type', filters.entryTypes);
  addInFilter('platform', filters.platforms);
  addInFilter('director', filters.directors);
  addInFilter('author', filters.authors);
  addInFilter('franchise', filters.franchises);
  addInFilter('series', filters.series);

  if (filters.actresses.length > 0) {
    const normalizedActressColumn = `(',' || REPLACE(REPLACE(COALESCE(e.actress, ''), ', ', ','), ' ,', ',') || ',')`;
    const actressClauses = filters.actresses.map((actress) => {
      params.push(actress);
      return `INSTR(${normalizedActressColumn}, ',' || $${params.length} || ',') > 0`;
    });
    conditions.push(`(${actressClauses.join(' OR ')})`);
  }

  // Unrated entries (review_score IS NULL) never match these comparisons.
  if (filters.scoreMin != null) {
    params.push(filters.scoreMin);
    conditions.push(`e.review_score >= $${params.length}`);
  }
  if (filters.scoreMax != null) {
    params.push(filters.scoreMax);
    conditions.push(`e.review_score <= $${params.length}`);
  }

  const conditionsSql = conditions.map((condition) => ` AND ${condition}`).join('');
  return {
    fromClause,
    whereClause: `WHERE 1 = 1${conditionsSql}${adultExclusionSql()}`,
    params,
  };
}

/**
 * Fetch one page of search results. Queries of three or more characters use
 * the trigram FTS index; one- and two-character queries retain literal LIKE
 * semantics, while still bounding the returned rows.
 *
 * Pagination is keyset-based on (completion_date DESC, id DESC), which
 * idx_entries_completion_id serves as a range, so page N costs the same as
 * page 1. Only the first call (no cursor) runs the COUNT for the result
 * header — "load more" pages pass the previous page's cursor back and never
 * re-run the match a second time just to recount a stable total. hasMore is
 * derived independently of the COUNT by over-fetching one row past the page
 * size and trimming it.
 *
 * NULL completion dates sort LAST in DESC order, and OR-ing the NULL block
 * into the row-value range would collapse SQLite's index SEARCH into a full
 * SCAN, so a dated cursor first pages the dated range (which excludes NULLs)
 * and only queries the NULL block once that range is exhausted. A NULL cursor
 * pages the NULL block directly by id.
 */
export async function searchEntriesPaged(
  filters: EntrySearchFilters,
  cursor?: SearchPageCursor | null,
): Promise<PagedResult<EntryCardSummary>> {
  const db = await connect();
  const { fromClause, whereClause, params } = buildSearchQuery(filters);

  const fetchRows = (condition: string, extraParams: unknown[], limit: number) => {
    const allParams = [...params, ...extraParams, limit];
    return db.select<EntryCardSummary[]>(
      `SELECT ${selectColumns(ENTRY_CARD_SUMMARY_COLUMNS, 'e')}${EXPANSION_PROJECTIONS_E}
       FROM ${fromClause}
       ${whereClause}${condition ? ` AND ${condition}` : ''}
       ORDER BY e.completion_date DESC, e.id DESC
       LIMIT $${allParams.length}`,
      allParams,
    );
  };

  const toResult = (rows: EntryCardSummary[], total: number | null): PagedResult<EntryCardSummary> => {
    const hasMore = rows.length > ENTRY_SEARCH_PAGE_SIZE;
    const items = hasMore ? rows.slice(0, ENTRY_SEARCH_PAGE_SIZE) : rows;
    const last = items[items.length - 1];
    return {
      items,
      pageSize: ENTRY_SEARCH_PAGE_SIZE,
      total,
      hasMore,
      nextCursor: last ? { completionDate: last.completion_date, id: last.id } : null,
    };
  };

  if (cursor && cursor.completionDate != null) {
    const dateParam = `$${params.length + 1}`;
    const idParam = `$${params.length + 2}`;
    const datedRows = await fetchRows(
      `(e.completion_date, e.id) < (${dateParam}, ${idParam})`,
      [cursor.completionDate, cursor.id],
      ENTRY_SEARCH_PAGE_SIZE + 1,
    );
    if (datedRows.length > ENTRY_SEARCH_PAGE_SIZE) return toResult(datedRows, null);
    // Dated range exhausted and the NULL block sorts after it: continue the
    // same page into it.
    const nullRows = await fetchRows(
      'e.completion_date IS NULL',
      [],
      ENTRY_SEARCH_PAGE_SIZE + 1 - datedRows.length,
    );
    return toResult([...datedRows, ...nullRows], null);
  }

  if (cursor) {
    const idParam = `$${params.length + 1}`;
    const rows = await fetchRows(
      `e.completion_date IS NULL AND e.id < ${idParam}`,
      [cursor.id],
      ENTRY_SEARCH_PAGE_SIZE + 1,
    );
    return toResult(rows, null);
  }

  const [countRows, rows] = await Promise.all([
    db.select<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM ${fromClause} ${whereClause}`,
      params,
    ),
    fetchRows('', [], ENTRY_SEARCH_PAGE_SIZE + 1),
  ]);
  return toResult(rows, countRows[0]?.total ?? 0);
}

/**
 * Compatibility wrapper for existing callers that still expect every full
 * row. New list/search surfaces should use searchEntriesPaged and fetch
 * getEntryById only when opening details.
 */
export async function searchEntries(filters: EntrySearchFilters): Promise<MediaEntry[]> {
  const db = await connect();
  const { fromClause, whereClause, params } = buildSearchQuery(filters);

  return db.select<MediaEntry[]>(
    `SELECT e.*
     FROM ${fromClause}
     ${whereClause}
     ORDER BY e.completion_date DESC, e.id DESC`,
    params,
  );
}

export async function getEntriesByYear(year: string): Promise<MediaEntry[]> {
  const db = await connect();
  return db.select<MediaEntry[]>(
    `SELECT *
     FROM entries
     WHERE year_completed = $1${adultExclusionSql()}
     ORDER BY completion_date ASC, id ASC`,
    [year],
  );
}

export async function getEntrySummariesByYear(year: string): Promise<EntryCardSummary[]> {
  const db = await connect();
  return db.select<EntryCardSummary[]>(
    `SELECT ${selectColumns(ENTRY_CARD_SUMMARY_COLUMNS)}${EXPANSION_PROJECTIONS}
     FROM entries
     WHERE year_completed = $1${adultExclusionSql()}
     ORDER BY completion_date ASC, id ASC`,
    [year],
  );
}

/** Stats projection for a year or All Time; no type/range refetching is introduced. */
export async function getStatsEntries(yearFilter?: string): Promise<StatsEntry[]> {
  const db = await connect();
  const params: unknown[] = [];
  let yearCondition = '';
  if (yearFilter && yearFilter !== 'All Time') {
    params.push(yearFilter);
    yearCondition = ` AND year_completed = $${params.length}`;
  }
  return db.select<StatsEntry[]>(
    `SELECT ${selectColumns(STATS_ENTRY_COLUMNS)}
     FROM entries
     WHERE 1 = 1${yearCondition}${adultExclusionSql()}`,
    params,
  );
}

export async function addEntry(entry: Omit<MediaEntry, "id">): Promise<number> {
  const db = await connect();
  const keys = ENTRY_COLUMNS.filter((k) => k in entry);
  const values = keys.map((k) => entry[k]);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(",");

  const result: any = await db.execute(
    `INSERT INTO entries (${keys.join(",")}) VALUES (${placeholders})`,
    values
  );
  notifyEntriesMutated();
  await recordAvgHistoryForEntryMutation(null, entry);
  return result.lastInsertId;
}

export async function updateEntry(entry: MediaEntry): Promise<void> {
  const db = await connect();
  const id = entry.id;
  const keys = ENTRY_COLUMNS.filter((k) => k in entry);
  const values = keys.map((k) => entry[k]);

  const setString = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");

  // Fetch the row before update so profile membership changes (e.g. an
  // entry's actress field being edited to a different name) append points
  // for BOTH the old and new affected profiles.
  const oldRows = await db.select<MediaEntry[]>("SELECT * FROM entries WHERE id = $1", [id]);
  const oldEntry = oldRows[0];

  await db.execute(
    `UPDATE entries SET ${setString} WHERE id = $${values.length + 1}`,
    [...values, id]
  );
  notifyEntriesMutated();

  await recordAvgHistoryForEntryMutation(oldEntry, entry);
}

export async function deleteEntry(id: number): Promise<void> {
  const db = await connect();
  const rows = await db.select<MediaEntry[]>("SELECT * FROM entries WHERE id = $1", [id]);
  const entry = rows[0];
  await db.execute("DELETE FROM entries WHERE id = $1", [id]);
  notifyEntriesMutated();
  if (entry) {
    await recordAvgHistoryForEntryMutation(entry, null);
  }
}

/**
 * For writers that bypass addEntry/updateEntry/deleteEntry (e.g. the backup
 * importer's raw SQL). Fires the same listeners + cache invalidation as the
 * normal mutation path so the distinct-values and profile caches rebuild.
 */
export function notifyExternalMutation(): void {
  notifyEntriesMutated();
}

/**
 * Find all entries with the same name (for duplicate/rewatch detection)
 */
export async function getEntriesByName(name: string): Promise<MediaEntry[]> {
  const db = await connect();
  return db.select<MediaEntry[]>(
    `SELECT *
     FROM entries
     WHERE name = $1${adultExclusionSql()}
     ORDER BY completion_date ASC, id ASC`,
    [name],
  );
}
