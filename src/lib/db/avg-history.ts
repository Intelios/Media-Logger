import type Database from '@tauri-apps/plugin-sql';
import { ADULT_MEDIA_VISIBILITY_CHANGED_EVENT } from '../settings';
import {
  PROFILE_FIELD_BY_TYPE,
  entryMatchesProfile,
  extractProfileIdentities,
  getProfileKey,
  isProfileType,
  type ProfileEntrySource,
  type ProfileIdentity,
  type ProfileType,
} from '../profiles/domain';
import { connect } from './connection';
import { adultExclusionSql } from './shared';
import type { AvgHistoryPoint, MediaEntry } from './types';

const HISTORY_BATCH_SIZE = 100;
const TIMESTAMP_COLLISION_ATTEMPTS = 20;

interface TrackedProfileRow {
  type: string;
  name: string;
}

interface ProfileAverageSnapshot extends ProfileIdentity {
  averageScore: number;
  ratedCount: number;
  totalCount: number;
}

interface ProfileAverageAggregateRow {
  average_score: number | null;
  rated_count: number;
  total_count: number;
}

interface HistoryInsertRow extends ProfileIdentity {
  capturedAt: string;
  averageScore: number;
  ratedCount: number;
  totalCount: number;
  source: 'mutation' | 'backfill';
}

type BackfillEntry = ProfileEntrySource & Pick<MediaEntry, 'id' | 'completion_date' | 'review_score'>;

function chunkRows<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function collectProfileIdentities(
  entries: Array<ProfileEntrySource | null | undefined>,
): Map<string, ProfileIdentity> {
  const identities = new Map<string, ProfileIdentity>();
  for (const entry of entries) {
    if (!entry) continue;
    for (const identity of extractProfileIdentities(entry)) {
      identities.set(getProfileKey(identity), identity);
    }
  }
  return identities;
}

