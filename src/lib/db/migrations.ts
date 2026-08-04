import type Database from '@tauri-apps/plugin-sql';

const ENTRY_SCHEMA_VERSION = 1;

/**
 * Run database migrations to add new columns
 */
export async function runMigrations(db: Database): Promise<void> {
  // Rename legacy 'javs' table to 'entries' (for existing databases)
  const javsTable = await db.select<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='javs'"
  );
  if (javsTable.length > 0) {
    console.log('[DB] Renaming javs table to entries...');
    await db.execute("ALTER TABLE javs RENAME TO entries");
    console.log('[DB] Table renamed successfully');
  }

  // Ensure base tables exist (creates 'entries' for new users)
  await createTables(db);

  // Repair schema drift from older builds
  await runSchemaCompatibilityMigrations(db);

  // Check newer entry columns once for migrated DBs, then skip this probing on future connects.
  await runEntryColumnMigrations(db);

  // Award templates migration
  await runAwardTemplatesMigration(db);

  // Enforce UNIQUE(year, template_id) on award_categories so the same
  // reusable template cannot be added to a single year more than once.
  await runAwardCategoriesUniqueMigration(db);
}

async function getTableInfo(db: Database, tableName: string): Promise<{ name: string; pk: number }[]> {
  return await db.select<{ name: string; pk: number }[]>(
    `PRAGMA table_info(${tableName})`
  );
}

async function runSchemaCompatibilityMigrations(db: Database) {
  try {
    await migrateAwardYearsTable(db);
    await migrateCollectionItemsTable(db);
    await migrateErasTable(db);
    await migrateAwardCategoriesTable(db);
    await migrateAwardWinnersTable(db);
    await migrateProfilesTable(db);
    await migrateBacklogItemsTable(db);
  } catch (error) {
    console.error('[DB] Compatibility migration error:', error);
  }
}

async function runEntryColumnMigrations(db: Database) {
  try {
    const versionRows = await db.select<{ user_version: number }[]>("PRAGMA user_version");
    const schemaVersion = versionRows[0]?.user_version ?? 0;
    if (schemaVersion >= ENTRY_SCHEMA_VERSION) return;

    const columns = await db.select<{ name: string }[]>(
      "PRAGMA table_info(entries)"
    );
    const columnNames = columns.map(c => c.name);

    // Add franchise column if it doesn't exist
    if (!columnNames.includes('franchise')) {
      console.log('[DB] Adding franchise column...');
      await db.execute("ALTER TABLE entries ADD COLUMN franchise TEXT");
      console.log('[DB] Franchise column added successfully');
    }

    // Add series column if it doesn't exist
    if (!columnNames.includes('series')) {
      console.log('[DB] Adding series column...');
      await db.execute("ALTER TABLE entries ADD COLUMN series TEXT");
      console.log('[DB] Series column added successfully');
    }

    // Add has_subtitles column if it doesn't exist
    if (!columnNames.includes('has_subtitles')) {
      console.log('[DB] Adding has_subtitles column...');
      await db.execute("ALTER TABLE entries ADD COLUMN has_subtitles INTEGER DEFAULT 0");
      console.log('[DB] has_subtitles column added successfully');
    }

    // Add is_platinum column if it doesn't exist
    if (!columnNames.includes('is_platinum')) {
      console.log('[DB] Adding is_platinum column...');
      await db.execute("ALTER TABLE entries ADD COLUMN is_platinum INTEGER DEFAULT 0");
      console.log('[DB] is_platinum column added successfully');
    }

    // Add is_completed column if it doesn't exist
    if (!columnNames.includes('is_completed')) {
      console.log('[DB] Adding is_completed column...');
      await db.execute("ALTER TABLE entries ADD COLUMN is_completed INTEGER DEFAULT 0");
      console.log('[DB] is_completed column added successfully');
    }

    // Add notes column if it doesn't exist
    if (!columnNames.includes('notes')) {
      console.log('[DB] Adding notes column...');
      await db.execute("ALTER TABLE entries ADD COLUMN notes TEXT");
      console.log('[DB] notes column added successfully');
    }

    // Add is_early_access column if it doesn't exist
    if (!columnNames.includes('is_early_access')) {
      console.log('[DB] Adding is_early_access column...');
      await db.execute("ALTER TABLE entries ADD COLUMN is_early_access INTEGER DEFAULT 0");
      console.log('[DB] is_early_access column added successfully');
    }

    // Add early_access_version column if it doesn't exist
    if (!columnNames.includes('early_access_version')) {
      console.log('[DB] Adding early_access_version column...');
      await db.execute("ALTER TABLE entries ADD COLUMN early_access_version TEXT");
      console.log('[DB] early_access_version column added successfully');
    }

    // Normalize nullable legacy rows
    await db.execute("UPDATE entries SET has_subtitles = 0 WHERE has_subtitles IS NULL");
    await db.execute("UPDATE entries SET is_platinum = 0 WHERE is_platinum IS NULL");
    await db.execute("UPDATE entries SET is_completed = 0 WHERE is_completed IS NULL");
    await db.execute("UPDATE entries SET is_early_access = 0 WHERE is_early_access IS NULL");
    await db.execute(`PRAGMA user_version = ${ENTRY_SCHEMA_VERSION}`);
  } catch (error) {
    console.error('[DB] Migration error:', error);
  }
}

