import { ADULT_ENTRY_TYPES } from '../media-config';
import { connect } from './connection';
import { filterHiddenEntries, escapeLike } from './shared';
import { notifyEntriesMutated } from './events';
import { appendAvgHistoryForAffectedProfiles } from './avg-history';
import type { MediaEntry, EntrySearchFilters } from './types';

// Writable columns of the entries table. addEntry/updateEntry build their SQL
// from this whitelist so stray properties on the object (e.g. UI decorations
// like ReorderModal's `subtitle`) can never leak into an INSERT/UPDATE and
// fail with "no such column".
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

export async function getAllEntries(): Promise<MediaEntry[]> {
  const db = await connect();
  const rows = await db.select<MediaEntry[]>(
    "SELECT * FROM entries ORDER BY completion_date DESC, id DESC"
  );
  return filterHiddenEntries(rows);
}

/**
 * Every image filename referenced anywhere in the DB (entries, backlog
 * items, and profiles), lowercased, for unused-image cleanup. Deliberately
 * NOT built on getAllEntries(), which applies filterHiddenEntries and
 * would omit hidden/adult covers — those images are still in use.
 * Any query failure propagates: callers must abort rather than treat a
 * DB error as "no references".
 */
export async function getAllReferencedImagePaths(): Promise<Set<string>> {
  const db = await connect();
  const queries = [
    "SELECT image_url FROM entries WHERE image_url IS NOT NULL",
    "SELECT image_url FROM backlog_items WHERE image_url IS NOT NULL",
    "SELECT image_url FROM profiles WHERE image_url IS NOT NULL",
  ];

  const referenced = new Set<string>();
  for (const query of queries) {
    const rows = await db.select<{ image_url: string }[]>(query);
    for (const row of rows) {
      const value = row.image_url;
      if (!value || value.startsWith('http')) continue;
      // Values are normally "images/<uuid>.<ext>", but keep the basename
      // of anything non-http so legacy or odd path formats still protect
      // their files.
      const basename = value.split(/[/\\]/).pop();
      if (basename) referenced.add(basename.toLowerCase());
    }
  }
  return referenced;
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

export async function searchEntries(filters: EntrySearchFilters): Promise<MediaEntry[]> {
  const db = await connect();
  const conditions: string[] = [];
  const params: unknown[] = [];

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

  const addInFilter = (column: string, values: string[]) => {
    if (values.length === 0) return;
    const placeholders = values.map((value) => {
      params.push(value);
      return `$${params.length}`;
    });
    conditions.push(`${column} IN (${placeholders.join(', ')})`);
  };

  addInFilter('entry_type', filters.entryTypes);
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

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await db.select<MediaEntry[]>(
    `SELECT *
     FROM entries
     ${whereClause}
     ORDER BY completion_date DESC, id DESC`,
    params
  );
  return filterHiddenEntries(rows);
}

export async function getEntriesByYear(year: string): Promise<MediaEntry[]> {
  const db = await connect();
  const rows = await db.select<MediaEntry[]>(
    "SELECT * FROM entries WHERE year_completed = $1 ORDER BY completion_date ASC",
    [year]
  );
  return filterHiddenEntries(rows);
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
  await appendAvgHistoryForAffectedProfiles(entry as MediaEntry);
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

  if (oldEntry) {
    await appendAvgHistoryForAffectedProfiles(oldEntry);
  }
  await appendAvgHistoryForAffectedProfiles(entry);
}

export async function deleteEntry(id: number): Promise<void> {
  const db = await connect();
  const rows = await db.select<MediaEntry[]>("SELECT * FROM entries WHERE id = $1", [id]);
  const entry = rows[0];
  await db.execute("DELETE FROM entries WHERE id = $1", [id]);
  notifyEntriesMutated();
  if (entry) {
    await appendAvgHistoryForAffectedProfiles(entry);
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
  const rows = await db.select<MediaEntry[]>(
    "SELECT * FROM entries WHERE name = $1 ORDER BY completion_date ASC",
    [name]
  );
  return filterHiddenEntries(rows);
}
