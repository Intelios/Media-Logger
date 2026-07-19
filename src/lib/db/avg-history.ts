import { connect } from './connection';
import { filterHiddenEntries } from './shared';
import type { AvgHistoryPoint, MediaEntry } from './types';

export async function isAvgHistoryEnabled(type: string, name: string): Promise<boolean> {
  const db = await connect();
  const rows = await db.select<{ track_avg_history: number }[]>(
    "SELECT track_avg_history FROM profiles WHERE type = $1 AND name = $2",
    [type, name]
  );
  return rows.length > 0 && rows[0].track_avg_history === 1;
}

export async function setAvgHistoryEnabled(type: string, name: string, enabled: boolean): Promise<void> {
  const db = await connect();
  // Upsert the toggle while preserving any existing image_url/crop_data.
  await db.execute(
    `INSERT INTO profiles (type, name, image_url, track_avg_history)
     VALUES ($1, $2, COALESCE((SELECT image_url FROM profiles WHERE type = $1 AND name = $2), ''), $3)
     ON CONFLICT(type, name) DO UPDATE SET track_avg_history = excluded.track_avg_history`,
    [type, name, enabled ? 1 : 0]
  );
}

export async function getAvgHistory(type: string, name: string): Promise<AvgHistoryPoint[]> {
  const db = await connect();
  return await db.select<AvgHistoryPoint[]>(
    `SELECT captured_at, average_score, rated_count, total_count, source
     FROM profile_avg_history
     WHERE type = $1 AND name = $2
     ORDER BY captured_at ASC`,
    [type, name]
  );
}

