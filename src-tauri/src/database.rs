use serde::{Deserialize, Serialize};
use sqlx::{FromRow, QueryBuilder, Row, Sqlite, SqlitePool, Transaction};
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

const DATABASE_SCHEMA_VERSION: i64 = 3;
const MAX_SQLITE_BIND_PARAMS: usize = 999;
const MAX_BULK_MUTATION_ITEMS: usize = 10_000;

#[derive(Debug, Clone, Deserialize, Serialize, FromRow)]
pub struct EntryRow {
    pub id: i64,
    pub name: String,
    pub genre: Option<String>,
    pub completion_date: Option<String>,
    pub review_score: Option<f64>,
    pub description: Option<String>,
    pub notes: Option<String>,
    pub year_completed: Option<i64>,
    pub is_rewatch: i64,
    pub own_local_copy: i64,
    pub has_subtitles: i64,
    pub is_platinum: i64,
    pub is_completed: i64,
    pub is_early_access: i64,
    pub early_access_version: Option<String>,
    pub image_url: Option<String>,
    pub entry_type: Option<String>,
    pub platform: Option<String>,
    pub author: Option<String>,
    pub artist: Option<String>,
    pub director: Option<String>,
    pub actress: Option<String>,
    pub update_version: Option<String>,
    pub franchise: Option<String>,
    pub series: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, FromRow)]
pub struct CollectionRow {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub created_date: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, FromRow)]
pub struct CollectionEraRow {
    pub id: i64,
    pub collection_id: i64,
    pub name: String,
    pub color: String,
    pub sort_order: i64,
    pub created_date: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, FromRow)]
pub struct CollectionItemRow {
    pub id: i64,
    pub collection_id: i64,
    pub media_id: i64,
    pub sort_order: i64,
    pub era_id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Serialize, FromRow)]
pub struct AwardYearRow {
    pub year: i64,
    pub created_date: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, FromRow)]
pub struct AwardTemplateRow {
    pub id: i64,
    pub name: String,
    pub created_date: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, FromRow)]
pub struct AwardCategoryRow {
    pub id: i64,
    pub year: i64,
    pub name: String,
    pub created_date: String,
    pub sort_order: i64,
    pub template_id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Serialize, FromRow)]
pub struct AwardWinnerRow {
    pub category_id: i64,
    pub media_id: i64,
    pub selected_date: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, FromRow)]
pub struct ProfileRow {
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub profile_type: String,
    pub name: String,
    pub image_url: String,
    pub crop_data: Option<String>,
    pub track_avg_history: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize, FromRow)]
pub struct HiddenProfileRow {
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub profile_type: String,
    pub name: String,
    pub hidden_date: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, FromRow)]
pub struct ProfileAvgHistoryRow {
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub profile_type: String,
    pub name: String,
    pub captured_at: String,
    pub average_score: f64,
    pub rated_count: i64,
    pub total_count: i64,
    pub source: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, FromRow)]
pub struct BacklogItemRow {
    pub id: i64,
    pub name: String,
    pub entry_type: String,
    pub genre: Option<String>,
    pub image_url: Option<String>,
    pub status: String,
    pub added_date: String,
    pub sort_order: i64,
    pub release_date: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BackupTables {
    pub entries: Vec<EntryRow>,
    pub collections: Vec<CollectionRow>,
    pub collection_eras: Vec<CollectionEraRow>,
    pub collection_items: Vec<CollectionItemRow>,
    pub award_years: Vec<AwardYearRow>,
    pub award_templates: Vec<AwardTemplateRow>,
    pub award_categories: Vec<AwardCategoryRow>,
    pub award_winners: Vec<AwardWinnerRow>,
    pub profiles: Vec<ProfileRow>,
    pub hidden_profiles: Vec<HiddenProfileRow>,
    pub profile_avg_history: Vec<ProfileAvgHistoryRow>,
    pub backlog_items: Vec<BacklogItemRow>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableImportCount {
    pub inserted: usize,
    pub reused: usize,
    pub updated: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseImportResult {
    pub table_counts: BTreeMap<String, TableImportCount>,
}

fn database_error(context: &str, error: impl std::fmt::Display) -> String {
    format!("{context}: {error}")
}

async fn sqlite_pool(
    instances: &State<'_, DbInstances>,
    database_url: &str,
) -> Result<SqlitePool, String> {
    let databases = instances.0.read().await;
    match databases.get(database_url) {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        #[allow(unreachable_patterns)]
        Some(_) => Err("The requested database is not SQLite".to_string()),
        None => Err(format!("Database is not loaded: {database_url}")),
    }
}

async fn table_exists(tx: &mut Transaction<'_, Sqlite>, table_name: &str) -> Result<bool, String> {
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .bind(table_name)
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| database_error("Failed to inspect database tables", error))?;
    Ok(count > 0)
}

async fn table_columns(
    tx: &mut Transaction<'_, Sqlite>,
    table_name: &str,
) -> Result<HashMap<String, i64>, String> {
    let sql = format!("PRAGMA table_info({table_name})");
    let rows = sqlx::query(&sql)
        .fetch_all(&mut **tx)
        .await
        .map_err(|error| database_error(&format!("Failed to inspect {table_name}"), error))?;
    Ok(rows
        .into_iter()
        .map(|row| (row.get::<String, _>("name"), row.get::<i64, _>("pk")))
        .collect())
}

async fn execute_schema_sql(
    tx: &mut Transaction<'_, Sqlite>,
    sql: &str,
    context: &str,
) -> Result<(), String> {
    sqlx::query(sql)
        .execute(&mut **tx)
        .await
        .map_err(|error| database_error(context, error))?;
    Ok(())
}

async fn create_current_tables(tx: &mut Transaction<'_, Sqlite>) -> Result<(), String> {
    let statements = [
        r#"CREATE TABLE IF NOT EXISTS entries (
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
        )"#,
        r#"CREATE TABLE IF NOT EXISTS collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            created_date TEXT NOT NULL
        )"#,
        r#"CREATE TABLE IF NOT EXISTS award_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_date TEXT NOT NULL
        )"#,
        r#"CREATE TABLE IF NOT EXISTS award_years (
            year INTEGER PRIMARY KEY,
            created_date TEXT NOT NULL
        )"#,
        r#"CREATE TABLE IF NOT EXISTS award_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER NOT NULL,
            name TEXT NOT NULL,
            created_date TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            template_id INTEGER REFERENCES award_templates(id)
        )"#,
        r#"CREATE TABLE IF NOT EXISTS collection_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            collection_id INTEGER NOT NULL,
            media_id INTEGER NOT NULL,
            sort_order INTEGER DEFAULT 0,
            era_id INTEGER,
            FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
            FOREIGN KEY (media_id) REFERENCES entries(id) ON DELETE CASCADE
        )"#,
        r#"CREATE TABLE IF NOT EXISTS collection_eras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            collection_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_date TEXT NOT NULL
        )"#,
        r#"CREATE TABLE IF NOT EXISTS award_winners (
            category_id INTEGER PRIMARY KEY,
            media_id INTEGER NOT NULL,
            selected_date TEXT,
            FOREIGN KEY (category_id) REFERENCES award_categories(id) ON DELETE CASCADE,
            FOREIGN KEY (media_id) REFERENCES entries(id) ON DELETE CASCADE
        )"#,
        r#"CREATE TABLE IF NOT EXISTS profiles (
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            image_url TEXT NOT NULL,
            crop_data TEXT,
            track_avg_history INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (type, name)
        )"#,
        r#"CREATE TABLE IF NOT EXISTS hidden_profiles (
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            hidden_date TEXT NOT NULL,
            PRIMARY KEY (type, name)
        )"#,
        r#"CREATE TABLE IF NOT EXISTS profile_avg_history (
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            captured_at TEXT NOT NULL,
            average_score REAL NOT NULL,
            rated_count INTEGER NOT NULL,
            total_count INTEGER NOT NULL,
            source TEXT NOT NULL,
            PRIMARY KEY (type, name, captured_at)
        )"#,
        r#"CREATE TABLE IF NOT EXISTS backlog_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            entry_type TEXT NOT NULL,
            genre TEXT,
            image_url TEXT,
            status TEXT NOT NULL DEFAULT 'planning',
            added_date TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            release_date TEXT
        )"#,
    ];

    for statement in statements {
        execute_schema_sql(
            tx,
            statement,
            "Failed to create the current database schema",
        )
        .await?;
    }
    Ok(())
}

async fn add_missing_column(
    tx: &mut Transaction<'_, Sqlite>,
    table: &str,
    columns: &mut HashMap<String, i64>,
    name: &str,
    definition: &str,
) -> Result<(), String> {
    if columns.contains_key(name) {
        return Ok(());
    }
    let sql = format!("ALTER TABLE {table} ADD COLUMN {name} {definition}");
    execute_schema_sql(tx, &sql, &format!("Failed to add {table}.{name}")).await?;
    columns.insert(name.to_string(), 0);
    Ok(())
}

