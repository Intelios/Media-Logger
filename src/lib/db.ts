import Database from '@tauri-apps/plugin-sql';
import { join } from '@tauri-apps/api/path';
import { exists, copyFile, stat, remove } from '@tauri-apps/plugin-fs';
import { getDataDirectory, isAdultMediaEnabled } from './settings';
import { ADULT_ENTRY_TYPES, isAdultType } from './media-config';

/**
 * SQL fragment that excludes adult entries when the Adult Media setting is off.
 * Returns '' when enabled. Designed to be appended inside an existing WHERE
 * clause (note the leading ' AND '). Rows with a NULL entry_type are kept.
 * The data is never deleted — this only hides it from queries.
 */
export function adultExclusionSql(): string {
  if (isAdultMediaEnabled()) return '';
  const list = ADULT_ENTRY_TYPES.map((t) => `'${t.replace(/'/g, "''")}'`).join(', ');
  return ` AND (entry_type IS NULL OR entry_type NOT IN (${list}))`;
}

/**
 * In-memory equivalent of adultExclusionSql for array-returning fetches that are
 * simpler to post-filter than to splice into positional-parameter SQL.
 */
export function filterHiddenEntries<T extends { entry_type: string | null }>(rows: T[]): T[] {
  if (isAdultMediaEnabled()) return rows;
  return rows.filter((r) => !isAdultType(r.entry_type));
}

// Canonical database filename. Renamed from the legacy 'jav_log.db' in 3.0.
export const DB_FILENAME = 'media_logger.db';
// Legacy filename from the app's early days. Existing users are migrated off it
// on first launch (see migrateLegacyDatabase). The legacy file is preserved as a
// dormant backup and never opened again.
export const LEGACY_DB_FILENAME = 'jav_log.db';
// sqlx opens SQLite in WAL mode, so the main DB file may be accompanied by these
// sidecar files carrying uncommitted data. They must be migrated as a consistent set.
const DB_SIDECAR_SUFFIXES = ['', '-wal', '-shm'];
// localStorage key set after a successful legacy migration; consumed once by the UI
// to show a one-time banner.
export const DB_MIGRATED_FLAG_KEY = 'media-logger-db-migrated';
const ENTRY_SCHEMA_VERSION = 1;

const mutationListeners: Array<() => void> = [];

export function onEntriesMutated(fn: () => void): () => void {
  mutationListeners.push(fn);
  return () => {
    const index = mutationListeners.indexOf(fn);
    if (index !== -1) {
      mutationListeners.splice(index, 1);
    }
  };
}

function notifyEntriesMutated(): void {
  mutationListeners.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      console.error('Error in entry mutation listener:', error);
    }
  });
}

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
  has_subtitles: number;
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

export interface BacklogItem {
  id: number;
  name: string;
  entry_type: string;
  genre: string | null;
  image_url: string | null;
  status: 'planning' | 'in_progress';
  added_date: string;
  sort_order: number;
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

export interface RandomPickFilters {
  entryTypes: string[];
  ratingOperator: "any" | "eq" | "gte" | "lte";
  ratingValue: number;
  yearMode: "any" | "exact" | "range";
  yearExact: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  localCopy: "any" | "yes" | "no";
  rewatchStatus: "any" | "never" | "has";
  genres: string[];
  platforms: string[];
  franchises: string[];
  series: string[];
}

export interface RandomPickFilterOptions {
  genres: string[];
  platforms: string[];
  franchises: string[];
  series: string[];
  years: number[];
  entryTypes: string[];
}

// 2. Database Service
class DBService {
  private db: Database | null = null;
  private currentDbPath: string = '';
  private migrationsRun: boolean = false;
  // Guards the one-time legacy file migration so concurrent connect() calls
  // (multiple components mounting at once) only migrate once.
  private legacyMigration: Map<string, Promise<void>> = new Map();

