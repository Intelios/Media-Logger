import {
  dbService,
  type AvgHistoryPoint,
  type MediaEntry,
  adultExclusionSql,
  onEntriesMutated,
} from './db';
import { ADULT_MEDIA_VISIBILITY_CHANGED_EVENT, isAdultMediaEnabled } from './settings';
import { saveImage } from './utils';
import {
  PROFILE_FIELD_BY_TYPE,
  PROFILE_TYPES,
  entryMatchesProfile,
  extractProfileIdentities,
  getProfileKey,
  makeProfileKey,
  parseCropData,
  type CropData,
  type ProfileAggregationEntry,
  type ProfileIdentity,
  type ProfileIndex,
  type ProfileSummary,
  type ProfileType,
} from './profiles/domain';

export { DEFAULT_CROP, PROFILE_TYPES, getProfileKey, isProfileType } from './profiles/domain';
export type { CropData, ProfileIdentity, ProfileIndex, ProfileSummary, ProfileType } from './profiles/domain';

interface ProfileMetadataRow {
  type: string;
  name: string;
  image_url: string;
  crop_data: string | null;
  track_avg_history: number;
}

interface ProfileAggregate {
  identity: ProfileIdentity;
  count: number;
  totalScore: number;
  ratedCount: number;
}

let profileIndexRevision = 0;
let profileIndexCache: { key: string; value: ProfileIndex } | null = null;
let profileIndexInFlight: { key: string; promise: Promise<ProfileIndex> } | null = null;

function profileIndexCacheKey(): string {
  return `${profileIndexRevision}:${isAdultMediaEnabled() ? 'adult' : 'filtered'}`;
}

export function invalidateProfilesCache(): void {
  profileIndexRevision += 1;
  profileIndexCache = null;
  profileIndexInFlight = null;
}

onEntriesMutated(invalidateProfilesCache);

if (typeof window !== 'undefined') {
  window.addEventListener(ADULT_MEDIA_VISIBILITY_CHANGED_EVENT, invalidateProfilesCache);
}

async function buildProfileIndex(): Promise<ProfileIndex> {
  const db = await dbService.connect();
  const [entries, metadataRows, hiddenRows] = await Promise.all([
    db.select<ProfileAggregationEntry[]>(
      `SELECT entry_type, review_score, director, actress, artist, author, platform, franchise, series
       FROM entries
       WHERE 1 = 1${adultExclusionSql()}
       ORDER BY id ASC`,
    ),
    db.select<ProfileMetadataRow[]>(
      `SELECT type, name, image_url, crop_data, track_avg_history
       FROM profiles`,
    ),
    db.select<{ type: string; name: string }[]>(
      `SELECT type, name
       FROM hidden_profiles`,
    ),
  ]);

  const aggregates = new Map<string, ProfileAggregate>();
  for (const entry of entries) {
    for (const identity of extractProfileIdentities(entry)) {
      const key = getProfileKey(identity);
      const aggregate = aggregates.get(key) ?? {
        identity,
        count: 0,
        totalScore: 0,
        ratedCount: 0,
      };
      aggregate.count += 1;
      if (entry.review_score != null) {
        aggregate.totalScore += entry.review_score;
        aggregate.ratedCount += 1;
      }
      aggregates.set(key, aggregate);
    }
  }

  const metadata = new Map<string, ProfileMetadataRow>();
  for (const row of metadataRows) {
    if (!isProfileTypeFromMetadata(row.type)) continue;
    metadata.set(makeProfileKey(row.type, row.name), row);
  }

  const hiddenKeys = new Set(
    hiddenRows
      .filter((row): row is { type: ProfileType; name: string } => isProfileTypeFromMetadata(row.type))
      .map((row) => makeProfileKey(row.type, row.name)),
  );

  const profiles: ProfileSummary[] = [];
  for (const [key, aggregate] of aggregates) {
    if (aggregate.count < 3) continue;
    const row = metadata.get(key);
    profiles.push({
      ...aggregate.identity,
      count: aggregate.count,
      average_score: aggregate.ratedCount > 0
        ? Number((aggregate.totalScore / aggregate.ratedCount).toFixed(1))
        : 0,
      image_url: row?.image_url,
      crop: parseCropData(row?.crop_data),
      track_avg_history: row?.track_avg_history === 1,
    });
  }
  profiles.sort((a, b) => b.count - a.count);

  const visible: ProfileSummary[] = [];
  const hidden: ProfileSummary[] = [];
  for (const profile of profiles) {
    (hiddenKeys.has(getProfileKey(profile)) ? hidden : visible).push(profile);
  }
  return { visible, hidden };
}