async fn merge_collection_items_source(
    tx: &mut Transaction<'_, Sqlite>,
    source: &str,
) -> Result<(), String> {
    let columns = table_columns(tx, source).await?;
    let media_column = if columns.contains_key("media_id") {
        "media_id"
    } else if columns.contains_key("entry_id") {
        "entry_id"
    } else {
        return Err(format!("Cannot recover {source}: no media ID column"));
    };
    if !columns.contains_key("collection_id") {
        return Err(format!("Cannot recover {source}: no collection_id column"));
    }
    let sort_order = if columns.contains_key("sort_order") {
        "COALESCE(source.sort_order, 0)"
    } else {
        "0"
    };
    let era_id = if columns.contains_key("era_id") {
        "source.era_id"
    } else {
        "NULL"
    };
    let sql = format!(
        r#"INSERT INTO collection_items (collection_id, media_id, sort_order, era_id)
           SELECT source.collection_id, source.{media_column}, {sort_order}, {era_id}
           FROM {source} source
           WHERE source.{media_column} IS NOT NULL
             AND source.collection_id IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM collection_items current
               WHERE current.collection_id = source.collection_id
                 AND current.media_id = source.{media_column}
             )"#
    );
    execute_schema_sql(tx, &sql, &format!("Failed to recover rows from {source}")).await
}

async fn normalize_collection_items(tx: &mut Transaction<'_, Sqlite>) -> Result<(), String> {
    let columns = table_columns(tx, "collection_items").await?;
    let current_shape = columns.contains_key("media_id")
        && !columns.contains_key("entry_id")
        && !columns.contains_key("added_date");

    if !current_shape {
        if table_exists(tx, "collection_items_migration_v2").await? {
            return Err(
                "Cannot migrate collection_items: recovery table already exists".to_string(),
            );
        }
        execute_schema_sql(
            tx,
            "ALTER TABLE collection_items RENAME TO collection_items_migration_v2",
            "Failed to stage legacy collection_items",
        )
        .await?;
        execute_schema_sql(
            tx,
            r#"CREATE TABLE collection_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                collection_id INTEGER NOT NULL,
                media_id INTEGER NOT NULL,
                sort_order INTEGER DEFAULT 0,
                era_id INTEGER,
                FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
                FOREIGN KEY (media_id) REFERENCES entries(id) ON DELETE CASCADE
            )"#,
            "Failed to rebuild collection_items",
        )
        .await?;
        merge_collection_items_source(tx, "collection_items_migration_v2").await?;
        execute_schema_sql(
            tx,
            "DROP TABLE collection_items_migration_v2",
            "Failed to finish collection_items migration",
        )
        .await?;
    }

    if table_exists(tx, "collection_items_old").await? {
        merge_collection_items_source(tx, "collection_items_old").await?;
        execute_schema_sql(
            tx,
            "DROP TABLE collection_items_old",
            "Failed to remove recovered collection_items_old",
        )
        .await?;
    }

    let mut columns = table_columns(tx, "collection_items").await?;
    add_missing_column(tx, "collection_items", &mut columns, "era_id", "INTEGER").await
}

async fn merge_award_winners_source(
    tx: &mut Transaction<'_, Sqlite>,
    source: &str,
) -> Result<(), String> {
    let columns = table_columns(tx, source).await?;
    let media_column = if columns.contains_key("media_id") {
        "media_id"
    } else if columns.contains_key("entry_id") {
        "entry_id"
    } else {
        return Err(format!("Cannot recover {source}: no media ID column"));
    };
    if !columns.contains_key("category_id") {
        return Err(format!("Cannot recover {source}: no category_id column"));
    }
    let selected_date = if columns.contains_key("selected_date") {
        "COALESCE(source.selected_date, datetime('now'))"
    } else {
        "datetime('now')"
    };
    let sql = format!(
        r#"INSERT OR IGNORE INTO award_winners (category_id, media_id, selected_date)
           SELECT source.category_id, source.{media_column}, {selected_date}
           FROM {source} source
           JOIN (
             SELECT category_id, MAX(rowid) AS latest_rowid
             FROM {source}
             WHERE category_id IS NOT NULL
             GROUP BY category_id
           ) latest ON latest.latest_rowid = source.rowid
           WHERE source.{media_column} IS NOT NULL"#
    );
    execute_schema_sql(tx, &sql, &format!("Failed to recover rows from {source}")).await
}

async fn normalize_award_winners(tx: &mut Transaction<'_, Sqlite>) -> Result<(), String> {
    let columns = table_columns(tx, "award_winners").await?;
    let current_shape = columns.get("category_id") == Some(&1)
        && columns.contains_key("media_id")
        && !columns.contains_key("entry_id")
        && columns.contains_key("selected_date");

    if !current_shape {
        if table_exists(tx, "award_winners_migration_v2").await? {
            return Err("Cannot migrate award_winners: recovery table already exists".to_string());
        }
        execute_schema_sql(
            tx,
            "ALTER TABLE award_winners RENAME TO award_winners_migration_v2",
            "Failed to stage legacy award_winners",
        )
        .await?;
        execute_schema_sql(
            tx,
            r#"CREATE TABLE award_winners (
                category_id INTEGER PRIMARY KEY,
                media_id INTEGER NOT NULL,
                selected_date TEXT,
                FOREIGN KEY (category_id) REFERENCES award_categories(id) ON DELETE CASCADE,
                FOREIGN KEY (media_id) REFERENCES entries(id) ON DELETE CASCADE
            )"#,
            "Failed to rebuild award_winners",
        )
        .await?;
        merge_award_winners_source(tx, "award_winners_migration_v2").await?;
        execute_schema_sql(
            tx,
            "DROP TABLE award_winners_migration_v2",
            "Failed to finish award_winners migration",
        )
        .await?;
    }

    if table_exists(tx, "award_winners_old").await? {
        merge_award_winners_source(tx, "award_winners_old").await?;
        execute_schema_sql(
            tx,
            "DROP TABLE award_winners_old",
            "Failed to remove recovered award_winners_old",
        )
        .await?;
    }
    Ok(())
}