async function migrateCollectionItemsTable(db: Database) {
  const columns = await getTableInfo(db, 'collection_items');
  if (columns.length === 0) return;

  const columnNames = columns.map(c => c.name);
  const hasMediaId = columnNames.includes('media_id');
  const hasEntryId = columnNames.includes('entry_id');
  const needsRebuild = !hasMediaId || hasEntryId || columnNames.includes('added_date');

  if (!needsRebuild) return;

  console.log('[DB] Migrating collection_items schema...');
  await db.execute("ALTER TABLE collection_items RENAME TO collection_items_old");
  await db.execute(`
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

    await db.execute(`
      INSERT INTO collection_items (id, collection_id, media_id, sort_order)
      SELECT ${idExpr}, collection_id, ${sourceMediaColumn}, ${sortOrderExpr}
      FROM collection_items_old
    `);
  }

  await db.execute("DROP TABLE collection_items_old");
  console.log('[DB] collection_items schema migration complete');
}

/**
 * Ensure the collection_eras table exists and collection_items gains an
 * era_id column. Eras are an opt-in overlay: items keep their sort_order and
 * simply reference an era for the bracket rendering. Runs after
 * migrateCollectionItemsTable so a legacy rebuild still gets the column.
 */
async function migrateErasTable(db: Database) {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS collection_eras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_date TEXT NOT NULL
      )
    `);

    const itemsColumns = await getTableInfo(db, 'collection_items');
    if (itemsColumns.length > 0 && !itemsColumns.map(c => c.name).includes('era_id')) {
      console.log('[DB] Adding era_id to collection_items...');
      await db.execute("ALTER TABLE collection_items ADD COLUMN era_id INTEGER");
      console.log('[DB] era_id column added successfully');
    }
  } catch (error) {
    console.error('[DB] Eras table migration error:', error);
  }
}

