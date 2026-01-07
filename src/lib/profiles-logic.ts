import { dbService, type MediaEntry } from "./db";
import { saveImage } from "./utils";

export interface ProfileSummary {
  type: string;
  name: string;
  count: number;
  average_score: number;
  image_url?: string; // If you implement custom profile images later
}

export const PROFILE_TYPES = ["director", "actress", "artist", "author"];

export const profilesLogic = {
  // Get list of all profiles (for the main Profiles grid)
  async getAllProfiles(): Promise<ProfileSummary[]> {
    const db = await dbService.connect();
    const entries = await db.select<MediaEntry[]>("SELECT * FROM javs");

    // Fetch custom profile images
    // We assume the table exists from your python migration
    const customImages = await db.select<{ type: string, name: string, image_url: string }[]>(
      "SELECT * FROM profiles"
    );

    // Create a quick lookup map: "type:name" -> image_url
    const imageMap = new Map<string, string>();
    customImages.forEach(img => {
      imageMap.set(`${img.type}:${img.name}`, img.image_url);
    });

    const profileMap = new Map<string, { count: number; totalScore: number; scoreCount: number }>();

    // Helper to process a specific field
    const processField = (entry: MediaEntry, field: keyof MediaEntry, type: string) => {
      const value = entry[field];
      if (typeof value === 'string' && value) {
        // Handle comma/semicolon/slash separation
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
      processField(entry, "director", "director"); // Studio/Director
      processField(entry, "actress", "actress");
      processField(entry, "artist", "artist");
      processField(entry, "author", "author");
      if (entry.entry_type === "Game" && entry.platform) {
        // Optionally treat platforms as profiles? Python app seemed to allow it in config
        processField(entry, "platform", "platform");
      }
    });

    // Convert to array and filter min entries (e.g. >= 2)
    const results: ProfileSummary[] = [];
    profileMap.forEach((data, key) => {
      const [type, name] = key.split(':');
      if (data.count >= 3) {
        results.push({
          type,
          name,
          count: data.count,
          average_score: data.scoreCount > 0 ? parseFloat((data.totalScore / data.scoreCount).toFixed(1)) : 0,
          // NEW: Attach custom image if it exists
          image_url: imageMap.get(key)
        });
      }
    });

    return results.sort((a, b) => b.count - a.count);
  },

  // Get details for a specific profile (when clicked)
  // ascending = true for timeline view (oldest first), false for collection view (newest first)
  async getProfileDetails(type: string, name: string, ascending: boolean = false): Promise<MediaEntry[]> {
    const db = await dbService.connect();
    // We fetch all and filter in JS because SQLite LIKE '%name%' can be inaccurate with similar names
    // given the multi-value field nature.
    const allEntries = await db.select<MediaEntry[]>("SELECT * FROM javs");

    const filtered = allEntries.filter(e => {
      // Map the type to the DB column
      const column = type as keyof MediaEntry;
      const val = e[column];
      if (typeof val === 'string') {
        const parts = val.split(/[,;/]/).map(s => s.trim());
        return parts.includes(name);
      }
      return false;
    });

    // Sort by completion_date
    return filtered.sort((a, b) => {
      const dateA = a.completion_date || '';
      const dateB = b.completion_date || '';
      return ascending
        ? dateA.localeCompare(dateB)  // Oldest first for timeline
        : dateB.localeCompare(dateA); // Newest first for collection
    });
  },

  async setProfileImage(type: string, name: string, sysPath: string): Promise<string | null> {
    const db = await dbService.connect();

    // Save file to assets folder
    const relativePath = await saveImage(sysPath);
    if (!relativePath) return null;

    // Update DB (Upsert)
    // SQLite upsert syntax: INSERT OR REPLACE
    await db.execute(
      "INSERT OR REPLACE INTO profiles (type, name, image_url) VALUES ($1, $2, $3)",
      [type, name, relativePath]
    );

    return relativePath;
  }
};