async fn migrate_to_v2(tx: &mut Transaction<'_, Sqlite>) -> Result<(), String> {
    let has_javs = table_exists(tx, "javs").await?;
    let has_entries = table_exists(tx, "entries").await?;
    if has_javs && has_entries {
        return Err(
            "Both legacy javs and entries tables exist; refusing an ambiguous migration"
                .to_string(),
        );
    }
    if has_javs {
        execute_schema_sql(
            tx,
            "ALTER TABLE javs RENAME TO entries",
            "Failed to rename the legacy media table",
        )
        .await?;
    }

    create_current_tables(tx).await?;

    let mut entry_columns = table_columns(tx, "entries").await?;
    for (name, definition) in [
        ("franchise", "TEXT"),
        ("series", "TEXT"),
        ("has_subtitles", "INTEGER DEFAULT 0"),
        ("is_platinum", "INTEGER DEFAULT 0"),
        ("is_completed", "INTEGER DEFAULT 0"),
        ("notes", "TEXT"),
        ("is_early_access", "INTEGER DEFAULT 0"),
        ("early_access_version", "TEXT"),
    ] {
        add_missing_column(tx, "entries", &mut entry_columns, name, definition).await?;
    }

    normalize_collection_items(tx).await?;
    normalize_award_winners(tx).await?;

    let mut category_columns = table_columns(tx, "award_categories").await?;
    add_missing_column(
        tx,
        "award_categories",
        &mut category_columns,
        "created_date",
        "TEXT",
    )
    .await?;
    add_missing_column(
        tx,
        "award_categories",
        &mut category_columns,
        "template_id",
        "INTEGER REFERENCES award_templates(id)",
    )
    .await?;

    let mut profile_columns = table_columns(tx, "profiles").await?;
    add_missing_column(tx, "profiles", &mut profile_columns, "crop_data", "TEXT").await?;
    add_missing_column(
        tx,
        "profiles",
        &mut profile_columns,
        "track_avg_history",
        "INTEGER NOT NULL DEFAULT 0",
    )
    .await?;

    let mut backlog_columns = table_columns(tx, "backlog_items").await?;
    add_missing_column(
        tx,
        "backlog_items",
        &mut backlog_columns,
        "release_date",
        "TEXT",
    )
    .await?;

    for sql in [
        "UPDATE entries SET has_subtitles = 0 WHERE has_subtitles IS NULL",
        "UPDATE entries SET is_platinum = 0 WHERE is_platinum IS NULL",
        "UPDATE entries SET is_completed = 0 WHERE is_completed IS NULL",
        "UPDATE entries SET is_early_access = 0 WHERE is_early_access IS NULL",
        "UPDATE award_categories SET created_date = datetime('now') WHERE created_date IS NULL OR created_date = ''",
        "UPDATE profiles SET track_avg_history = 0 WHERE track_avg_history IS NULL",
        "INSERT OR IGNORE INTO award_templates (name, created_date) SELECT DISTINCT name, datetime('now') FROM award_categories WHERE name IS NOT NULL AND name <> ''",
        "UPDATE award_categories SET template_id = (SELECT id FROM award_templates WHERE award_templates.name = award_categories.name) WHERE template_id IS NULL",
        "INSERT OR IGNORE INTO award_years (year, created_date) SELECT year, COALESCE(MIN(created_date), datetime('now')) FROM award_categories WHERE year IS NOT NULL GROUP BY year",
    ] {
        execute_schema_sql(tx, sql, "Failed to normalize legacy database data").await?;
    }

    let duplicate_groups = sqlx::query(
        r#"SELECT year, template_id, MIN(id) AS survivor_id
           FROM award_categories
           WHERE template_id IS NOT NULL
           GROUP BY year, template_id
           HAVING COUNT(*) > 1"#,
    )
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| database_error("Failed to inspect duplicate award categories", error))?;

    for group in duplicate_groups {
        let year = group.get::<i64, _>("year");
        let template_id = group.get::<i64, _>("template_id");
        let survivor_id = group.get::<i64, _>("survivor_id");
        let loser_ids = sqlx::query_scalar::<_, i64>(
            "SELECT id FROM award_categories WHERE year = ? AND template_id = ? AND id <> ? ORDER BY id",
        )
        .bind(year)
        .bind(template_id)
        .bind(survivor_id)
        .fetch_all(&mut **tx)
        .await
        .map_err(|error| database_error("Failed to inspect duplicate award rows", error))?;

        for loser_id in loser_ids {
            let survivor_has_winner = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM award_winners WHERE category_id = ?",
            )
            .bind(survivor_id)
            .fetch_one(&mut **tx)
            .await
            .map_err(|error| database_error("Failed to inspect award winners", error))?
                > 0;
            if survivor_has_winner {
                sqlx::query("DELETE FROM award_winners WHERE category_id = ?")
                    .bind(loser_id)
                    .execute(&mut **tx)
                    .await
                    .map_err(|error| {
                        database_error("Failed to remove duplicate award winner", error)
                    })?;
            } else {
                sqlx::query(
                    "UPDATE OR REPLACE award_winners SET category_id = ? WHERE category_id = ?",
                )
                .bind(survivor_id)
                .bind(loser_id)
                .execute(&mut **tx)
                .await
                .map_err(|error| {
                    database_error("Failed to preserve duplicate award winner", error)
                })?;
            }
            sqlx::query("DELETE FROM award_categories WHERE id = ?")
                .bind(loser_id)
                .execute(&mut **tx)
                .await
                .map_err(|error| {
                    database_error("Failed to remove duplicate award category", error)
                })?;
        }
    }

    execute_schema_sql(
        tx,
        r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_award_categories_year_template
           ON award_categories (year, template_id)
           WHERE template_id IS NOT NULL"#,
        "Failed to create the award category uniqueness index",
    )
    .await?;
    Ok(())
}

async fn migrate_to_v3(tx: &mut Transaction<'_, Sqlite>) -> Result<(), String> {
    // Read-heavy screens substantially outnumber writes in Media Logger. These
    // indexes cover the stable filter/order/join patterns used by year views,
    // search filters, dashboard dates, collections, awards, profiles, and backlog.
    for sql in [
        r#"CREATE INDEX IF NOT EXISTS idx_entries_year_completion_id
           ON entries (year_completed, completion_date, id)"#,
        r#"CREATE INDEX IF NOT EXISTS idx_entries_completion_id
           ON entries (completion_date DESC, id DESC)"#,
        r#"CREATE INDEX IF NOT EXISTS idx_entries_type_completion_id
           ON entries (entry_type, completion_date DESC, id DESC)"#,
        r#"CREATE INDEX IF NOT EXISTS idx_entries_name_completion_id
           ON entries (name, completion_date, id)"#,
        r#"CREATE INDEX IF NOT EXISTS idx_entries_platform_completion_id
           ON entries (platform, completion_date DESC, id DESC)"#,
        r#"CREATE INDEX IF NOT EXISTS idx_entries_director_completion_id
           ON entries (director, completion_date DESC, id DESC)"#,
        r#"CREATE INDEX IF NOT EXISTS idx_entries_author_completion_id
           ON entries (author, completion_date DESC, id DESC)"#,
        r#"CREATE INDEX IF NOT EXISTS idx_entries_franchise_completion_id
           ON entries (franchise, completion_date DESC, id DESC)"#,
        r#"CREATE INDEX IF NOT EXISTS idx_entries_series_completion_id
           ON entries (series, completion_date DESC, id DESC)"#,
        r#"CREATE INDEX IF NOT EXISTS idx_entries_month_day_completion_id
           ON entries (substr(completion_date, 6, 5), completion_date DESC, id DESC)"#,
        r#"CREATE INDEX IF NOT EXISTS idx_collection_items_collection_sort_id
           ON collection_items (collection_id, sort_order, id)"#,
        r#"CREATE INDEX IF NOT EXISTS idx_collection_items_media
           ON collection_items (media_id)"#,
        r#"CREATE INDEX IF NOT EXISTS idx_collection_eras_collection_sort_id
           ON collection_eras (collection_id, sort_order, id)"#,
        r#"CREATE INDEX IF NOT EXISTS idx_award_categories_year_sort_id
           ON award_categories (year, sort_order, id)"#,
        r#"CREATE INDEX IF NOT EXISTS idx_award_winners_media
           ON award_winners (media_id)"#,
        r#"CREATE INDEX IF NOT EXISTS idx_backlog_status_sort_id
           ON backlog_items (status, sort_order, id)"#,
        r#"CREATE INDEX IF NOT EXISTS idx_profiles_track_avg_type_name
           ON profiles (track_avg_history, type, name)"#,
    ] {
        execute_schema_sql(tx, sql, "Failed to create a performance index").await?;
    }

    // External-content FTS keeps entries as the single source of truth and
    // avoids duplicating large description/notes fields. The trigram tokenizer
    // preserves the existing substring-search behavior for queries >= 3 chars.
    execute_schema_sql(
        tx,
        r#"CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
             name,
             author,
             artist,
             genre,
             director,
             actress,
             platform,
             series,
             content='entries',
             content_rowid='id',
             tokenize='trigram'
           )"#,
        "Failed to create the media search index",
    )
    .await?;

    for sql in [
        r#"CREATE TRIGGER IF NOT EXISTS entries_fts_ai
           AFTER INSERT ON entries BEGIN
             INSERT INTO entries_fts(
               rowid, name, author, artist, genre, director, actress, platform, series
             ) VALUES (
               new.id, new.name, new.author, new.artist, new.genre, new.director,
               new.actress, new.platform, new.series
             );
           END"#,
        r#"CREATE TRIGGER IF NOT EXISTS entries_fts_ad
           AFTER DELETE ON entries BEGIN
             INSERT INTO entries_fts(
               entries_fts, rowid, name, author, artist, genre, director, actress, platform, series
             ) VALUES (
               'delete', old.id, old.name, old.author, old.artist, old.genre, old.director,
               old.actress, old.platform, old.series
             );
           END"#,
        r#"CREATE TRIGGER IF NOT EXISTS entries_fts_au
           AFTER UPDATE OF name, author, artist, genre, director, actress, platform, series
           ON entries BEGIN
             INSERT INTO entries_fts(
               entries_fts, rowid, name, author, artist, genre, director, actress, platform, series
             ) VALUES (
               'delete', old.id, old.name, old.author, old.artist, old.genre, old.director,
               old.actress, old.platform, old.series
             );
             INSERT INTO entries_fts(
               rowid, name, author, artist, genre, director, actress, platform, series
             ) VALUES (
               new.id, new.name, new.author, new.artist, new.genre, new.director,
               new.actress, new.platform, new.series
             );
           END"#,
    ] {
        execute_schema_sql(tx, sql, "Failed to create a media search trigger").await?;
    }

    execute_schema_sql(
        tx,
        "INSERT INTO entries_fts(entries_fts) VALUES('rebuild')",
        "Failed to populate the media search index",
    )
    .await
}

