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
  notes: string | null;
  year_completed: number | null;
  is_rewatch: number; // SQLite stores booleans as 0/1
  own_local_copy: number;
  is_platinum: number;
  is_completed: number;
  is_early_access: number;
  early_access_version: string | null;
  image_url: string | null;
  entry_type: string | null;
  platform: string | null;
  author: string | null;
  artist: string | null;
  director: string | null;
  actress: string | null;
  update_version: string | null;
  franchise: string | null;
  series: string | null;
}

export interface EntrySearchFilters {
  query?: string;
  entryTypes: string[];
  platforms: string[];
  actresses: string[];
  directors: string[];
  authors: string[];
  franchises: string[];
  series: string[];
}

export interface SearchFilterOptions {
  platforms: string[];
  actresses: string[];
  directors: string[];
  authors: string[];
  franchises: string[];
  series: string[];
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

    // Rename legacy 'javs' table to 'entries' (for existing databases)
    const javsTable = await this.db.select<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='javs'"
    );
    if (javsTable.length > 0) {
      console.log('[DB] Renaming javs table to entries...');
      await this.db.execute("ALTER TABLE javs RENAME TO entries");
      console.log('[DB] Table renamed successfully');
    }

    // Ensure base tables exist (creates 'entries' for new users)
    await this.createTables();

    // Repair schema drift from older builds
    await this.runSchemaCompatibilityMigrations();

    // Check if newer entry columns exist by querying table info
    try {
      const columns = await this.db.select<{ name: string }[]>(
        "PRAGMA table_info(entries)"
      );
      const columnNames = columns.map(c => c.name);

      // Add franchise column if it doesn't exist
      if (!columnNames.includes('franchise')) {
        console.log('[DB] Adding franchise column...');
        await this.db.execute("ALTER TABLE entries ADD COLUMN franchise TEXT");
        console.log('[DB] Franchise column added successfully');
      }

      // Add series column if it doesn't exist
      if (!columnNames.includes('series')) {
        console.log('[DB] Adding series column...');
        await this.db.execute("ALTER TABLE entries ADD COLUMN series TEXT");
        console.log('[DB] Series column added successfully');
      }

      // Add is_platinum column if it doesn't exist
      if (!columnNames.includes('is_platinum')) {
        console.log('[DB] Adding is_platinum column...');
        await this.db.execute("ALTER TABLE entries ADD COLUMN is_platinum INTEGER DEFAULT 0");
        console.log('[DB] is_platinum column added successfully');
      }

      // Add is_completed column if it doesn't exist
      if (!columnNames.includes('is_completed')) {
        console.log('[DB] Adding is_completed column...');
        await this.db.execute("ALTER TABLE entries ADD COLUMN is_completed INTEGER DEFAULT 0");
        console.log('[DB] is_completed column added successfully');
      }

      // Add notes column if it doesn't exist
      if (!columnNames.includes('notes')) {
        console.log('[DB] Adding notes column...');
        await this.db.execute("ALTER TABLE entries ADD COLUMN notes TEXT");
        console.log('[DB] notes column added successfully');
      }

      // Add is_early_access column if it doesn't exist
      if (!columnNames.includes('is_early_access')) {
        console.log('[DB] Adding is_early_access column...');
        await this.db.execute("ALTER TABLE entries ADD COLUMN is_early_access INTEGER DEFAULT 0");
        console.log('[DB] is_early_access column added successfully');
      }

      // Add early_access_version column if it doesn't exist
      if (!columnNames.includes('early_access_version')) {
        console.log('[DB] Adding early_access_version column...');
        await this.db.execute("ALTER TABLE entries ADD COLUMN early_access_version TEXT");
        console.log('[DB] early_access_version column added successfully');
      }

      // Normalize nullable legacy rows
      await this.db.execute("UPDATE entries SET is_platinum = 0 WHERE is_platinum IS NULL");
      await this.db.execute("UPDATE entries SET is_completed = 0 WHERE is_completed IS NULL");
      await this.db.execute("UPDATE entries SET is_early_access = 0 WHERE is_early_access IS NULL");
    } catch (error) {
      console.error('[DB] Migration error:', error);
    }

    // Award templates migration
    await this.runAwardTemplatesMigration();
  }

  private async getTableInfo(tableName: string): Promise<{ name: string; pk: number }[]> {
    if (!this.db) return [];
    return await this.db.select<{ name: string; pk: number }[]>(
      `PRAGMA table_info(${tableName})`
    );
  }

  private async runSchemaCompatibilityMigrations() {
    if (!this.db) return;

    try {
      await this.migrateAwardYearsTable();
      await this.migrateCollectionItemsTable();
      await this.migrateAwardCategoriesTable();
      await this.migrateAwardWinnersTable();
    } catch (error) {
      console.error('[DB] Compatibility migration error:', error);
    }
  }

  private async migrateCollectionItemsTable() {
    if (!this.db) return;

    const columns = await this.getTableInfo('collection_items');
    if (columns.length === 0) return;

    const columnNames = columns.map(c => c.name);
    const hasMediaId = columnNames.includes('media_id');
    const hasEntryId = columnNames.includes('entry_id');
    const needsRebuild = !hasMediaId || hasEntryId || columnNames.includes('added_date');

    if (!needsRebuild) return;

    console.log('[DB] Migrating collection_items schema...');
    await this.db.execute("ALTER TABLE collection_items RENAME TO collection_items_old");
    await this.db.execute(`
      CREATE TABLE collection_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        media_id INTEGER NOT NULL,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
        FOREIGN KEY (media_id) REFERENCES entries(id) ON DELETE CASCADE
      )
    `);

    const sourceMediaColumn = hasMediaId ? 'media_id' : 'entry_id';
    if (columnNames.includes(sourceMediaColumn)) {
      const idExpr = columnNames.includes('id') ? 'id' : 'NULL';
      const sortOrderExpr = columnNames.includes('sort_order') ? 'COALESCE(sort_order, 0)' : '0';

      await this.db.execute(`
        INSERT INTO collection_items (id, collection_id, media_id, sort_order)
        SELECT ${idExpr}, collection_id, ${sourceMediaColumn}, ${sortOrderExpr}
        FROM collection_items_old
      `);
    }

    await this.db.execute("DROP TABLE collection_items_old");
    console.log('[DB] collection_items schema migration complete');
  }

  private async migrateAwardYearsTable() {
    if (!this.db) return;

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS award_years (
        year INTEGER PRIMARY KEY,
        created_date TEXT NOT NULL
      )
    `);

    await this.db.execute(`
      INSERT OR IGNORE INTO award_years (year, created_date)
      SELECT year, COALESCE(MIN(created_date), datetime('now'))
      FROM award_categories
      WHERE year IS NOT NULL
      GROUP BY year
    `);
  }

  private async migrateAwardCategoriesTable() {
    if (!this.db) return;

    const columns = await this.getTableInfo('award_categories');
    if (columns.length === 0) return;

    const columnNames = columns.map(c => c.name);

    if (!columnNames.includes('created_date')) {
      console.log('[DB] Adding created_date to award_categories...');
      await this.db.execute("ALTER TABLE award_categories ADD COLUMN created_date TEXT");
    }

    await this.db.execute(
      "UPDATE award_categories SET created_date = datetime('now') WHERE created_date IS NULL OR created_date = ''"
    );
  }

  private async migrateAwardWinnersTable() {
    if (!this.db) return;

    const columns = await this.getTableInfo('award_winners');
    if (columns.length === 0) return;

    const columnNames = columns.map(c => c.name);
    const categoryIdInfo = columns.find(c => c.name === 'category_id');
    const categoryIdIsPrimaryKey = categoryIdInfo?.pk === 1;
    const hasMediaId = columnNames.includes('media_id');
    const hasEntryId = columnNames.includes('entry_id');
    const hasSelectedDate = columnNames.includes('selected_date');
    const needsRebuild = !hasMediaId || hasEntryId || !hasSelectedDate || !categoryIdIsPrimaryKey;

    if (!needsRebuild) return;

    console.log('[DB] Migrating award_winners schema...');
    await this.db.execute("ALTER TABLE award_winners RENAME TO award_winners_old");
    await this.db.execute(`
      CREATE TABLE award_winners (
        category_id INTEGER PRIMARY KEY,
        media_id INTEGER NOT NULL,
        selected_date TEXT,
        FOREIGN KEY (category_id) REFERENCES award_categories(id) ON DELETE CASCADE,
        FOREIGN KEY (media_id) REFERENCES entries(id) ON DELETE CASCADE
      )
    `);

    const sourceMediaColumn = hasMediaId ? 'media_id' : 'entry_id';
    if (columnNames.includes('category_id') && columnNames.includes(sourceMediaColumn)) {
      const selectedDateExpr = hasSelectedDate
        ? "COALESCE(ow.selected_date, datetime('now'))"
        : "datetime('now')";

      await this.db.execute(`
        INSERT OR REPLACE INTO award_winners (category_id, media_id, selected_date)
        SELECT ow.category_id, ow.${sourceMediaColumn}, ${selectedDateExpr}
        FROM award_winners_old ow
        JOIN (
          SELECT category_id, MAX(rowid) as latest_rowid
          FROM award_winners_old
          WHERE category_id IS NOT NULL
          GROUP BY category_id
        ) latest
          ON latest.category_id = ow.category_id AND latest.latest_rowid = ow.rowid
        WHERE ow.${sourceMediaColumn} IS NOT NULL
      `);
    }

    await this.db.execute("DROP TABLE award_winners_old");
    console.log('[DB] award_winners schema migration complete');
  }

  /**
   * Create base tables if they don't exist (for new users)
   */
  private async createTables() {
    if (!this.db) return;

    try {
      // Create main entries table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          genre TEXT,
          completion_date TEXT,
          review_score REAL,
          description TEXT,
          notes TEXT,
          year_completed INTEGER,
          is_rewatch INTEGER DEFAULT 0,
          own_local_copy INTEGER DEFAULT 0,
          is_platinum INTEGER DEFAULT 0,
          is_completed INTEGER DEFAULT 0,
          is_early_access INTEGER DEFAULT 0,
          early_access_version TEXT,
          image_url TEXT,
          entry_type TEXT,
          platform TEXT,
          author TEXT,
          artist TEXT,
          director TEXT,
          actress TEXT,
          update_version TEXT,
          franchise TEXT,
          series TEXT
        )
      `);

      // Create collections table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS collections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          created_date TEXT NOT NULL
        )
      `);

      // Create collection items table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS collection_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          collection_id INTEGER NOT NULL,
          media_id INTEGER NOT NULL,
          sort_order INTEGER DEFAULT 0,
          FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
          FOREIGN KEY (media_id) REFERENCES entries(id) ON DELETE CASCADE
        )
      `);

      // Create award categories table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS award_years (
          year INTEGER PRIMARY KEY,
          created_date TEXT NOT NULL
        )
      `);

      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS award_categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          year INTEGER NOT NULL,
          name TEXT NOT NULL,
          created_date TEXT NOT NULL,
          sort_order INTEGER DEFAULT 0,
          template_id INTEGER REFERENCES award_templates(id)
        )
      `);

      // Create award winners table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS award_winners (
          category_id INTEGER PRIMARY KEY,
          media_id INTEGER NOT NULL,
          selected_date TEXT,
          FOREIGN KEY (category_id) REFERENCES award_categories(id) ON DELETE CASCADE,
          FOREIGN KEY (media_id) REFERENCES entries(id) ON DELETE CASCADE
        )
      `);

      // Create profile images table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS profiles (
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          image_url TEXT NOT NULL,
          PRIMARY KEY (type, name)
        )
      `);

      console.log('[DB] Base tables ensured');
    } catch (error) {
      console.error('[DB] Error creating tables:', error);
    }
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

  async getAllEntries(): Promise<MediaEntry[]> {
    const db = await this.connect();
    return await db.select<MediaEntry[]>(
      "SELECT * FROM entries ORDER BY completion_date DESC, id DESC"
    );
  }

  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, "\\$&");
  }

  private async getDistinctColumnValues(
    db: Database,
    column: 'platform' | 'director' | 'author' | 'franchise' | 'series'
  ): Promise<string[]> {
    const results = await db.select<{ value: string }[]>(
      `SELECT DISTINCT TRIM(${column}) as value
       FROM entries
       WHERE ${column} IS NOT NULL AND TRIM(${column}) <> ''
       ORDER BY value COLLATE NOCASE ASC`
    );

    return results.map(({ value }) => value);
  }

  async getSearchFilterOptions(): Promise<SearchFilterOptions> {
    const db = await this.connect();

    const [platforms, directors, authors, franchises, series, actresses] = await Promise.all([
      this.getDistinctColumnValues(db, 'platform'),
      this.getDistinctColumnValues(db, 'director'),
      this.getDistinctColumnValues(db, 'author'),
      this.getDistinctColumnValues(db, 'franchise'),
      this.getDistinctColumnValues(db, 'series'),
      db.select<{ value: string }[]>(
        `WITH RECURSIVE split(value, rest) AS (
           SELECT '', TRIM(actress) || ','
           FROM entries
           WHERE actress IS NOT NULL AND TRIM(actress) <> ''
           UNION ALL
           SELECT
             TRIM(SUBSTR(rest, 0, INSTR(rest, ','))),
             LTRIM(SUBSTR(rest, INSTR(rest, ',') + 1))
           FROM split
           WHERE rest <> ''
         )
         SELECT DISTINCT value
         FROM split
         WHERE value <> ''
         ORDER BY value COLLATE NOCASE ASC`
      ),
    ]);

    return {
      platforms,
      actresses: actresses.map(({ value }) => value),
      directors,
      authors,
      franchises,
      series,
    };
  }

  async searchEntries(filters: EntrySearchFilters): Promise<MediaEntry[]> {
    const db = await this.connect();
    const conditions: string[] = [];
    const params: unknown[] = [];

    const query = filters.query?.trim().toLowerCase();
    if (query) {
      const searchableColumns = [
        'name',
        'author',
        'artist',
        'genre',
        'director',
        'actress',
        'platform',
        'series',
      ];

      const likeValue = `%${this.escapeLike(query)}%`;
      const searchClauses = searchableColumns.map((column) => {
        params.push(likeValue);
        return `LOWER(COALESCE(${column}, '')) LIKE $${params.length} ESCAPE '\\'`;
      });

      conditions.push(`(${searchClauses.join(' OR ')})`);
    }

    const addInFilter = (column: string, values: string[]) => {
      if (values.length === 0) return;
      const placeholders = values.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      conditions.push(`${column} IN (${placeholders.join(', ')})`);
    };

    addInFilter('entry_type', filters.entryTypes);
    addInFilter('platform', filters.platforms);
    addInFilter('director', filters.directors);
    addInFilter('author', filters.authors);
    addInFilter('franchise', filters.franchises);
    addInFilter('series', filters.series);

    if (filters.actresses.length > 0) {
      const normalizedActressColumn = `(',' || REPLACE(REPLACE(COALESCE(actress, ''), ', ', ','), ' ,', ',') || ',')`;
      const actressClauses = filters.actresses.map((actress) => {
        params.push(actress);
        return `INSTR(${normalizedActressColumn}, ',' || $${params.length} || ',') > 0`;
      });
      conditions.push(`(${actressClauses.join(' OR ')})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return await db.select<MediaEntry[]>(
      `SELECT *
       FROM entries
       ${whereClause}
       ORDER BY completion_date DESC, id DESC`,
      params
    );
  }

  async getEntriesByYear(year: string): Promise<MediaEntry[]> {
    const db = await this.connect();
    return await db.select<MediaEntry[]>(
      "SELECT * FROM entries WHERE year_completed = $1 ORDER BY completion_date ASC",
      [year]
    );
  }

  async getStats() {
    const db = await this.connect();
    // We can run multiple queries in parallel for speed
    const [totalResult, avgResult] = await Promise.all([
      db.select<{ total: number }[]>("SELECT COUNT(*) as total FROM entries"),
      db.select<{ avg_rating: number }[]>("SELECT AVG(review_score) as avg_rating FROM entries WHERE review_score IS NOT NULL")
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
      `INSERT INTO entries (${keys.join(",")}) VALUES (${placeholders})`,
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
      `UPDATE entries SET ${setString} WHERE id = $${values.length + 1}`,
      [...values, id]
    );
  }

  async deleteEntry(id: number): Promise<void> {
    const db = await this.connect();
    await db.execute("DELETE FROM entries WHERE id = $1", [id]);
  }

  /**
   * Find all entries with the same name (for duplicate/rewatch detection)
   */
  async getEntriesByName(name: string): Promise<MediaEntry[]> {
    const db = await this.connect();
    return await db.select<MediaEntry[]>(
      "SELECT * FROM entries WHERE name = $1 ORDER BY completion_date ASC",
      [name]
    );
  }
}

export const dbService = new DBService();