  /**
   * One-time migration of the legacy 'jav_log.db' to the canonical 'media_logger.db'.
   *
   * Strategy (zero data loss):
   *  - If the new file already exists, do nothing (new user or already migrated).
   *  - Otherwise, if the legacy file exists, COPY it (and its WAL/SHM sidecars) to
   *    the new name, verify the copy, and leave the legacy file untouched as a backup.
   *  - The legacy file is never modified or deleted here.
   *
   * Runs before any DB connection is opened, so the on-disk file set is consistent
   * (the previous app instance is closed). If the copy fails verification, any
   * partial copy is removed and we fall back to the legacy file (still no data loss).
   */
  private async migrateLegacyDatabase(dataDir: string): Promise<void> {
    const newPath = await join(dataDir, DB_FILENAME);

    // New file already present -> nothing to migrate.
    if (await exists(newPath)) {
      return;
    }

    const legacyPath = await join(dataDir, LEGACY_DB_FILENAME);
    if (!(await exists(legacyPath))) {
      // Brand-new user: no legacy file. Database.load will create the new file.
      return;
    }

    console.log('[DB] Migrating legacy database', LEGACY_DB_FILENAME, '->', DB_FILENAME);

    const copied: string[] = [];
    try {
      // Copy the main file plus any WAL/SHM sidecars as a consistent set.
      for (const suffix of DB_SIDECAR_SUFFIXES) {
        const src = await join(dataDir, `${LEGACY_DB_FILENAME}${suffix}`);
        if (!(await exists(src))) continue;
        const dest = await join(dataDir, `${DB_FILENAME}${suffix}`);
        await copyFile(src, dest);
        copied.push(dest);
      }

      // Verify the main DB file copied with a matching byte size.
      const srcSize = (await stat(legacyPath)).size;
      const destSize = (await stat(newPath)).size;
      if (srcSize !== destSize) {
        throw new Error(`Size mismatch after copy: legacy=${srcSize} new=${destSize}`);
      }

      // Success. Leave the legacy file in place as a backup; flag the UI banner.
      localStorage.setItem(DB_MIGRATED_FLAG_KEY, LEGACY_DB_FILENAME);
      console.log('[DB] Legacy database migrated successfully; original kept as backup.');
    } catch (e) {
      // Roll back any partial copy so we cleanly fall back to the legacy file.
      console.error('[DB] Legacy migration failed; falling back to legacy file.', e);
      for (const dest of copied) {
        try {
          if (await exists(dest)) await remove(dest);
        } catch (cleanupErr) {
          console.error('[DB] Failed to clean up partial copy:', dest, cleanupErr);
        }
      }
      throw e;
    }
  }

  async connect() {
    // Get the current data directory
    const dataDir = await getDataDirectory();

    // Run the one-time legacy migration (guarded per data directory). If it fails,
    // fall back to opening the legacy file directly so the user never loses access.
    let useLegacyFallback = false;
    if (!this.legacyMigration.has(dataDir)) {
      this.legacyMigration.set(dataDir, this.migrateLegacyDatabase(dataDir));
    }
    try {
      await this.legacyMigration.get(dataDir);
    } catch {
      useLegacyFallback = true;
    }

    const dbFilename = useLegacyFallback ? LEGACY_DB_FILENAME : DB_FILENAME;
    const dbPath = await join(dataDir, dbFilename);

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

    // Check newer entry columns once for migrated DBs, then skip this probing on future connects.
    await this.runEntryColumnMigrations();

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
      await this.migrateProfilesTable();
    } catch (error) {
      console.error('[DB] Compatibility migration error:', error);
    }
  }