#[tauri::command]
pub async fn database_run_migrations(
    database_url: String,
    instances: State<'_, DbInstances>,
) -> Result<Vec<i64>, String> {
    let pool = sqlite_pool(&instances, &database_url).await?;
    let current_version = sqlx::query_scalar::<_, i64>("PRAGMA user_version")
        .fetch_one(&pool)
        .await
        .map_err(|error| database_error("Failed to read the database schema version", error))?;
    if current_version > DATABASE_SCHEMA_VERSION {
        return Err(format!(
            "Database schema version {current_version} is newer than supported version {DATABASE_SCHEMA_VERSION}"
        ));
    }

    let mut applied = Vec::new();
    let mut migrated_version = current_version;
    if migrated_version < 2 {
        let mut tx = pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(|error| database_error("Failed to begin database migration", error))?;
        let migration_result = async {
            migrate_to_v2(&mut tx).await?;
            execute_schema_sql(
                &mut tx,
                "PRAGMA user_version = 2",
                "Failed to record the database schema version",
            )
            .await
        }
        .await;
        if let Err(error) = migration_result {
            return match tx.rollback().await {
                Ok(()) => Err(error),
                Err(rollback_error) => Err(format!(
                    "{error}; migration rollback also failed: {rollback_error}"
                )),
            };
        }
        tx.commit()
            .await
            .map_err(|error| database_error("Failed to commit database migration", error))?;
        applied.push(2);
        migrated_version = 2;
    }

    if migrated_version < 3 {
        let mut tx = pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(|error| database_error("Failed to begin database migration", error))?;
        let migration_result = async {
            migrate_to_v3(&mut tx).await?;
            execute_schema_sql(
                &mut tx,
                "PRAGMA user_version = 3",
                "Failed to record the database schema version",
            )
            .await
        }
        .await;
        if let Err(error) = migration_result {
            return match tx.rollback().await {
                Ok(()) => Err(error),
                Err(rollback_error) => Err(format!(
                    "{error}; migration rollback also failed: {rollback_error}"
                )),
            };
        }
        tx.commit()
            .await
            .map_err(|error| database_error("Failed to commit database migration", error))?;
        applied.push(3);
    }
    if !applied.is_empty() {
        // Schema/plan changes may invalidate cached statistics. This is a
        // best-effort optimization hint and must never block app startup.
        let _ = sqlx::query("PRAGMA optimize").execute(&pool).await;
    }
    Ok(applied)
}

fn validate_bulk_ids(ids: &[i64], label: &str) -> Result<(), String> {
    if ids.len() > MAX_BULK_MUTATION_ITEMS {
        return Err(format!(
            "{label} contains {} items; the maximum is {MAX_BULK_MUTATION_ITEMS}",
            ids.len()
        ));
    }
    if ids.iter().any(|id| *id <= 0) {
        return Err(format!("{label} contains an invalid identifier"));
    }
    let unique: HashSet<i64> = ids.iter().copied().collect();
    if unique.len() != ids.len() {
        return Err(format!("{label} contains duplicate identifiers"));
    }
    Ok(())
}

#[tauri::command]
pub async fn database_add_collection_items(
    database_url: String,
    collection_id: i64,
    media_ids: Vec<i64>,
    instances: State<'_, DbInstances>,
) -> Result<(), String> {
    if collection_id <= 0 {
        return Err("Collection identifier is invalid".to_string());
    }
    validate_bulk_ids(&media_ids, "Collection item batch")?;
    if media_ids.is_empty() {
        return Ok(());
    }

    let pool = sqlite_pool(&instances, &database_url).await?;
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| database_error("Failed to begin collection item transaction", error))?;
    let mut next_order = sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM collection_items WHERE collection_id = ?",
    )
    .bind(collection_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| database_error("Failed to resolve collection sort order", error))?;

    for media_id in media_ids {
        let result = sqlx::query(
            "INSERT OR IGNORE INTO collection_items (collection_id, media_id, sort_order) VALUES (?, ?, ?)",
        )
        .bind(collection_id)
        .bind(media_id)
        .bind(next_order)
        .execute(&mut *tx)
        .await
        .map_err(|error| database_error("Failed to add a collection item", error))?;
        if result.rows_affected() > 0 {
            next_order += 1;
        }
    }

    tx.commit()
        .await
        .map_err(|error| database_error("Failed to commit collection item transaction", error))
}

#[tauri::command]
pub async fn database_reorder_collection_items(
    database_url: String,
    collection_id: i64,
    media_ids: Vec<i64>,
    instances: State<'_, DbInstances>,
) -> Result<(), String> {
    if collection_id <= 0 {
        return Err("Collection identifier is invalid".to_string());
    }
    validate_bulk_ids(&media_ids, "Collection order")?;
    let pool = sqlite_pool(&instances, &database_url).await?;
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| database_error("Failed to begin collection reorder", error))?;

    for (sort_order, media_id) in media_ids.into_iter().enumerate() {
        let result = sqlx::query(
            "UPDATE collection_items SET sort_order = ? WHERE collection_id = ? AND media_id = ?",
        )
        .bind(sort_order as i64)
        .bind(collection_id)
        .bind(media_id)
        .execute(&mut *tx)
        .await
        .map_err(|error| database_error("Failed to reorder a collection item", error))?;
        if result.rows_affected() != 1 {
            return Err(format!(
                "Collection item {media_id} does not belong to collection {collection_id}"
            ));
        }
    }

    tx.commit()
        .await
        .map_err(|error| database_error("Failed to commit collection reorder", error))
}

#[tauri::command]
pub async fn database_reorder_award_categories(
    database_url: String,
    year: i64,
    category_ids: Vec<i64>,
    instances: State<'_, DbInstances>,
) -> Result<(), String> {
    if !(1..=9999).contains(&year) {
        return Err("Award year is invalid".to_string());
    }
    validate_bulk_ids(&category_ids, "Award category order")?;
    let pool = sqlite_pool(&instances, &database_url).await?;
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| database_error("Failed to begin award reorder", error))?;

    for (sort_order, category_id) in category_ids.into_iter().enumerate() {
        let result =
            sqlx::query("UPDATE award_categories SET sort_order = ? WHERE id = ? AND year = ?")
                .bind(sort_order as i64)
                .bind(category_id)
                .bind(year)
                .execute(&mut *tx)
                .await
                .map_err(|error| database_error("Failed to reorder an award category", error))?;
        if result.rows_affected() != 1 {
            return Err(format!(
                "Award category {category_id} does not belong to year {year}"
            ));
        }
    }

    tx.commit()
        .await
        .map_err(|error| database_error("Failed to commit award reorder", error))
}

#[tauri::command]
pub async fn database_reorder_backlog_items(
    database_url: String,
    status: String,
    item_ids: Vec<i64>,
    instances: State<'_, DbInstances>,
) -> Result<(), String> {
    if !matches!(status.as_str(), "planning" | "in_progress" | "unreleased") {
        return Err("Backlog status is invalid".to_string());
    }
    validate_bulk_ids(&item_ids, "Backlog order")?;
    let pool = sqlite_pool(&instances, &database_url).await?;
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| database_error("Failed to begin backlog reorder", error))?;

    for (sort_order, item_id) in item_ids.into_iter().enumerate() {
        let result =
            sqlx::query("UPDATE backlog_items SET sort_order = ? WHERE id = ? AND status = ?")
                .bind(sort_order as i64)
                .bind(item_id)
                .bind(&status)
                .execute(&mut *tx)
                .await
                .map_err(|error| database_error("Failed to reorder a backlog item", error))?;
        if result.rows_affected() != 1 {
            return Err(format!(
                "Backlog item {item_id} does not belong to status {status}"
            ));
        }
    }

    tx.commit()
        .await
        .map_err(|error| database_error("Failed to commit backlog reorder", error))
}

