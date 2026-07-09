import { isAdultMediaEnabled } from '../settings';
import { ADULT_ENTRY_TYPES, isAdultType } from '../media-config';

/**
 * SQL fragment that excludes adult entries when the Adult Media setting is off.
 * Returns '' when enabled. Designed to be appended inside an existing WHERE
 * clause (note the leading ' AND '). Rows with a NULL entry_type are kept.
 * The data is never deleted — this only hides it from queries.
 */
export function adultExclusionSql(): string {
  if (isAdultMediaEnabled()) return '';
  const list = ADULT_ENTRY_TYPES.map((t) => `'${t.replace(/'/g, "''")}'`).join(', ');
  return ` AND (entry_type IS NULL OR entry_type NOT IN (${list}))`;
}

/**
 * In-memory equivalent of adultExclusionSql for array-returning fetches that are
 * simpler to post-filter than to splice into positional-parameter SQL.
 */
export function filterHiddenEntries<T extends { entry_type: string | null }>(rows: T[]): T[] {
  if (isAdultMediaEnabled()) return rows;
  return rows.filter((r) => !isAdultType(r.entry_type));
}

/** Escape LIKE wildcards so user input matches literally (used with ESCAPE '\\'). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