async function migrateAwardYearsTable(db: Database) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS award_years (
      year INTEGER PRIMARY KEY,
      created_date TEXT NOT NULL
    )
  `);

  await db.execute(`
    INSERT OR IGNORE INTO award_years (year, created_date)
    SELECT year, COALESCE(MIN(created_date), datetime('now'))
    FROM award_categories
    WHERE year IS NOT NULL
    GROUP BY year
  `);
}

async function migrateAwardCategoriesTable(db: Database) {
  const columns = await getTableInfo(db, 'award_categories');
  if (columns.length === 0) return;

  const columnNames = columns.map(c => c.name);

  if (!columnNames.includes('created_date')) {
    console.log('[DB] Adding created_date to award_categories...');
    await db.execute("ALTER TABLE award_categories ADD COLUMN created_date TEXT");
  }

  await db.execute(
    "UPDATE award_categories SET created_date = datetime('now') WHERE created_date IS NULL OR created_date = ''"
  );
}

async function migrateAwardWinnersTable(db: Database) {
  const columns = await getTableInfo(db, 'award_winners');
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
  await db.execute("ALTER TABLE award_winners RENAME TO award_winners_old");
  await db.execute(`
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

    await db.execute(`
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

  await db.execute("DROP TABLE award_winners_old");
  console.log('[DB] award_winners schema migration complete');
}

async function migrateProfilesTable(db: Database) {
  const columns = await getTableInfo(db, 'profiles');
  if (columns.length === 0) return;

  const columnNames = columns.map(c => c.name);

  // Non-destructive per-profile crop/reframe metadata (JSON in crop_data).
  if (!columnNames.includes('crop_data')) {
    console.log('[DB] Adding crop_data to profiles...');
    await db.execute("ALTER TABLE profiles ADD COLUMN crop_data TEXT");
  }

  // Per-profile opt-in toggle for AVG rating history tracking (0/1 integer).
  if (!columnNames.includes('track_avg_history')) {
    console.log('[DB] Adding track_avg_history to profiles...');
    await db.execute("ALTER TABLE profiles ADD COLUMN track_avg_history INTEGER NOT NULL DEFAULT 0");
  }
}

async function migrateBacklogItemsTable(db: Database) {
  const columns = await getTableInfo(db, 'backlog_items');
  if (columns.length === 0) return;

  // Optional release date for 'unreleased' backlog items (ISO YYYY-MM-DD).
  if (!columns.map(c => c.name).includes('release_date')) {
    console.log('[DB] Adding release_date to backlog_items...');
    await db.execute("ALTER TABLE backlog_items ADD COLUMN release_date TEXT");
  }
}

/**
 * Create base tables if they don't exist (for new users)
 */
async function createTables(db: Database) {
  try {
    // Create main entries table
    await db.execute(`
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
    await db.execute(`
      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_date TEXT NOT NULL
      )
    `);

    // Create collection items table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS collection_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        media_id INTEGER NOT NULL,
        sort_order INTEGER DEFAULT 0,
        era_id INTEGER,
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
        FOREIGN KEY (media_id) REFERENCES entries(id) ON DELETE CASCADE
      )
    `);

    // Create collection eras table (optional sub-groupings over collection items)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS collection_eras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_date TEXT NOT NULL
      )
    `);

    // Create award categories table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS award_years (
        year INTEGER PRIMARY KEY,
        created_date TEXT NOT NULL
      )
    `);

    await db.execute(`
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
    await db.execute(`
      CREATE TABLE IF NOT EXISTS award_winners (
        category_id INTEGER PRIMARY KEY,
        media_id INTEGER NOT NULL,
        selected_date TEXT,
        FOREIGN KEY (category_id) REFERENCES award_categories(id) ON DELETE CASCADE,
        FOREIGN KEY (media_id) REFERENCES entries(id) ON DELETE CASCADE
      )
    `);

    // Create profile images table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS profiles (
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        image_url TEXT NOT NULL,
        crop_data TEXT,
        track_avg_history INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (type, name)
      )
    `);

    // Create hidden profiles table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS hidden_profiles (
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        hidden_date TEXT NOT NULL,
        PRIMARY KEY (type, name)
      )
    `);

    // Opt-in per-profile history of average rating over time. Rows are appended
    // whenever an entry affecting a tracked profile is added/updated/deleted, plus
    // a one-time backfill (source='backfill') when tracking is first enabled.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS profile_avg_history (
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        average_score REAL NOT NULL,
        rated_count INTEGER NOT NULL,
        total_count INTEGER NOT NULL,
        source TEXT NOT NULL,
        PRIMARY KEY (type, name, captured_at)
      )
    `);

    // Create backlog items table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS backlog_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        genre TEXT,
        image_url TEXT,
        status TEXT NOT NULL DEFAULT 'planning',
        added_date TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        release_date TEXT
      )
    `);

    console.log('[DB] Base tables ensured');
  } catch (error) {
    console.error('[DB] Error creating tables:', error);
  }
}