#[tauri::command]
pub async fn database_export_snapshot(
    database_url: String,
    instances: State<'_, DbInstances>,
) -> Result<BackupTables, String> {
    let pool = sqlite_pool(&instances, &database_url).await?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| database_error("Failed to begin backup snapshot", error))?;

    macro_rules! fetch_rows {
        ($row_type:ty, $sql:expr, $context:expr) => {
            sqlx::query_as::<_, $row_type>($sql)
                .fetch_all(&mut *tx)
                .await
                .map_err(|error| database_error($context, error))?
        };
    }

    let tables = BackupTables {
        entries: fetch_rows!(
            EntryRow,
            r#"SELECT id, name, genre, completion_date,
                      CAST(review_score AS REAL) AS review_score, description, notes,
                      year_completed, is_rewatch, own_local_copy, has_subtitles, is_platinum,
                      is_completed, is_early_access, early_access_version, image_url, entry_type,
                      platform, author, artist, director, actress, update_version, franchise, series
               FROM entries ORDER BY id"#,
            "Failed to export media entries"
        ),
        collections: fetch_rows!(
            CollectionRow,
            "SELECT id, name, description, created_date FROM collections ORDER BY id",
            "Failed to export collections"
        ),
        collection_eras: fetch_rows!(
            CollectionEraRow,
            "SELECT id, collection_id, name, color, sort_order, created_date FROM collection_eras ORDER BY id",
            "Failed to export collection eras"
        ),
        collection_items: fetch_rows!(
            CollectionItemRow,
            "SELECT id, collection_id, media_id, sort_order, era_id FROM collection_items ORDER BY id",
            "Failed to export collection items"
        ),
        award_years: fetch_rows!(
            AwardYearRow,
            "SELECT year, created_date FROM award_years ORDER BY year",
            "Failed to export award years"
        ),
        award_templates: fetch_rows!(
            AwardTemplateRow,
            "SELECT id, name, created_date FROM award_templates ORDER BY id",
            "Failed to export award templates"
        ),
        award_categories: fetch_rows!(
            AwardCategoryRow,
            "SELECT id, year, name, created_date, sort_order, template_id FROM award_categories ORDER BY id",
            "Failed to export award categories"
        ),
        award_winners: fetch_rows!(
            AwardWinnerRow,
            "SELECT category_id, media_id, selected_date FROM award_winners ORDER BY category_id",
            "Failed to export award winners"
        ),
        profiles: fetch_rows!(
            ProfileRow,
            "SELECT type, name, image_url, crop_data, track_avg_history FROM profiles ORDER BY type, name",
            "Failed to export profiles"
        ),
        hidden_profiles: fetch_rows!(
            HiddenProfileRow,
            "SELECT type, name, hidden_date FROM hidden_profiles ORDER BY type, name",
            "Failed to export hidden profiles"
        ),
        profile_avg_history: fetch_rows!(
            ProfileAvgHistoryRow,
            r#"SELECT type, name, captured_at,
                      CAST(average_score AS REAL) AS average_score,
                      rated_count, total_count, source
               FROM profile_avg_history ORDER BY type, name, captured_at"#,
            "Failed to export profile AVG history"
        ),
        backlog_items: fetch_rows!(
            BacklogItemRow,
            r#"SELECT id, name, entry_type, genre, image_url, status, added_date, sort_order, release_date
               FROM backlog_items ORDER BY id"#,
            "Failed to export backlog"
        ),
    };

    tx.commit()
        .await
        .map_err(|error| database_error("Failed to finish backup snapshot", error))?;
    Ok(tables)
}

fn entry_identity_key(entry: &EntryRow) -> Result<String, String> {
    let mut value = serde_json::to_value(entry)
        .map_err(|error| database_error("Failed to compare media identity", error))?;
    let Some(object) = value.as_object_mut() else {
        return Err("Failed to compare media identity".to_string());
    };
    object.remove("id");
    serde_json::to_string(object)
        .map_err(|error| database_error("Failed to compare media identity", error))
}

async fn next_autoincrement_id(
    tx: &mut Transaction<'_, Sqlite>,
    table_name: &str,
) -> Result<i64, String> {
    let sql = format!(
        "SELECT MAX(value) + 1 FROM (\
           SELECT COALESCE(MAX(id), 0) AS value FROM {table_name} \
           UNION ALL \
           SELECT COALESCE(MAX(seq), 0) AS value FROM sqlite_sequence WHERE name = ?\
         )"
    );
    sqlx::query_scalar::<_, i64>(&sql)
        .bind(table_name)
        .fetch_one(&mut **tx)
        .await
        .map_err(|error| {
            database_error(&format!("Failed to allocate an ID for {table_name}"), error)
        })
}

fn batch_size(column_count: usize) -> usize {
    (MAX_SQLITE_BIND_PARAMS / column_count).max(1)
}

fn count_mut<'a>(
    counts: &'a mut BTreeMap<String, TableImportCount>,
    table: &str,
) -> &'a mut TableImportCount {
    counts.entry(table.to_string()).or_default()
}

#[derive(Debug)]
struct PlannedEntry {
    target_id: i64,
    row: EntryRow,
}

#[derive(Debug)]
struct PlannedCollection {
    target_id: i64,
    row: CollectionRow,
}

#[derive(Debug)]
struct PlannedEra {
    target_id: i64,
    target_collection_id: i64,
    row: CollectionEraRow,
}

#[derive(Debug)]
struct PlannedCollectionItem {
    target_id: i64,
    target_collection_id: i64,
    target_media_id: i64,
    target_era_id: Option<i64>,
    sort_order: i64,
}

#[derive(Debug)]
struct PlannedTemplate {
    target_id: i64,
    row: AwardTemplateRow,
}

#[derive(Debug)]
struct PlannedCategory {
    target_id: i64,
    target_template_id: Option<i64>,
    row: AwardCategoryRow,
}

#[derive(Debug)]
struct PlannedWinner {
    target_category_id: i64,
    target_media_id: i64,
    selected_date: Option<String>,
}

#[derive(Debug)]
struct PlannedBacklogItem {
    target_id: i64,
    row: BacklogItemRow,
}

async fn insert_entries(
    tx: &mut Transaction<'_, Sqlite>,
    rows: &[PlannedEntry],
) -> Result<(), String> {
    for chunk in rows.chunks(batch_size(26)) {
        let mut query = QueryBuilder::<Sqlite>::new(
            r#"INSERT INTO entries (
               id, name, genre, completion_date, review_score, description, notes, year_completed,
               is_rewatch, own_local_copy, has_subtitles, is_platinum, is_completed, is_early_access,
               early_access_version, image_url, entry_type, platform, author, artist, director, actress,
               update_version, franchise, series
            ) "#,
        );
        query.push_values(chunk, |mut values, planned| {
            let row = &planned.row;
            values
                .push_bind(planned.target_id)
                .push_bind(&row.name)
                .push_bind(&row.genre)
                .push_bind(&row.completion_date)
                .push_bind(row.review_score)
                .push_bind(&row.description)
                .push_bind(&row.notes)
                .push_bind(row.year_completed)
                .push_bind(row.is_rewatch)
                .push_bind(row.own_local_copy)
                .push_bind(row.has_subtitles)
                .push_bind(row.is_platinum)
                .push_bind(row.is_completed)
                .push_bind(row.is_early_access)
                .push_bind(&row.early_access_version)
                .push_bind(&row.image_url)
                .push_bind(&row.entry_type)
                .push_bind(&row.platform)
                .push_bind(&row.author)
                .push_bind(&row.artist)
                .push_bind(&row.director)
                .push_bind(&row.actress)
                .push_bind(&row.update_version)
                .push_bind(&row.franchise)
                .push_bind(&row.series);
        });
        query
            .build()
            .execute(&mut **tx)
            .await
            .map_err(|error| database_error("Failed to import media entries", error))?;
    }
    Ok(())
}

async fn insert_collections(
    tx: &mut Transaction<'_, Sqlite>,
    rows: &[PlannedCollection],
) -> Result<(), String> {
    for chunk in rows.chunks(batch_size(4)) {
        let mut query = QueryBuilder::<Sqlite>::new(
            "INSERT INTO collections (id, name, description, created_date) ",
        );
        query.push_values(chunk, |mut values, planned| {
            values
                .push_bind(planned.target_id)
                .push_bind(&planned.row.name)
                .push_bind(&planned.row.description)
                .push_bind(&planned.row.created_date);
        });
        query
            .build()
            .execute(&mut **tx)
            .await
            .map_err(|error| database_error("Failed to import collections", error))?;
    }
    Ok(())
}

async fn insert_collection_eras(
    tx: &mut Transaction<'_, Sqlite>,
    rows: &[PlannedEra],
) -> Result<(), String> {
    for chunk in rows.chunks(batch_size(6)) {
        let mut query = QueryBuilder::<Sqlite>::new(
            "INSERT INTO collection_eras (id, collection_id, name, color, sort_order, created_date) ",
        );
        query.push_values(chunk, |mut values, planned| {
            values
                .push_bind(planned.target_id)
                .push_bind(planned.target_collection_id)
                .push_bind(&planned.row.name)
                .push_bind(&planned.row.color)
                .push_bind(planned.row.sort_order)
                .push_bind(&planned.row.created_date);
        });
        query
            .build()
            .execute(&mut **tx)
            .await
            .map_err(|error| database_error("Failed to import collection eras", error))?;
    }
    Ok(())
}