async function insertHistoryRows(db: Database, rows: HistoryInsertRow[]): Promise<void> {
  for (const batch of chunkRows(rows, HISTORY_BATCH_SIZE)) {
    const params: unknown[] = [];
    const values = batch.map((row) => {
      const offset = params.length;
      params.push(
        row.type,
        row.name,
        row.capturedAt,
        row.averageScore,
        row.ratedCount,
        row.totalCount,
        row.source,
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
    });
    await db.execute(
      `INSERT OR IGNORE INTO profile_avg_history
       (type, name, captured_at, average_score, rated_count, total_count, source)
       VALUES ${values.join(', ')}`,
      params,
    );
  }
}

async function allocateCurrentHistoryRows(
  db: Database,
  snapshots: ProfileAverageSnapshot[],
  source: 'mutation' | 'backfill',
): Promise<HistoryInsertRow[]> {
  const allocated: HistoryInsertRow[] = [];
  for (const batch of chunkRows(snapshots, HISTORY_BATCH_SIZE)) {
    const baseMs = Date.now();
    const windowStart = new Date(baseMs).toISOString();
    const windowEnd = new Date(baseMs + TIMESTAMP_COLLISION_ATTEMPTS - 1).toISOString();
    const tupleParams = batch.flatMap((snapshot) => [snapshot.type, snapshot.name]);
    const tuples = batch.map((_, index) => `($${index * 2 + 3}, $${index * 2 + 4})`).join(', ');
    const occupiedRows = await db.select<Array<{ type: string; name: string; captured_at: string }>>(
      `SELECT type, name, captured_at
       FROM profile_avg_history
       WHERE captured_at >= $1 AND captured_at <= $2
         AND (type, name) IN (${tuples})`,
      [windowStart, windowEnd, ...tupleParams],
    );
    const occupiedByProfile = new Map<string, Set<string>>();
    for (const row of occupiedRows) {
      if (!isProfileType(row.type)) continue;
      const key = getProfileKey({ type: row.type, name: row.name });
      const occupied = occupiedByProfile.get(key) ?? new Set<string>();
      occupied.add(row.captured_at);
      occupiedByProfile.set(key, occupied);
    }

    for (const snapshot of batch) {
      const occupied = occupiedByProfile.get(getProfileKey(snapshot));
      let capturedAt: string | null = null;
      for (let attempt = 0; attempt < TIMESTAMP_COLLISION_ATTEMPTS; attempt += 1) {
        const candidate = new Date(baseMs + attempt).toISOString();
        if (!occupied?.has(candidate)) {
          capturedAt = candidate;
          break;
        }
      }
      if (!capturedAt) {
        console.warn('Unable to allocate a unique AVG history timestamp', snapshot.type, snapshot.name);
        continue;
      }
      allocated.push({ ...snapshot, capturedAt, source });
    }
  }
  return allocated;
}

async function appendCurrentSnapshots(
  db: Database,
  snapshots: ProfileAverageSnapshot[],
  source: 'mutation' | 'backfill',
): Promise<void> {
  if (snapshots.length === 0) return;
  const rows = await allocateCurrentHistoryRows(db, snapshots, source);
  await insertHistoryRows(db, rows);
}

async function getTrackedProfiles(): Promise<Map<string, ProfileIdentity>> {
  const db = await connect();
  const rows = await db.select<TrackedProfileRow[]>(
    'SELECT type, name FROM profiles WHERE track_avg_history = 1',
  );
  const tracked = new Map<string, ProfileIdentity>();
  for (const row of rows) {
    if (!isProfileType(row.type)) continue;
    const identity = { type: row.type, name: row.name };
    tracked.set(getProfileKey(identity), identity);
  }
  return tracked;
}

function profileEntryTypeConstraint(type: ProfileType): string {
  if (type === 'platform' || type === 'franchise') {
    return " AND entry_type = 'Game'";
  }
  if (type === 'series') {
    return " AND entry_type IN ('Show', 'K-Drama', 'Anime')";
  }
  return '';
}

async function selectProfileAverageSnapshot(
  db: Database,
  identity: ProfileIdentity,
): Promise<ProfileAverageSnapshot | null> {
  // Profile fields are comma-delimited strings. The recursive CTE preserves
  // splitProfileNames()/entryMatchesProfile semantics (trimmed, exact tokens),
  // deduplicates repeated names within one entry, and returns only one aggregate
  // row across the Tauri boundary.
  const column = PROFILE_FIELD_BY_TYPE[identity.type];
  const rows = await db.select<ProfileAverageAggregateRow[]>(
    `WITH RECURSIVE profile_tokens(id, review_score, rest, token) AS (
       SELECT id, review_score, COALESCE(${column}, '') || ',', ''
       FROM entries
       WHERE INSTR(COALESCE(${column}, ''), $1) > 0
         ${profileEntryTypeConstraint(identity.type)}${adultExclusionSql()}
       UNION ALL
       SELECT id,
              review_score,
              SUBSTR(rest, INSTR(rest, ',') + 1),
              TRIM(
                SUBSTR(rest, 1, INSTR(rest, ',') - 1),
                char(9) || char(10) || char(11) || char(12) || char(13) || ' '
              )
       FROM profile_tokens
       WHERE rest <> ''
     ), matching_entries AS (
       SELECT id, MAX(review_score) AS review_score
       FROM profile_tokens
       WHERE token = $1
       GROUP BY id
     )
     SELECT AVG(review_score) AS average_score,
            COUNT(review_score) AS rated_count,
            COUNT(*) AS total_count
     FROM matching_entries`,
    [identity.name],
  );
  const aggregate = rows[0];
  if (!aggregate || aggregate.rated_count === 0 || aggregate.average_score == null) {
    return null;
  }
  return {
    ...identity,
    averageScore: Number(aggregate.average_score.toFixed(1)),
    ratedCount: aggregate.rated_count,
    totalCount: aggregate.total_count,
  };
}

async function appendSnapshotsForTrackedProfiles(
  affectedProfiles?: ReadonlyMap<string, ProfileIdentity>,
): Promise<void> {
  const tracked = await getTrackedProfiles();
  const targets = new Map<string, ProfileIdentity>();
  for (const [key, identity] of tracked) {
    if (!affectedProfiles || affectedProfiles.has(key)) targets.set(key, identity);
  }
  if (targets.size === 0) return;

  const db = await connect();
  const snapshots: ProfileAverageSnapshot[] = [];
  for (const identity of targets.values()) {
    const snapshot = await selectProfileAverageSnapshot(db, identity);
    if (snapshot) snapshots.push(snapshot);
  }
  await appendCurrentSnapshots(db, snapshots, 'mutation');
}

export async function isAvgHistoryEnabled(type: ProfileType, name: string): Promise<boolean> {
  const db = await connect();
  const rows = await db.select<{ track_avg_history: number }[]>(
    'SELECT track_avg_history FROM profiles WHERE type = $1 AND name = $2',
    [type, name],
  );
  return rows.length > 0 && rows[0].track_avg_history === 1;
}

export async function setAvgHistoryEnabled(
  type: ProfileType,
  name: string,
  enabled: boolean,
): Promise<void> {
  const db = await connect();
  await db.execute(
    `INSERT INTO profiles (type, name, image_url, track_avg_history)
     VALUES ($1, $2, '', $3)
     ON CONFLICT(type, name) DO UPDATE SET track_avg_history = excluded.track_avg_history`,
    [type, name, enabled ? 1 : 0],
  );
}

export async function getAvgHistory(type: ProfileType, name: string): Promise<AvgHistoryPoint[]> {
  const db = await connect();
  return db.select<AvgHistoryPoint[]>(
    `SELECT captured_at, average_score, rated_count, total_count, source
     FROM profile_avg_history
     WHERE type = $1 AND name = $2
     ORDER BY captured_at ASC`,
    [type, name],
  );
}

export async function appendAvgHistoryPoint(
  type: ProfileType,
  name: string,
  averageScore: number,
  ratedCount: number,
  totalCount: number,
  source: 'mutation' | 'backfill',
): Promise<void> {
  if (ratedCount === 0) return;
  const db = await connect();
  await appendCurrentSnapshots(db, [{ type, name, averageScore, ratedCount, totalCount }], source);
}

/** Record the post-write state once for the deduplicated union of old/new profile keys. */
export async function recordAvgHistoryForEntryMutation(
  before: ProfileEntrySource | null | undefined,
  after: ProfileEntrySource | null | undefined,
): Promise<void> {
  const affected = collectProfileIdentities([before, after]);
  if (affected.size === 0) return;
  await appendSnapshotsForTrackedProfiles(affected);
}

async function selectMatchingBackfillEntries(
  db: Database,
  type: ProfileType,
  name: string,
): Promise<BackfillEntry[]> {
  const column = PROFILE_FIELD_BY_TYPE[type];
  const rows = await db.select<BackfillEntry[]>(
    `SELECT id, completion_date, review_score, entry_type,
            director, actress, artist, author, platform, franchise, series
     FROM entries
     WHERE INSTR(COALESCE(${column}, ''), $1) > 0${adultExclusionSql()}
     ORDER BY id ASC`,
    [name],
  );
  return rows.filter((entry) => entryMatchesProfile(entry, type, name));
}

/** Retroactively populate history by replaying matching entries chronologically. */
export async function backfillAvgHistory(type: ProfileType, name: string): Promise<void> {
  const db = await connect();
  const matching = await selectMatchingBackfillEntries(db, type, name);
  matching.sort((a, b) => {
    const dateA = a.completion_date || '';
    const dateB = b.completion_date || '';
    if (dateA && dateB) return dateA.localeCompare(dateB);
    if (dateA) return -1;
    if (dateB) return 1;
    return a.id - b.id;
  });
  if (matching.length === 0) return;

  let totalScore = 0;
  let ratedCount = 0;
  let totalCount = 0;
  let lastCapturedAt: string | null = null;
  const rows: HistoryInsertRow[] = [];

  for (let index = 0; index < matching.length; index += 1) {
    const entry = matching[index];
    totalCount += 1;
    if (entry.review_score != null) {
      totalScore += entry.review_score;
      ratedCount += 1;
    }
    const next = matching[index + 1];
    if (entry.completion_date && next?.completion_date === entry.completion_date) continue;
    if (ratedCount === 0) continue;

    let capturedAt = entry.completion_date;
    if (!capturedAt) {
      const base: number = lastCapturedAt ? Date.parse(lastCapturedAt) : 0;
      capturedAt = new Date(base + 1000).toISOString();
    }
    rows.push({
      type,
      name,
      capturedAt,
      averageScore: Number((totalScore / ratedCount).toFixed(1)),
      ratedCount,
      totalCount,
      source: 'backfill',
    });
    lastCapturedAt = capturedAt;
  }

  await insertHistoryRows(db, rows);
  if (ratedCount > 0) {
    await appendCurrentSnapshots(db, [{
      type,
      name,
      averageScore: Number((totalScore / ratedCount).toFixed(1)),
      ratedCount,
      totalCount,
    }], 'backfill');
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener(ADULT_MEDIA_VISIBILITY_CHANGED_EVENT, () => {
    void appendSnapshotsForTrackedProfiles().catch((error) => {
      console.error('Failed to snapshot tracked profiles after Adult Media visibility changed:', error);
    });
  });
}
