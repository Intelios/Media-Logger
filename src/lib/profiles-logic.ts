import { dbService, type MediaEntry } from "./db";

export interface ProfileSummary {
  type: string;
  name: string;
  count: number;
  average_score: number;
  image_url?: string; // If you implement custom profile images later
}

const PROFILE_TYPES = ["director", "actress", "artist", "author"];

export const profilesLogic = {
  // Get list of all profiles (for the main Profiles grid)
  async getAllProfiles(): Promise<ProfileSummary[]> {
    const db = await dbService.connect();
    const entries = await db.select<MediaEntry[]>("SELECT * FROM javs");
    
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
      if (data.count >= 2) { // Minimum 2 entries to show up
        results.push({
          type,
          name,
          count: data.count,
          average_score: data.scoreCount > 0 ? parseFloat((data.totalScore / data.scoreCount).toFixed(1)) : 0
        });
      }
    });

    // Sort by count desc
    return results.sort((a, b) => b.count - a.count);
  },

  // Get details for a specific profile (when clicked)
  async getProfileDetails(type: string, name: string): Promise<MediaEntry[]> {
    const db = await dbService.connect();
    // We fetch all and filter in JS because SQLite LIKE '%name%' can be inaccurate with similar names
    // given the multi-value field nature.
    const allEntries = await db.select<MediaEntry[]>("SELECT * FROM javs");
    
    return allEntries.filter(e => {
        // Map the type to the DB column
        const column = type as keyof MediaEntry; 
        const val = e[column];
        if (typeof val === 'string') {
            const parts = val.split(/[,;/]/).map(s => s.trim());
            return parts.includes(name);
        }
        return false;
    });
  }
};