/**
 * Add a partial UNIQUE(year, template_id) index to award_categories so the
 * same reusable template cannot be inserted into a single year more than
 * once. NULL template_id rows are excluded (legacy/non-templated categories
 * can legitimately repeat names within a year). Existing duplicates are
 * collapsed (keeping the lowest id) before the index is created.
 */
async function runAwardCategoriesUniqueMigration(db: Database) {
  try {
    const indexes = await db.select<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_award_categories_year_template'"
    );
    if (indexes.length > 0) return;

    // Collapse any existing duplicates: keep the row with the smallest id,
    // delete the rest. Winners for the doomed categories are reassigned to
    // the surviving category where possible, otherwise dropped.
    const dupes = await db.select<{ year: number; template_id: number; survivor_id: number }[]>(
      `SELECT year, template_id, MIN(id) AS survivor_id
       FROM award_categories
       WHERE template_id IS NOT NULL
       GROUP BY year, template_id
       HAVING COUNT(*) > 1`
    );

    for (const d of dupes) {
      const losers = await db.select<{ id: number }[]>(
        `SELECT id FROM award_categories
         WHERE year = $1 AND template_id = $2 AND id <> $3
         ORDER BY id ASC`,
        [d.year, d.template_id, d.survivor_id]
      );
      for (const l of losers) {
        // Reassign any winner pinned to the doomed category onto the survivor
        // only if the survivor doesn't already have a winner; otherwise drop.
        const survivorWinner = await db.select<{ category_id: number }[]>(
          "SELECT category_id FROM award_winners WHERE category_id = $1",
          [d.survivor_id]
        );
        if (survivorWinner.length === 0) {
          await db.execute(
            "UPDATE OR REPLACE award_winners SET category_id = $1 WHERE category_id = $2",
            [d.survivor_id, l.id]
          );
        } else {
          await db.execute("DELETE FROM award_winners WHERE category_id = $1", [l.id]);
        }
        await db.execute("DELETE FROM award_categories WHERE id = $1", [l.id]);
      }
    }

    await db.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_award_categories_year_template
       ON award_categories (year, template_id)
       WHERE template_id IS NOT NULL`
    );
    console.log('[DB] award_categories unique (year, template_id) index ensured');
  } catch (error) {
    console.error('[DB] award_categories unique index migration error:', error);
  }
}

/**
 * Migrate awards system to support reusable templates
 */
async function runAwardTemplatesMigration(db: Database) {
  try {
    // Check if award_templates table exists
    const tables = await db.select<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='award_templates'"
    );

    if (tables.length === 0) {
      console.log('[DB] Creating award_templates table...');

      // Create award_templates table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS award_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          created_date TEXT NOT NULL
        )
      `);
      console.log('[DB] award_templates table created');
    }

    // Check if template_id column exists in award_categories
    const catColumns = await db.select<{ name: string }[]>(
      "PRAGMA table_info(award_categories)"
    );
    const catColumnNames = catColumns.map(c => c.name);

    if (!catColumnNames.includes('template_id')) {
      console.log('[DB] Adding template_id column to award_categories...');
      await db.execute(
        "ALTER TABLE award_categories ADD COLUMN template_id INTEGER REFERENCES award_templates(id)"
      );

      // Migrate existing categories to templates
      console.log('[DB] Migrating existing categories to templates...');

      // Get unique category names
      const uniqueNames = await db.select<{ name: string }[]>(
        "SELECT DISTINCT name FROM award_categories"
      );

      for (const { name } of uniqueNames) {
        // Create template for this name
        await db.execute(
          "INSERT OR IGNORE INTO award_templates (name, created_date) VALUES ($1, datetime('now'))",
          [name]
        );

        // Get the template id
        const template = await db.select<{ id: number }[]>(
          "SELECT id FROM award_templates WHERE name = $1",
          [name]
        );

        if (template.length > 0) {
          // Link all categories with this name to the template
          await db.execute(
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