function isProfileTypeFromMetadata(value: string): value is ProfileType {
  return (PROFILE_TYPES as readonly string[]).includes(value);
}

async function getProfileIndex(): Promise<ProfileIndex> {
  const key = profileIndexCacheKey();
  if (profileIndexCache?.key === key) return profileIndexCache.value;
  if (profileIndexInFlight?.key === key) return profileIndexInFlight.promise;

  const promise = buildProfileIndex().then((value) => {
    if (profileIndexCacheKey() === key) {
      profileIndexCache = { key, value };
    }
    return value;
  });
  const record = { key, promise };
  profileIndexInFlight = record;
  promise
    .finally(() => {
      if (profileIndexInFlight === record) profileIndexInFlight = null;
    })
    .catch(() => undefined);
  return promise;
}

export const profilesLogic = {
  getProfileIndex,

  async getAllProfiles(): Promise<ProfileSummary[]> {
    return (await getProfileIndex()).visible;
  },

  async getHiddenProfiles(): Promise<ProfileSummary[]> {
    return (await getProfileIndex()).hidden;
  },

  async hideProfile(type: ProfileType, name: string): Promise<void> {
    const db = await dbService.connect();
    await db.execute(
      'INSERT OR IGNORE INTO hidden_profiles (type, name, hidden_date) VALUES ($1, $2, $3)',
      [type, name, new Date().toISOString()],
    );
    invalidateProfilesCache();
  },

  async unhideProfile(type: ProfileType, name: string): Promise<void> {
    const db = await dbService.connect();
    await db.execute(
      'DELETE FROM hidden_profiles WHERE type = $1 AND name = $2',
      [type, name],
    );
    invalidateProfilesCache();
  },

  async getProfileEntries(type: ProfileType, name: string): Promise<MediaEntry[]> {
    const db = await dbService.connect();
    const column = PROFILE_FIELD_BY_TYPE[type];
    const candidates = await db.select<MediaEntry[]>(
      `SELECT *
       FROM entries
       WHERE INSTR(COALESCE(${column}, ''), $1) > 0${adultExclusionSql()}
       ORDER BY id ASC`,
      [name],
    );
    return candidates.filter((entry) => entryMatchesProfile(entry, type, name));
  },

  async getProfileKeys(): Promise<Set<string>> {
    const index = await getProfileIndex();
    return new Set(index.visible.map(getProfileKey));
  },

  async setProfileImage(type: ProfileType, name: string, sysPath: string): Promise<string | null> {
    const db = await dbService.connect();
    const relativePath = await saveImage(sysPath);
    if (!relativePath) return null;

    await db.execute(
      `INSERT INTO profiles (type, name, image_url)
       VALUES ($1, $2, $3)
       ON CONFLICT(type, name) DO UPDATE SET image_url = excluded.image_url`,
      [type, name, relativePath],
    );
    invalidateProfilesCache();
    return relativePath;
  },

  async setProfileCrop(type: ProfileType, name: string, crop: CropData): Promise<void> {
    const db = await dbService.connect();
    await db.execute(
      `INSERT INTO profiles (type, name, image_url, crop_data)
       VALUES ($1, $2, '', $3)
       ON CONFLICT(type, name) DO UPDATE SET crop_data = excluded.crop_data`,
      [type, name, JSON.stringify(crop)],
    );
    invalidateProfilesCache();
  },

  async isAvgHistoryEnabled(type: ProfileType, name: string): Promise<boolean> {
    return dbService.isAvgHistoryEnabled(type, name);
  },

  async setAvgHistoryEnabled(type: ProfileType, name: string, enabled: boolean): Promise<void> {
    await dbService.setAvgHistoryEnabled(type, name, enabled);
    if (enabled) await dbService.backfillAvgHistory(type, name);
    invalidateProfilesCache();
  },

  async getAvgHistory(type: ProfileType, name: string): Promise<AvgHistoryPoint[]> {
    return dbService.getAvgHistory(type, name);
  },
};
