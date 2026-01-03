import Database from '@tauri-apps/plugin-sql';

// 1. Define Interfaces matching your Python `database.py` schema
export interface MediaEntry {
  id: number;
  name: string;
  genre: string | null;
  completion_date: string | null;
  review_score: number | null;
  description: string | null;
  year_completed: number | null;
  is_rewatch: number; // SQLite stores booleans as 0/1
  own_local_copy: number;
  image_url: string | null;
  entry_type: string | null;
  platform: string | null;
  author: string | null;
  artist: string | null;
  director: string | null;
  actress: string | null;
  update_version: string | null;
}

// 2. Database Service
class DBService {
  private db: Database | null = null;

  async connect() {
    if (this.db) return this.db;
    // This looks for jav_log.db in ~/Library/Application Support/com.medialogger.app/
    this.db = await Database.load('sqlite:jav_log.db');
    return this.db;
  }

  // Equivalent to `get_all_javs_db`
  async getAllEntries(): Promise<MediaEntry[]> {
    const db = await this.connect();
    return await db.select<MediaEntry[]>(
      "SELECT * FROM javs ORDER BY completion_date DESC, id DESC"
    );
  }

  // Equivalent to `get_javs_by_year_db`
  async getEntriesByYear(year: string): Promise<MediaEntry[]> {
    const db = await this.connect();
    return await db.select<MediaEntry[]>(
      "SELECT * FROM javs WHERE year_completed = $1 ORDER BY completion_date ASC",
      [year]
    );
  }

  // Equivalent to `get_collection_stats_db`
  async getStats() {
    const db = await this.connect();
    // We can run multiple queries in parallel for speed
    const [totalResult, avgResult] = await Promise.all([
      db.select<{total: number}[]>("SELECT COUNT(*) as total FROM javs"),
      db.select<{avg_rating: number}[]>("SELECT AVG(review_score) as avg_rating FROM javs WHERE review_score IS NOT NULL")
    ]);

    return {
      total_entries: totalResult[0].total,
      average_rating: avgResult[0].avg_rating
    };
  }
}

export const dbService = new DBService();