async fn insert_collection_items(
    tx: &mut Transaction<'_, Sqlite>,
    rows: &[PlannedCollectionItem],
) -> Result<(), String> {
    for chunk in rows.chunks(batch_size(5)) {
        let mut query = QueryBuilder::<Sqlite>::new(
            "INSERT INTO collection_items (id, collection_id, media_id, sort_order, era_id) ",
        );
        query.push_values(chunk, |mut values, planned| {
            values
                .push_bind(planned.target_id)
                .push_bind(planned.target_collection_id)
                .push_bind(planned.target_media_id)
                .push_bind(planned.sort_order)
                .push_bind(planned.target_era_id);
        });
        query
            .build()
            .execute(&mut **tx)
            .await
            .map_err(|error| database_error("Failed to import collection items", error))?;
    }
    Ok(())
}

async fn insert_award_years(
    tx: &mut Transaction<'_, Sqlite>,
    rows: &[AwardYearRow],
) -> Result<(), String> {
    for chunk in rows.chunks(batch_size(2)) {
        let mut query =
            QueryBuilder::<Sqlite>::new("INSERT INTO award_years (year, created_date) ");
        query.push_values(chunk, |mut values, row| {
            values.push_bind(row.year).push_bind(&row.created_date);
        });
        query.push(" ON CONFLICT(year) DO NOTHING");
        query
            .build()
            .execute(&mut **tx)
            .await
            .map_err(|error| database_error("Failed to import award years", error))?;
    }
    Ok(())
}

async fn insert_award_templates(
    tx: &mut Transaction<'_, Sqlite>,
    rows: &[PlannedTemplate],
) -> Result<(), String> {
    for chunk in rows.chunks(batch_size(3)) {
        let mut query =
            QueryBuilder::<Sqlite>::new("INSERT INTO award_templates (id, name, created_date) ");
        query.push_values(chunk, |mut values, planned| {
            values
                .push_bind(planned.target_id)
                .push_bind(&planned.row.name)
                .push_bind(&planned.row.created_date);
        });
        query
            .build()
            .execute(&mut **tx)
            .await
            .map_err(|error| database_error("Failed to import award templates", error))?;
    }
    Ok(())
}

async fn insert_award_categories(
    tx: &mut Transaction<'_, Sqlite>,
    rows: &[PlannedCategory],
) -> Result<(), String> {
    for chunk in rows.chunks(batch_size(6)) {
        let mut query = QueryBuilder::<Sqlite>::new(
            "INSERT INTO award_categories (id, year, name, created_date, sort_order, template_id) ",
        );
        query.push_values(chunk, |mut values, planned| {
            values
                .push_bind(planned.target_id)
                .push_bind(planned.row.year)
                .push_bind(&planned.row.name)
                .push_bind(&planned.row.created_date)
                .push_bind(planned.row.sort_order)
                .push_bind(planned.target_template_id);
        });
        query
            .build()
            .execute(&mut **tx)
            .await
            .map_err(|error| database_error("Failed to import award categories", error))?;
    }
    Ok(())
}

async fn insert_award_winners(
    tx: &mut Transaction<'_, Sqlite>,
    rows: &[PlannedWinner],
) -> Result<(), String> {
    for chunk in rows.chunks(batch_size(3)) {
        let mut query = QueryBuilder::<Sqlite>::new(
            "INSERT INTO award_winners (category_id, media_id, selected_date) ",
        );
        query.push_values(chunk, |mut values, planned| {
            values
                .push_bind(planned.target_category_id)
                .push_bind(planned.target_media_id)
                .push_bind(&planned.selected_date);
        });
        query
            .build()
            .execute(&mut **tx)
            .await
            .map_err(|error| database_error("Failed to import award winners", error))?;
    }
    Ok(())
}

async fn upsert_profiles(
    tx: &mut Transaction<'_, Sqlite>,
    rows: &[ProfileRow],
) -> Result<(), String> {
    for chunk in rows.chunks(batch_size(5)) {
        let mut query = QueryBuilder::<Sqlite>::new(
            "INSERT INTO profiles (type, name, image_url, crop_data, track_avg_history) ",
        );
        query.push_values(chunk, |mut values, row| {
            values
                .push_bind(&row.profile_type)
                .push_bind(&row.name)
                .push_bind(&row.image_url)
                .push_bind(&row.crop_data)
                .push_bind(row.track_avg_history);
        });
        query.push(
            " ON CONFLICT(type, name) DO UPDATE SET \
             image_url = excluded.image_url, crop_data = excluded.crop_data, \
             track_avg_history = excluded.track_avg_history",
        );
        query
            .build()
            .execute(&mut **tx)
            .await
            .map_err(|error| database_error("Failed to import profiles", error))?;
    }
    Ok(())
}

async fn insert_hidden_profiles(
    tx: &mut Transaction<'_, Sqlite>,
    rows: &[HiddenProfileRow],
) -> Result<(), String> {
    for chunk in rows.chunks(batch_size(3)) {
        let mut query =
            QueryBuilder::<Sqlite>::new("INSERT INTO hidden_profiles (type, name, hidden_date) ");
        query.push_values(chunk, |mut values, row| {
            values
                .push_bind(&row.profile_type)
                .push_bind(&row.name)
                .push_bind(&row.hidden_date);
        });
        query.push(" ON CONFLICT(type, name) DO NOTHING");
        query
            .build()
            .execute(&mut **tx)
            .await
            .map_err(|error| database_error("Failed to import hidden profiles", error))?;
    }
    Ok(())
}

async fn insert_profile_history(
    tx: &mut Transaction<'_, Sqlite>,
    rows: &[ProfileAvgHistoryRow],
) -> Result<(), String> {
    for chunk in rows.chunks(batch_size(7)) {
        let mut query = QueryBuilder::<Sqlite>::new(
            r#"INSERT INTO profile_avg_history
               (type, name, captured_at, average_score, rated_count, total_count, source) "#,
        );
        query.push_values(chunk, |mut values, row| {
            values
                .push_bind(&row.profile_type)
                .push_bind(&row.name)
                .push_bind(&row.captured_at)
                .push_bind(row.average_score)
                .push_bind(row.rated_count)
                .push_bind(row.total_count)
                .push_bind(&row.source);
        });
        query.push(" ON CONFLICT(type, name, captured_at) DO NOTHING");
        query
            .build()
            .execute(&mut **tx)
            .await
            .map_err(|error| database_error("Failed to import profile AVG history", error))?;
    }
    Ok(())
}

async fn insert_backlog_items(
    tx: &mut Transaction<'_, Sqlite>,
    rows: &[PlannedBacklogItem],
) -> Result<(), String> {
    for chunk in rows.chunks(batch_size(9)) {
        let mut query = QueryBuilder::<Sqlite>::new(
            r#"INSERT INTO backlog_items
               (id, name, entry_type, genre, image_url, status, added_date, sort_order, release_date) "#,
        );
        query.push_values(chunk, |mut values, planned| {
            let row = &planned.row;
            values
                .push_bind(planned.target_id)
                .push_bind(&row.name)
                .push_bind(&row.entry_type)
                .push_bind(&row.genre)
                .push_bind(&row.image_url)
                .push_bind(&row.status)
                .push_bind(&row.added_date)
                .push_bind(row.sort_order)
                .push_bind(&row.release_date);
        });
        query
            .build()
            .execute(&mut **tx)
            .await
            .map_err(|error| database_error("Failed to import backlog items", error))?;
    }
    Ok(())
}

fn require_mapping(
    mappings: &HashMap<i64, i64>,
    source_id: i64,
    relationship: &str,
) -> Result<i64, String> {
    mappings.get(&source_id).copied().ok_or_else(|| {
        format!("Backup contains an invalid {relationship} reference to ID {source_id}")
    })
}

fn insert_source_mapping(
    mappings: &mut HashMap<i64, i64>,
    source_id: i64,
    target_id: i64,
    table: &str,
) -> Result<(), String> {
    if source_id <= 0 {
        return Err(format!(
            "Backup contains an invalid {table} ID: {source_id}"
        ));
    }
    if mappings.insert(source_id, target_id).is_some() {
        return Err(format!("Backup contains duplicate {table} ID {source_id}"));
    }
    Ok(())
}

