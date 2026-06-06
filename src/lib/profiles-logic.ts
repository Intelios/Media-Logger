import { dbService, type MediaEntry, filterHiddenEntries, onEntriesMutated } from "./db";
import { ADULT_MEDIA_VISIBILITY_CHANGED_EVENT, isAdultMediaEnabled } from "./settings";
import { saveImage } from "./utils";

// Non-destructive crop/reframe descriptor for a profile's cover image.
// Stored as JSON in the profiles.crop_data column; applied at render via CSS.
export interface CropData {
  x: number;      // focal point X, 0-100 (object-position / transform-origin)
  y: number;      // focal point Y, 0-100
  scale: number;  // zoom, >= 1 (transform: scale)
  fit: "cover" | "contain";
}

// Defaults reproduce plain object-cover (today's behavior) — unedited profiles look identical.
export const DEFAULT_CROP: CropData = { x: 50, y: 50, scale: 1, fit: "cover" };

export interface ProfileSummary {
  type: string;
  name: string;
  count: number;
  average_score: number;
  image_url?: string;
  crop?: CropData;
}

// Parse a crop_data JSON string into a CropData, falling back to undefined on any problem.
function parseCropData(raw: string | null | undefined): CropData | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed && typeof parsed.x === "number" && typeof parsed.y === "number" &&
      typeof parsed.scale === "number" && (parsed.fit === "cover" || parsed.fit === "contain")
    ) {
      return { x: parsed.x, y: parsed.y, scale: parsed.scale, fit: parsed.fit };
    }
  } catch {
    // Ignore malformed crop data → treat as no crop.
  }
  return undefined;
}

export const PROFILE_TYPES = ["director", "actress", "artist", "author", "franchise", "series"];

let profileKeysCache: Set<string> | null = null;
let profileKeysCacheAdultEnabled: boolean | null = null;
let profileKeysPromise: Promise<Set<string>> | null = null;
let profileKeysPromiseAdultEnabled: boolean | null = null;
let profileKeysCacheVersion = 0;

export function invalidateProfilesCache(): void {
  profileKeysCacheVersion += 1;
  profileKeysCache = null;
  profileKeysCacheAdultEnabled = null;
  profileKeysPromise = null;
  profileKeysPromiseAdultEnabled = null;
}

onEntriesMutated(invalidateProfilesCache);

if (typeof window !== "undefined") {
  window.addEventListener(ADULT_MEDIA_VISIBILITY_CHANGED_EVENT, invalidateProfilesCache);
}

async function aggregateAllProfiles(): Promise<ProfileSummary[]> {
  const db = await dbService.connect();
  const entries = filterHiddenEntries(await db.select<MediaEntry[]>("SELECT * FROM entries"));

  const customImages = await db.select<{ type: string, name: string, image_url: string, crop_data?: string | null }[]>(
    "SELECT * FROM profiles"
  );

  const imageMap = new Map<string, string>();
  const cropMap = new Map<string, CropData>();
  customImages.forEach(img => {
    const key = `${img.type}:${img.name}`;
    imageMap.set(key, img.image_url);
    const crop = parseCropData(img.crop_data);
    if (crop) cropMap.set(key, crop);
  });

  const profileMap = new Map<string, { count: number; totalScore: number; scoreCount: number }>();

  const processField = (entry: MediaEntry, field: keyof MediaEntry, type: string) => {
    const value = entry[field];
    if (typeof value === 'string' && value) {
      const names = value.split(/[,;/]/).map(s => s.trim()).filter(s => s);

      names.forEach(name => {
        const key = `${type}:${name}`;
        if (!profileMap.has(key)) {
          profileMap.set(key, { count: 0, totalScore: 0, scoreCount: 0 });
        }

        const data = profileMap.get(key)!;
        data.count++;
        if (entry.review_score != null) {
          data.totalScore += entry.review_score;
          data.scoreCount++;
        }
      });
    }
  };

  entries.forEach(entry => {
    processField(entry, "director", "director");
    processField(entry, "actress", "actress");
    processField(entry, "artist", "artist");
    processField(entry, "author", "author");
    if (entry.entry_type === "Game") {
      if (entry.platform) {
        processField(entry, "platform", "platform");
      }
      if (entry.franchise) {
        processField(entry, "franchise", "franchise");
      }
    }
    if (["Show", "K-Drama", "Anime"].includes(entry.entry_type || "")) {
      if (entry.series) {
        processField(entry, "series", "series");
      }
    }
  });

  const results: ProfileSummary[] = [];
  profileMap.forEach((data, key) => {
    const [type, name] = key.split(':');
    if (data.count >= 3) {
      results.push({
        type,
        name,
        count: data.count,
        average_score: data.scoreCount > 0 ? parseFloat((data.totalScore / data.scoreCount).toFixed(1)) : 0,
        image_url: imageMap.get(key),
        crop: cropMap.get(key)
      });
    }
  });

  return results.sort((a, b) => b.count - a.count);
}