export async function appendAvgHistoryPoint(
  type: string,
  name: string,
  averageScore: number,
  ratedCount: number,
  totalCount: number,
  source: 'mutation' | 'backfill'
): Promise<void> {
  if (ratedCount === 0) return; // don't pollute chart with unrated-only snapshots
  const db = await connect();
  // Use millisecond ISO timestamps; on rare collision (INSERT OR IGNORE
  // affects 0 rows), bump by 1ms until unique.
  let capturedAt = new Date().toISOString();
  for (let attempts = 0; attempts < 20; attempts++) {
    const result = await db.execute(
      `INSERT OR IGNORE INTO profile_avg_history
       (type, name, captured_at, average_score, rated_count, total_count, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [type, name, capturedAt, averageScore, ratedCount, totalCount, source]
    );
    if (result.rowsAffected > 0) return;
    capturedAt = new Date(Date.parse(capturedAt) + 1).toISOString();
  }
}

/**
 * Append AVG history points for every tracked profile affected by an entry
 * mutation. Determined by comma-splitting the entry's seven profile fields
 * (matching profiles-logic.ts processField). Called from add/update/delete
 * AFTER the write so the recomputed AVG reflects the new state.
 */
export async function appendAvgHistoryForAffectedProfiles(entry: MediaEntry): Promise<void> {
  const db = await connect();
  const pairs: Array<[string, string]> = [];
  const collect = (field: keyof MediaEntry, type: string, allow: boolean) => {
    if (!allow) return;
    const value = entry[field];
    if (typeof value === 'string' && value) {
      value.split(',').map(s => s.trim()).filter(s => s).forEach(name => {
        pairs.push([type, name]);
      });
    }
  };
  collect('director', 'director', true);
  collect('actress', 'actress', true);
  collect('artist', 'artist', true);
  collect('author', 'author', true);
  collect('platform', 'platform', entry.entry_type === 'Game');
  collect('franchise', 'franchise', entry.entry_type === 'Game');
  collect('series', 'series', ['Show', 'K-Drama', 'Anime', 'Comic'].includes(entry.entry_type || ''));

  if (pairs.length === 0) return;

  // Which of the affected profiles have tracking enabled?
  const placeholders = pairs.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
  const trackedRows = await db.select<{ type: string; name: string }[]>(
    `SELECT type, name FROM profiles WHERE track_avg_history = 1 AND (type, name) IN (${placeholders})`,
    pairs.flat()
  );
  if (trackedRows.length === 0) return;

  // Fetch all entries once to compute per-profile AVGs (mirrors profiles-logic
  // aggregation, but scoped to each tracked profile key).
  const allRows = filterHiddenEntries(await db.select<MediaEntry[]>("SELECT * FROM entries"));
  const matchesProfile = (type: string, name: string, e: MediaEntry): boolean => {
    const field = type as keyof MediaEntry;
    const val = e[field];
    if (typeof val !== 'string' || !val) return false;
    return val.split(',').map(s => s.trim()).includes(name);
  };

  for (const { type, name } of trackedRows) {
    let totalCount = 0;
    let totalScore = 0;
    let ratedCount = 0;
    for (const e of allRows) {
      if (!matchesProfile(type, name, e)) continue;
      totalCount++;
      if (e.review_score != null) {
        totalScore += e.review_score;
        ratedCount++;
      }
    }
    if (ratedCount === 0) continue;
    const avg = parseFloat((totalScore / ratedCount).toFixed(1));
    await appendAvgHistoryPoint(type, name, avg, ratedCount, totalCount, 'mutation');
  }
}

/**
 * Retroactively populate AVG history for a profile by replaying its entries
 * in completion_date (fallback id) order. Called once when tracking is enabled.
 */
export async function backfillAvgHistory(type: string, name: string): Promise<void> {
  const db = await connect();
  const allRows = filterHiddenEntries(await db.select<MediaEntry[]>("SELECT * FROM entries"));
  const field = type as keyof MediaEntry;
  const matching = allRows
    .filter(e => {
      const val = e[field];
      if (typeof val !== 'string' || !val) return false;
      return val.split(',').map(s => s.trim()).includes(name);
    })
    .sort((a, b) => {
      const da = a.completion_date || '';
      const db2 = b.completion_date || '';
      if (da && db2) return da.localeCompare(db2);
      if (da) return -1;
      if (db2) return 1;
      return (a.id ?? 0) - (b.id ?? 0);
    });

  if (matching.length === 0) return;

  let totalScore = 0;
  let ratedCount = 0;
  let totalCount = 0;
  let lastTs: string | null = null;
  // Walk in chronological order, emitting one point per distinct date. Entries
  // sharing a completion_date are folded into a single point holding the
  // running average AFTER all of that day's entries (the PK is one row per
  // timestamp, so per-entry points on the same date would collide). Entries
  // without a date get a synthesized increasing timestamp so PK ordering
  // stays stable.
  for (let i = 0; i < matching.length; i++) {
    const entry = matching[i];
    totalCount++;
    if (entry.review_score != null) {
      totalScore += entry.review_score;
      ratedCount++;
    }
    // Defer the insert while the next entry shares this completion_date.
    const next = matching[i + 1];
    if (entry.completion_date && next?.completion_date === entry.completion_date) continue;
    if (ratedCount === 0) continue;
    let ts: string | null = entry.completion_date;
    if (!ts) {
      // Synthesize a strictly-increasing timestamp after the last one used,
      // anchored at the Unix epoch so null-dated entries cluster before any
      // real date. Each step adds 1 second.
      const base: number = lastTs ? Date.parse(lastTs) : 0;
      ts = new Date(base + 1000).toISOString();
    }
    const avg = parseFloat((totalScore / ratedCount).toFixed(1));
    // OR IGNORE keeps pre-existing rows (e.g. from an earlier backfill run)
    // rather than overwriting them.
    await db.execute(
      `INSERT OR IGNORE INTO profile_avg_history
       (type, name, captured_at, average_score, rated_count, total_count, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'backfill')`,
      [type, name, ts, avg, ratedCount, totalCount]
    );
    lastTs = ts;
  }

  // Append a final point at the current AVG so the chart starts current.
  const finalAvg = ratedCount > 0 ? parseFloat((totalScore / ratedCount).toFixed(1)) : 0;
  if (ratedCount > 0) {
    await appendAvgHistoryPoint(type, name, finalAvg, ratedCount, totalCount, 'backfill');
  }
}
