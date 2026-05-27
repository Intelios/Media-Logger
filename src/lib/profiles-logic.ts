import { dbService, type MediaEntry } from "./db";
import { saveImage } from "./utils";

export interface ProfileSummary {
  type: string;
  name: string;
  count: number;
  average_score: number;
  image_url?: string;
}

export const PROFILE_TYPES = ["director", "actress", "artist", "author", "franchise", "series"];

async function aggregateAllProfiles(): Promise<ProfileSummary[]> {
  const db = await dbService.connect();
  const entries = await db.select<MediaEntry[]>("SELECT * FROM entries");

  const customImages = await db.select<{ type: string, name: string, image_url: string }[]>(
    "SELECT * FROM profiles"
  );

  const imageMap = new Map<string, string>();
  customImages.forEach(img => {
    imageMap.set(`${img.type}:${img.name}`, img.image_url);
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
        if (entry.review_score) {
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
        image_url: imageMap.get(key)
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
  },

  async unhideProfile(type: string, name: string): Promise<void> {
    const db = await dbService.connect();
    await db.execute(
      "DELETE FROM hidden_profiles WHERE type = $1 AND name = $2",
      [type, name]
    );
  },

  async getProfileDetails(type: string, name: string, ascending: boolean = false): Promise<MediaEntry[]> {
    const db = await dbService.connect();
    const allEntries = await db.select<MediaEntry[]>("SELECT * FROM entries");

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
    const profiles = await this.getAllProfiles();
    return new Set(profiles.map(p => `${p.type}:${p.name}`));
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
  }
};
