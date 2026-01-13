import Database from '@tauri-apps/plugin-sql';
import { join } from '@tauri-apps/api/path';
import { getDataDirectory } from './settings';

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
  franchise: string | null;
}

// 2. Database Service
class DBService {
  private db: Database | null = null;
  private currentDbPath: string = '';
  private migrationsRun: boolean = false;

  async connect() {
    // Get the current data directory
    const dataDir = await getDataDirectory();
    const dbPath = await join(dataDir, 'jav_log.db');

    // If already connected to the same path, reuse connection
    if (this.db && this.currentDbPath === dbPath) {
      return this.db;
    }

    // Close existing connection if switching paths
    if (this.db && this.currentDbPath !== dbPath) {
      await this.db.close();
      this.db = null;
      this.migrationsRun = false;
    }

    // Connect to the database
    console.log('[DB] Connecting to:', dbPath);
    this.db = await Database.load(`sqlite:${dbPath}`);
    this.currentDbPath = dbPath;

    // Run migrations if not already done for this connection
    if (!this.migrationsRun) {
      await this.runMigrations();
      this.migrationsRun = true;
    }

    return this.db;
  }

  /**
   * Run database migrations to add new columns
   */
  private async runMigrations() {
    if (!this.db) return;

    // Check if franchise column exists by querying table info
    try {
      const columns = await this.db.select<{ name: string }[]>(
        "PRAGMA table_info(javs)"
      );
      const columnNames = columns.map(c => c.name);

      // Add franchise column if it doesn't exist
      if (!columnNames.includes('franchise')) {
        console.log('[DB] Adding franchise column...');
        await this.db.execute("ALTER TABLE javs ADD COLUMN franchise TEXT");
        console.log('[DB] Franchise column added successfully');
      }
    } catch (error) {
      console.error('[DB] Migration error:', error);
    }

    // Award templates migration
    await this.runAwardTemplatesMigration();
  }

  /**
   * Migrate awards system to support reusable templates
   */
  private async runAwardTemplatesMigration() {
    if (!this.db) return;

    try {
      // Check if award_templates table exists
      const tables = await this.db.select<{ name: string }[]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='award_templates'"
      );

      if (tables.length === 0) {
        console.log('[DB] Creating award_templates table...');

        // Create award_templates table
        await this.db.execute(`
          CREATE TABLE IF NOT EXISTS award_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_date TEXT NOT NULL
          )
        `);
        console.log('[DB] award_templates table created');
      }

      // Check if template_id column exists in award_categories
      const catColumns = await this.db.select<{ name: string }[]>(
        "PRAGMA table_info(award_categories)"
      );
      const catColumnNames = catColumns.map(c => c.name);

      if (!catColumnNames.includes('template_id')) {
        console.log('[DB] Adding template_id column to award_categories...');
        await this.db.execute(
          "ALTER TABLE award_categories ADD COLUMN template_id INTEGER REFERENCES award_templates(id)"
        );

        // Migrate existing categories to templates
        console.log('[DB] Migrating existing categories to templates...');

        // Get unique category names
        const uniqueNames = await this.db.select<{ name: string }[]>(
          "SELECT DISTINCT name FROM award_categories"
        );

        for (const { name } of uniqueNames) {
          // Create template for this name
          await this.db.execute(
            "INSERT OR IGNORE INTO award_templates (name, created_date) VALUES ($1, datetime('now'))",
            [name]
          );

          // Get the template id
          const template = await this.db.select<{ id: number }[]>(
            "SELECT id FROM award_templates WHERE name = $1",
            [name]
          );

          if (template.length > 0) {
            // Link all categories with this name to the template
            await this.db.execute(
              "UPDATE award_categories SET template_id = $1 WHERE name = $2",
              [template[0].id, name]
            );
          }
        }

        console.log('[DB] Award categories migration complete');
      }
    } catch (error) {
      console.error('[DB] Award templates migration error:', error);
    }
  }

  /**
   * Force reconnect to database (useful when settings change)
   */
  async reconnect() {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.currentDbPath = '';
    }
    return this.connect();
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
      db.select<{ total: number }[]>("SELECT COUNT(*) as total FROM javs"),
      db.select<{ avg_rating: number }[]>("SELECT AVG(review_score) as avg_rating FROM javs WHERE review_score IS NOT NULL")
    ]);

    return {
      total_entries: totalResult[0].total,
      average_rating: avgResult[0].avg_rating
    };
  }

  async addEntry(entry: Omit<MediaEntry, "id">): Promise<number> {
    const db = await this.connect();
    // Helper to handle optional fields effectively
    const keys = Object.keys(entry);
    const values = Object.values(entry);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(",");

    const result: any = await db.execute(
      `INSERT INTO javs (${keys.join(",")}) VALUES (${placeholders})`,
      values
    );
    return result.lastInsertId;
  }

  async updateEntry(entry: MediaEntry): Promise<void> {
    const db = await this.connect();
    const id = entry.id;
    // Remove ID from update set
    const { id: _, ...rest } = entry;
    const keys = Object.keys(rest);
    const values = Object.values(rest);

    const setString = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");

    await db.execute(
      `UPDATE javs SET ${setString} WHERE id = $${values.length + 1}`,
      [...values, id]
    );
  }

  async deleteEntry(id: number): Promise<void> {
    const db = await this.connect();
    await db.execute("DELETE FROM javs WHERE id = $1", [id]);
  }
}

export const dbService = new DBService();