export const profilesLogic = {
  async getAllProfiles(): Promise<ProfileSummary[]> {
    const db = await dbService.connect();
    const allProfiles = await aggregateAllProfiles();

    const hiddenRows = await db.select<{ type: string; name: string }[]>(
      "SELECT type, name FROM hidden_profiles"
    );
    const hiddenSet = new Set(hiddenRows.map(r => `${r.type}:${r.name}`));

    return allProfiles.filter(p => !hiddenSet.has(`${p.type}:${p.name}`));
  },

  async getHiddenProfiles(): Promise<ProfileSummary[]> {
    const db = await dbService.connect();
    const allProfiles = await aggregateAllProfiles();

    const hiddenRows = await db.select<{ type: string; name: string }[]>(
      "SELECT type, name FROM hidden_profiles"
    );
    const hiddenSet = new Set(hiddenRows.map(r => `${r.type}:${r.name}`));

    if (hiddenSet.size === 0) return [];
    return allProfiles.filter(p => hiddenSet.has(`${p.type}:${p.name}`));
  },

  async hideProfile(type: string, name: string): Promise<void> {
    const db = await dbService.connect();
    await db.execute(
      "INSERT OR IGNORE INTO hidden_profiles (type, name, hidden_date) VALUES ($1, $2, $3)",
      [type, name, new Date().toISOString()]
    );
    invalidateProfilesCache();
  },

  async unhideProfile(type: string, name: string): Promise<void> {
    const db = await dbService.connect();
    await db.execute(
      "DELETE FROM hidden_profiles WHERE type = $1 AND name = $2",
      [type, name]
    );
    invalidateProfilesCache();
  },

  async getProfileDetails(type: string, name: string, ascending: boolean = false): Promise<MediaEntry[]> {
    const db = await dbService.connect();
    const allEntries = filterHiddenEntries(await db.select<MediaEntry[]>("SELECT * FROM entries"));

    const filtered = allEntries.filter(e => {
      const column = type as keyof MediaEntry;
      const val = e[column];
      if (typeof val === 'string') {
        const parts = val.split(/[,;/]/).map(s => s.trim());
        return parts.includes(name);
      }
      return false;
    });

    return filtered.sort((a, b) => {
      const dateA = a.completion_date || '';
      const dateB = b.completion_date || '';
      return ascending
        ? dateA.localeCompare(dateB)
        : dateB.localeCompare(dateA);
    });
  },

  async getProfileKeys(): Promise<Set<string>> {
    const adultMediaEnabled = isAdultMediaEnabled();

    if (profileKeysCache && profileKeysCacheAdultEnabled === adultMediaEnabled) {
      return profileKeysCache;
    }

    if (profileKeysPromise && profileKeysPromiseAdultEnabled === adultMediaEnabled) {
      return profileKeysPromise;
    }

    profileKeysPromiseAdultEnabled = adultMediaEnabled;
    const cacheVersion = profileKeysCacheVersion;
    const promise = (async () => {
      const profiles = await profilesLogic.getAllProfiles();
      const keys = new Set(profiles.map(p => `${p.type}:${p.name}`));

      if (profileKeysCacheVersion === cacheVersion && isAdultMediaEnabled() === adultMediaEnabled) {
        profileKeysCache = keys;
        profileKeysCacheAdultEnabled = adultMediaEnabled;
      }

      return keys;
    })();

    profileKeysPromise = promise;
    promise
      .finally(() => {
        if (profileKeysPromise === promise) {
          profileKeysPromise = null;
          profileKeysPromiseAdultEnabled = null;
        }
      })
      .catch(() => undefined);

    return promise;
  },

  async setProfileImage(type: string, name: string, sysPath: string): Promise<string | null> {
    const db = await dbService.connect();

    const relativePath = await saveImage(sysPath);
    if (!relativePath) return null;

    await db.execute(
      "INSERT OR REPLACE INTO profiles (type, name, image_url) VALUES ($1, $2, $3)",
      [type, name, relativePath]
    );

    return relativePath;
  },

  async setProfileCrop(type: string, name: string, crop: CropData): Promise<void> {
    const db = await dbService.connect();

    // Upsert crop while preserving any existing image_url for this profile.
    await db.execute(
      `INSERT INTO profiles (type, name, image_url, crop_data)
       VALUES ($1, $2, COALESCE((SELECT image_url FROM profiles WHERE type = $1 AND name = $2), ''), $3)
       ON CONFLICT(type, name) DO UPDATE SET crop_data = excluded.crop_data`,
      [type, name, JSON.stringify(crop)]
    );

    invalidateProfilesCache();
  }
};