async fn import_backup_transaction(
    tx: &mut Transaction<'_, Sqlite>,
    tables: BackupTables,
) -> Result<DatabaseImportResult, String> {
    let mut counts = BTreeMap::<String, TableImportCount>::new();

    let existing_entries = sqlx::query_as::<_, EntryRow>(
        r#"SELECT id, name, genre, completion_date,
                  CAST(review_score AS REAL) AS review_score, description, notes,
                  year_completed, is_rewatch, own_local_copy, has_subtitles, is_platinum,
                  is_completed, is_early_access, early_access_version, image_url, entry_type,
                  platform, author, artist, director, actress, update_version, franchise, series
           FROM entries ORDER BY id"#,
    )
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| database_error("Failed to inspect existing media entries", error))?;
    let preserve_media_ids = existing_entries.is_empty();
    let mut media_matches = HashMap::<String, VecDeque<i64>>::new();
    for entry in &existing_entries {
        media_matches
            .entry(entry_identity_key(entry)?)
            .or_default()
            .push_back(entry.id);
    }
    let mut next_media_id = next_autoincrement_id(tx, "entries").await?;
    let mut media_id_map = HashMap::<i64, i64>::new();
    let mut planned_entries = Vec::new();
    for entry in tables.entries {
        if entry.name.trim().is_empty() {
            return Err(format!("Media entry {} has no name", entry.id));
        }
        let source_id = entry.id;
        let identity = entry_identity_key(&entry)?;
        let existing_id = media_matches
            .get_mut(&identity)
            .and_then(VecDeque::pop_front);
        if let Some(target_id) = existing_id {
            insert_source_mapping(&mut media_id_map, source_id, target_id, "media entry")?;
            count_mut(&mut counts, "entries").reused += 1;
            continue;
        }
        let target_id = if preserve_media_ids {
            source_id
        } else {
            let allocated = next_media_id;
            next_media_id += 1;
            allocated
        };
        insert_source_mapping(&mut media_id_map, source_id, target_id, "media entry")?;
        planned_entries.push(PlannedEntry {
            target_id,
            row: entry,
        });
        count_mut(&mut counts, "entries").inserted += 1;
    }

    let existing_collections = sqlx::query_as::<_, CollectionRow>(
        "SELECT id, name, description, created_date FROM collections ORDER BY id",
    )
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| database_error("Failed to inspect existing collections", error))?;
    let mut collections_by_name = existing_collections
        .into_iter()
        .map(|row| (row.name, row.id))
        .collect::<HashMap<_, _>>();
    let mut next_collection_id = next_autoincrement_id(tx, "collections").await?;
    let mut collection_id_map = HashMap::<i64, i64>::new();
    let mut planned_collections = Vec::new();
    for collection in tables.collections {
        if collection.name.trim().is_empty() {
            return Err(format!("Collection {} has no name", collection.id));
        }
        let source_id = collection.id;
        if let Some(target_id) = collections_by_name.get(&collection.name).copied() {
            insert_source_mapping(&mut collection_id_map, source_id, target_id, "collection")?;
            count_mut(&mut counts, "collections").reused += 1;
        } else {
            let target_id = next_collection_id;
            next_collection_id += 1;
            collections_by_name.insert(collection.name.clone(), target_id);
            insert_source_mapping(&mut collection_id_map, source_id, target_id, "collection")?;
            planned_collections.push(PlannedCollection {
                target_id,
                row: collection,
            });
            count_mut(&mut counts, "collections").inserted += 1;
        }
    }

    let existing_eras = sqlx::query_as::<_, CollectionEraRow>(
        "SELECT id, collection_id, name, color, sort_order, created_date FROM collection_eras ORDER BY id",
    )
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| database_error("Failed to inspect existing collection eras", error))?;
    let mut eras_by_key = HashMap::<(i64, String), i64>::new();
    for era in existing_eras {
        eras_by_key
            .entry((era.collection_id, era.name))
            .or_insert(era.id);
    }
    let mut next_era_id = next_autoincrement_id(tx, "collection_eras").await?;
    let mut era_id_map = HashMap::<i64, i64>::new();
    let mut planned_eras = Vec::new();
    for era in tables.collection_eras {
        let target_collection_id =
            require_mapping(&collection_id_map, era.collection_id, "collection era")?;
        let key = (target_collection_id, era.name.clone());
        let source_id = era.id;
        if let Some(target_id) = eras_by_key.get(&key).copied() {
            insert_source_mapping(&mut era_id_map, source_id, target_id, "collection era")?;
            count_mut(&mut counts, "collection_eras").reused += 1;
        } else {
            let target_id = next_era_id;
            next_era_id += 1;
            eras_by_key.insert(key, target_id);
            insert_source_mapping(&mut era_id_map, source_id, target_id, "collection era")?;
            planned_eras.push(PlannedEra {
                target_id,
                target_collection_id,
                row: era,
            });
            count_mut(&mut counts, "collection_eras").inserted += 1;
        }
    }

    let existing_item_keys = sqlx::query("SELECT collection_id, media_id FROM collection_items")
        .fetch_all(&mut **tx)
        .await
        .map_err(|error| database_error("Failed to inspect existing collection items", error))?
        .into_iter()
        .map(|row| (row.get::<i64, _>(0), row.get::<i64, _>(1)))
        .collect::<HashSet<_>>();
    let mut item_keys = existing_item_keys;
    let mut seen_item_ids = HashSet::new();
    let mut next_item_id = next_autoincrement_id(tx, "collection_items").await?;
    let mut planned_items = Vec::new();
    for item in tables.collection_items {
        if item.id <= 0 || !seen_item_ids.insert(item.id) {
            return Err(format!(
                "Backup contains an invalid or duplicate collection item ID {}",
                item.id
            ));
        }
        let target_collection_id = require_mapping(
            &collection_id_map,
            item.collection_id,
            "collection item collection",
        )?;
        let target_media_id =
            require_mapping(&media_id_map, item.media_id, "collection item media")?;
        let key = (target_collection_id, target_media_id);
        if !item_keys.insert(key) {
            count_mut(&mut counts, "collection_items").reused += 1;
            continue;
        }
        let target_era_id = match item.era_id {
            Some(source_era_id) => Some(require_mapping(
                &era_id_map,
                source_era_id,
                "collection item era",
            )?),
            None => None,
        };
        let target_id = next_item_id;
        next_item_id += 1;
        planned_items.push(PlannedCollectionItem {
            target_id,
            target_collection_id,
            target_media_id,
            target_era_id,
            sort_order: item.sort_order,
        });
        count_mut(&mut counts, "collection_items").inserted += 1;
    }

    let mut award_years = sqlx::query_scalar::<_, i64>("SELECT year FROM award_years")
        .fetch_all(&mut **tx)
        .await
        .map_err(|error| database_error("Failed to inspect existing award years", error))?
        .into_iter()
        .collect::<HashSet<_>>();
    let mut planned_years = Vec::new();
    for year in tables.award_years {
        if award_years.insert(year.year) {
            planned_years.push(year);
            count_mut(&mut counts, "award_years").inserted += 1;
        } else {
            count_mut(&mut counts, "award_years").reused += 1;
        }
    }

    let existing_templates = sqlx::query_as::<_, AwardTemplateRow>(
        "SELECT id, name, created_date FROM award_templates ORDER BY id",
    )
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| database_error("Failed to inspect existing award templates", error))?;
    let mut templates_by_name = existing_templates
        .into_iter()
        .map(|row| (row.name, row.id))
        .collect::<HashMap<_, _>>();
    let mut next_template_id = next_autoincrement_id(tx, "award_templates").await?;
    let mut template_id_map = HashMap::<i64, i64>::new();
    let mut planned_templates = Vec::new();
    for template in tables.award_templates {
        let source_id = template.id;
        if let Some(target_id) = templates_by_name.get(&template.name).copied() {
            insert_source_mapping(&mut template_id_map, source_id, target_id, "award template")?;
            count_mut(&mut counts, "award_templates").reused += 1;
        } else {
            let target_id = next_template_id;
            next_template_id += 1;
            templates_by_name.insert(template.name.clone(), target_id);
            insert_source_mapping(&mut template_id_map, source_id, target_id, "award template")?;
            planned_templates.push(PlannedTemplate {
                target_id,
                row: template,
            });
            count_mut(&mut counts, "award_templates").inserted += 1;
        }
    }

    let existing_categories = sqlx::query_as::<_, AwardCategoryRow>(
        "SELECT id, year, name, created_date, sort_order, template_id FROM award_categories ORDER BY id",
    )
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| database_error("Failed to inspect existing award categories", error))?;
    let mut categories_by_key = HashMap::<(String, i64), i64>::new();
    let mut categories_by_template = HashMap::<(i64, i64), i64>::new();
    for category in existing_categories {
        categories_by_key
            .entry((category.name.clone(), category.year))
            .or_insert(category.id);
        if let Some(template_id) = category.template_id {
            categories_by_template
                .entry((category.year, template_id))
                .or_insert(category.id);
        }
    }
    let mut next_category_id = next_autoincrement_id(tx, "award_categories").await?;
    let mut category_id_map = HashMap::<i64, i64>::new();
    let mut planned_categories = Vec::new();
    for category in tables.award_categories {
        let source_id = category.id;
        let key = (category.name.clone(), category.year);
        if let Some(target_id) = categories_by_key.get(&key).copied() {
            insert_source_mapping(&mut category_id_map, source_id, target_id, "award category")?;
            count_mut(&mut counts, "award_categories").reused += 1;
            continue;
        }
        let target_template_id = match category.template_id {
            Some(source_template_id) => Some(require_mapping(
                &template_id_map,
                source_template_id,
                "award category template",
            )?),
            None => None,
        };
        if let Some(conflict_id) = target_template_id
            .and_then(|template_id| categories_by_template.get(&(category.year, template_id)))
        {
            return Err(format!(
                "Award category '{}' conflicts with existing category ID {} for the same year and template",
                category.name, conflict_id
            ));
        }
        let target_id = next_category_id;
        next_category_id += 1;
        categories_by_key.insert(key, target_id);
        if let Some(template_id) = target_template_id {
            categories_by_template.insert((category.year, template_id), target_id);
        }
        insert_source_mapping(&mut category_id_map, source_id, target_id, "award category")?;
        award_years.insert(category.year);
        planned_categories.push(PlannedCategory {
            target_id,
            target_template_id,
            row: category,
        });
        count_mut(&mut counts, "award_categories").inserted += 1;
    }

    let mut winner_categories =
        sqlx::query_scalar::<_, i64>("SELECT category_id FROM award_winners")
            .fetch_all(&mut **tx)
            .await
            .map_err(|error| database_error("Failed to inspect existing award winners", error))?
            .into_iter()
            .collect::<HashSet<_>>();
    let mut planned_winners = Vec::new();
    for winner in tables.award_winners {
        let target_category_id = require_mapping(
            &category_id_map,
            winner.category_id,
            "award winner category",
        )?;
        let target_media_id =
            require_mapping(&media_id_map, winner.media_id, "award winner media")?;
        if winner_categories.insert(target_category_id) {
            planned_winners.push(PlannedWinner {
                target_category_id,
                target_media_id,
                selected_date: winner.selected_date,
            });
            count_mut(&mut counts, "award_winners").inserted += 1;
        } else {
            count_mut(&mut counts, "award_winners").reused += 1;
        }
    }

    let existing_profiles = sqlx::query_as::<_, ProfileRow>(
        "SELECT type, name, image_url, crop_data, track_avg_history FROM profiles",
    )
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| database_error("Failed to inspect existing profiles", error))?;
    let mut profiles_by_key = existing_profiles
        .into_iter()
        .map(|row| ((row.profile_type.clone(), row.name.clone()), row))
        .collect::<HashMap<_, _>>();
    let mut seen_profile_keys = HashSet::new();
    let mut planned_profiles = Vec::new();
    for profile in tables.profiles {
        let key = (profile.profile_type.clone(), profile.name.clone());
        if !seen_profile_keys.insert(key.clone()) {
            return Err(format!(
                "Backup contains duplicate profile '{}:{}'",
                profile.profile_type, profile.name
            ));
        }
        if profile.image_url.is_empty() && profile.track_avg_history != 1 {
            count_mut(&mut counts, "profiles").reused += 1;
            continue;
        }
        match profiles_by_key.get(&key) {
            None => {
                profiles_by_key.insert(key, profile.clone());
                planned_profiles.push(profile);
                count_mut(&mut counts, "profiles").inserted += 1;
            }
            Some(existing) => {
                let merged = ProfileRow {
                    profile_type: profile.profile_type,
                    name: profile.name,
                    image_url: if profile.image_url.is_empty() {
                        existing.image_url.clone()
                    } else {
                        profile.image_url.clone()
                    },
                    crop_data: if profile.image_url.is_empty() {
                        existing.crop_data.clone()
                    } else {
                        profile.crop_data
                    },
                    track_avg_history: if profile.track_avg_history == 1 {
                        1
                    } else {
                        existing.track_avg_history
                    },
                };
                if merged.image_url != existing.image_url
                    || merged.crop_data != existing.crop_data
                    || merged.track_avg_history != existing.track_avg_history
                {
                    profiles_by_key.insert(key, merged.clone());
                    planned_profiles.push(merged);
                    count_mut(&mut counts, "profiles").updated += 1;
                } else {
                    count_mut(&mut counts, "profiles").reused += 1;
                }
            }
        }
    }

    let mut hidden_keys = sqlx::query("SELECT type, name FROM hidden_profiles")
        .fetch_all(&mut **tx)
        .await
        .map_err(|error| database_error("Failed to inspect hidden profiles", error))?
        .into_iter()
        .map(|row| (row.get::<String, _>(0), row.get::<String, _>(1)))
        .collect::<HashSet<_>>();
    let mut planned_hidden = Vec::new();
    for hidden in tables.hidden_profiles {
        let key = (hidden.profile_type.clone(), hidden.name.clone());
        if hidden_keys.insert(key) {
            planned_hidden.push(hidden);
            count_mut(&mut counts, "hidden_profiles").inserted += 1;
        } else {
            count_mut(&mut counts, "hidden_profiles").reused += 1;
        }
    }

    let mut history_keys = sqlx::query("SELECT type, name, captured_at FROM profile_avg_history")
        .fetch_all(&mut **tx)
        .await
        .map_err(|error| database_error("Failed to inspect profile history", error))?
        .into_iter()
        .map(|row| {
            (
                row.get::<String, _>(0),
                row.get::<String, _>(1),
                row.get::<String, _>(2),
            )
        })
        .collect::<HashSet<_>>();
    let mut planned_history = Vec::new();
    for point in tables.profile_avg_history {
        let key = (
            point.profile_type.clone(),
            point.name.clone(),
            point.captured_at.clone(),
        );
        if history_keys.insert(key) {
            planned_history.push(point);
            count_mut(&mut counts, "profile_avg_history").inserted += 1;
        } else {
            count_mut(&mut counts, "profile_avg_history").reused += 1;
        }
    }

    let mut backlog_keys = sqlx::query("SELECT name, entry_type FROM backlog_items")
        .fetch_all(&mut **tx)
        .await
        .map_err(|error| database_error("Failed to inspect existing backlog", error))?
        .into_iter()
        .map(|row| (row.get::<String, _>(0), row.get::<String, _>(1)))
        .collect::<HashSet<_>>();
    let mut next_backlog_id = next_autoincrement_id(tx, "backlog_items").await?;
    let mut seen_backlog_ids = HashSet::new();
    let mut planned_backlog = Vec::new();
    for item in tables.backlog_items {
        if item.id <= 0 || !seen_backlog_ids.insert(item.id) {
            return Err(format!(
                "Backup contains an invalid or duplicate backlog ID {}",
                item.id
            ));
        }
        let key = (item.name.clone(), item.entry_type.clone());
        if backlog_keys.insert(key) {
            let target_id = next_backlog_id;
            next_backlog_id += 1;
            planned_backlog.push(PlannedBacklogItem {
                target_id,
                row: item,
            });
            count_mut(&mut counts, "backlog_items").inserted += 1;
        } else {
            count_mut(&mut counts, "backlog_items").reused += 1;
        }
    }

    insert_entries(tx, &planned_entries).await?;
    insert_collections(tx, &planned_collections).await?;
    insert_collection_eras(tx, &planned_eras).await?;
    insert_collection_items(tx, &planned_items).await?;
    insert_award_years(tx, &planned_years).await?;
    insert_award_templates(tx, &planned_templates).await?;
    insert_award_categories(tx, &planned_categories).await?;
    insert_award_winners(tx, &planned_winners).await?;
    upsert_profiles(tx, &planned_profiles).await?;
    insert_hidden_profiles(tx, &planned_hidden).await?;
    insert_profile_history(tx, &planned_history).await?;
    insert_backlog_items(tx, &planned_backlog).await?;
    // Entry INSERT triggers update FTS incrementally. Rebuild once at the end
    // as an integrity boundary for large/legacy imports and future raw writers.
    execute_schema_sql(
        tx,
        "INSERT INTO entries_fts(entries_fts) VALUES('rebuild')",
        "Failed to synchronize the media search index after import",
    )
    .await?;

    Ok(DatabaseImportResult {
        table_counts: counts,
    })
}

#[tauri::command]
pub async fn database_import_backup(
    database_url: String,
    tables: BackupTables,
    instances: State<'_, DbInstances>,
) -> Result<DatabaseImportResult, String> {
    let pool = sqlite_pool(&instances, &database_url).await?;
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| database_error("Failed to begin database import", error))?;
    let result = match import_backup_transaction(&mut tx, tables).await {
        Ok(result) => result,
        Err(error) => {
            return match tx.rollback().await {
                Ok(()) => Err(error),
                Err(rollback_error) => Err(format!(
                    "{error}; import rollback also failed: {rollback_error}"
                )),
            };
        }
    };
    tx.commit()
        .await
        .map_err(|error| database_error("Failed to commit database import", error))?;
    // Bulk imports change row distributions significantly; refresh planner
    // statistics without failing the import itself.
    let _ = sqlx::query("PRAGMA optimize").execute(&pool).await;
    Ok(result)
}