  private async runEntryColumnMigrations() {
    if (!this.db) return;

    try {
      const versionRows = await this.db.select<{ user_version: number }[]>("PRAGMA user_version");
      const schemaVersion = versionRows[0]?.user_version ?? 0;
      if (schemaVersion >= ENTRY_SCHEMA_VERSION) return;

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

      // Add has_subtitles column if it doesn't exist
      if (!columnNames.includes('has_subtitles')) {
        console.log('[DB] Adding has_subtitles column...');
        await this.db.execute("ALTER TABLE entries ADD COLUMN has_subtitles INTEGER DEFAULT 0");
        console.log('[DB] has_subtitles column added successfully');
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
      await this.db.execute("UPDATE entries SET has_subtitles = 0 WHERE has_subtitles IS NULL");
      await this.db.execute("UPDATE entries SET is_platinum = 0 WHERE is_platinum IS NULL");
      await this.db.execute("UPDATE entries SET is_completed = 0 WHERE is_completed IS NULL");
      await this.db.execute("UPDATE entries SET is_early_access = 0 WHERE is_early_access IS NULL");
      await this.db.execute(`PRAGMA user_version = ${ENTRY_SCHEMA_VERSION}`);
    } catch (error) {
      console.error('[DB] Migration error:', error);
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

  private async migrateProfilesTable() {
    if (!this.db) return;

    const columns = await this.getTableInfo('profiles');
    if (columns.length === 0) return;

    const columnNames = columns.map(c => c.name);

    // Non-destructive per-profile crop/reframe metadata (JSON in crop_data).
    if (!columnNames.includes('crop_data')) {
      console.log('[DB] Adding crop_data to profiles...');
      await this.db.execute("ALTER TABLE profiles ADD COLUMN crop_data TEXT");
    }
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
          has_subtitles INTEGER DEFAULT 0,
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
          crop_data TEXT,
          PRIMARY KEY (type, name)
        )
      `);

      // Create hidden profiles table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS hidden_profiles (
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          hidden_date TEXT NOT NULL,
          PRIMARY KEY (type, name)
        )
      `);

      // Create backlog items table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS backlog_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          entry_type TEXT NOT NULL,
          genre TEXT,
          image_url TEXT,
          status TEXT NOT NULL DEFAULT 'planning',
          added_date TEXT NOT NULL,
          sort_order INTEGER DEFAULT 0
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
    const rows = await db.select<MediaEntry[]>(
      "SELECT * FROM entries ORDER BY completion_date DESC, id DESC"
    );
    return filterHiddenEntries(rows);
  }

  /**
   * Count of adult entries, ignoring the Adult Media setting. Used by the
   * Settings confirmation dialog to tell the user how many entries will be
   * hidden (not deleted) when they turn the setting off.
   */
  async countAdultEntries(): Promise<number> {
    const db = await this.connect();
    const list = ADULT_ENTRY_TYPES.map((t) => `'${t.replace(/'/g, "''")}'`).join(', ');
    const result = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM entries WHERE entry_type IN (${list})`
    );
    return result[0]?.count ?? 0;
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
       WHERE ${column} IS NOT NULL AND TRIM(${column}) <> ''${adultExclusionSql()}
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
           WHERE actress IS NOT NULL AND TRIM(actress) <> ''${adultExclusionSql()}
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

    const rows = await db.select<MediaEntry[]>(
      `SELECT *
       FROM entries
       ${whereClause}
       ORDER BY completion_date DESC, id DESC`,
      params
    );
    return filterHiddenEntries(rows);
  }

  async getEntriesByYear(year: string): Promise<MediaEntry[]> {
    const db = await this.connect();
    const rows = await db.select<MediaEntry[]>(
      "SELECT * FROM entries WHERE year_completed = $1 ORDER BY completion_date ASC",
      [year]
    );
    return filterHiddenEntries(rows);
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
    notifyEntriesMutated();
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
    notifyEntriesMutated();
  }

  async deleteEntry(id: number): Promise<void> {
    const db = await this.connect();
    await db.execute("DELETE FROM entries WHERE id = $1", [id]);
    notifyEntriesMutated();
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

  // --- Backlog ---

  async getAllBacklogItems(): Promise<BacklogItem[]> {
    const db = await this.connect();
    const rows = await db.select<BacklogItem[]>(
      "SELECT * FROM backlog_items ORDER BY CASE status WHEN 'in_progress' THEN 0 ELSE 1 END, sort_order ASC, id DESC"
    );
    return filterHiddenEntries(rows);
  }

  async getBacklogItemsByStatus(status: BacklogItem['status']): Promise<BacklogItem[]> {
    const db = await this.connect();
    const rows = await db.select<BacklogItem[]>(
      "SELECT * FROM backlog_items WHERE status = $1 ORDER BY sort_order ASC, id DESC",
      [status]
    );
    return filterHiddenEntries(rows);
  }

  async addBacklogItem(item: Omit<BacklogItem, 'id'>): Promise<number> {
    const db = await this.connect();
    const keys = Object.keys(item);
    const values = Object.values(item);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(",");

    const result: any = await db.execute(
      `INSERT INTO backlog_items (${keys.join(",")}) VALUES (${placeholders})`,
      values
    );
    return result.lastInsertId;
  }

  async getNextBacklogSortOrder(status: BacklogItem['status']): Promise<number> {
    const db = await this.connect();
    const result = await db.select<{ next_order: number }[]>(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM backlog_items WHERE status = $1",
      [status]
    );
    return result[0]?.next_order ?? 0;
  }

  async updateBacklogItem(item: BacklogItem): Promise<void> {
    const db = await this.connect();
    const { id, ...rest } = item;
    const keys = Object.keys(rest);
    const values = Object.values(rest);
    const setString = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");

    await db.execute(
      `UPDATE backlog_items SET ${setString} WHERE id = $${values.length + 1}`,
      [...values, id]
    );
  }

  async updateBacklogStatus(id: number, status: BacklogItem['status']): Promise<void> {
    const db = await this.connect();
    const nextSortOrder = await this.getNextBacklogSortOrder(status);
    await db.execute(
      "UPDATE backlog_items SET status = $1, sort_order = $2 WHERE id = $3",
      [status, nextSortOrder, id]
    );
  }

  async updateBacklogItemOrder(status: BacklogItem['status'], ids: number[]): Promise<void> {
    const db = await this.connect();
    for (let i = 0; i < ids.length; i++) {
      await db.execute(
        "UPDATE backlog_items SET sort_order = $1 WHERE id = $2 AND status = $3",
        [i, ids[i], status]
      );
    }
  }

  async deleteBacklogItem(id: number): Promise<void> {
    const db = await this.connect();
    await db.execute("DELETE FROM backlog_items WHERE id = $1", [id]);
  }

  // Random Pick methods

  async getRandomPickFilterOptions(): Promise<RandomPickFilterOptions> {
    const db = await this.connect();

    const [platforms, franchises, series, genres, years, entryTypes] = await Promise.all([
      this.getDistinctColumnValues(db, 'platform'),
      this.getDistinctColumnValues(db, 'franchise'),
      this.getDistinctColumnValues(db, 'series'),
      db.select<{ value: string }[]>(
        `WITH RECURSIVE split(value, rest) AS (
           SELECT '', TRIM(genre) || ','
           FROM entries
           WHERE genre IS NOT NULL AND TRIM(genre) <> ''${adultExclusionSql()}
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
      db.select<{ value: number }[]>(
        `SELECT DISTINCT year_completed as value
         FROM entries
         WHERE year_completed IS NOT NULL${adultExclusionSql()}
         ORDER BY year_completed DESC`
      ),
      db.select<{ value: string }[]>(
        `SELECT DISTINCT entry_type as value
         FROM entries
         WHERE entry_type IS NOT NULL AND TRIM(entry_type) <> ''${adultExclusionSql()}
         ORDER BY value COLLATE NOCASE ASC`
      ),
    ]);

    return {
      genres: genres.map(({ value }) => value),
      platforms,
      franchises,
      series,
      years: years.map(({ value }) => value),
      entryTypes: entryTypes.map(({ value }) => value),
    };
  }

  private buildRandomPickWhere(filters: RandomPickFilters): { whereClause: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.entryTypes.length > 0) {
      const placeholders = filters.entryTypes.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      conditions.push(`entry_type IN (${placeholders.join(', ')})`);
    }

    if (filters.ratingOperator !== "any") {
      const ops = { eq: "=", gte: ">=", lte: "<=" } as const;
      params.push(filters.ratingValue);
      conditions.push(`review_score ${ops[filters.ratingOperator]} $${params.length}`);
    }

    if (filters.yearMode === "exact" && filters.yearExact != null) {
      params.push(filters.yearExact);
      conditions.push(`year_completed = $${params.length}`);
    } else if (filters.yearMode === "range") {
      if (filters.yearFrom != null) {
        params.push(filters.yearFrom);
        conditions.push(`year_completed >= $${params.length}`);
      }
      if (filters.yearTo != null) {
        params.push(filters.yearTo);
        conditions.push(`year_completed <= $${params.length}`);
      }
    }

    if (filters.localCopy === "yes") {
      conditions.push(`own_local_copy = 1`);
    } else if (filters.localCopy === "no") {
      conditions.push(`own_local_copy = 0`);
    }

    if (filters.rewatchStatus === "never") {
      conditions.push(`is_rewatch = 0`);
    } else if (filters.rewatchStatus === "has") {
      conditions.push(`is_rewatch = 1`);
    }

    if (filters.genres.length > 0) {
      const genreClauses = filters.genres.map((g) => {
        const escaped = this.escapeLike(g);
        params.push(`%${escaped}%`);
        return `genre LIKE $${params.length} ESCAPE '\\'`;
      });
      conditions.push(`(${genreClauses.join(' OR ')})`);
    }

    const addInFilter = (column: string, values: string[]) => {
      if (values.length === 0) return;
      const placeholders = values.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      conditions.push(`${column} IN (${placeholders.join(', ')})`);
    };

    addInFilter('platform', filters.platforms);
    addInFilter('franchise', filters.franchises);
    addInFilter('series', filters.series);

    // Hide adult entries from random picks (count and result) when disabled,
    // regardless of any stale entryTypes filter that might include them.
    if (!isAdultMediaEnabled()) {
      const list = ADULT_ENTRY_TYPES.map((t) => `'${t.replace(/'/g, "''")}'`).join(', ');
      conditions.push(`(entry_type IS NULL OR entry_type NOT IN (${list}))`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  async getRandomPickCount(filters: RandomPickFilters): Promise<number> {
    const db = await this.connect();
    const { whereClause, params } = this.buildRandomPickWhere(filters);
    const result = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM entries ${whereClause}`,
      params
    );
    return result[0].count;
  }

  async getRandomEntry(filters: RandomPickFilters): Promise<MediaEntry | null> {
    const db = await this.connect();
    const { whereClause, params } = this.buildRandomPickWhere(filters);
    const results = await db.select<MediaEntry[]>(
      `SELECT * FROM entries ${whereClause} ORDER BY RANDOM() LIMIT 1`,
      params
    );
    return results[0] ?? null;
  }
}

export const dbService = new DBService();
