import Database from '@tauri-apps/plugin-sql';
import { join } from '@tauri-apps/api/path';
import { exists, copyFile, stat, remove } from '@tauri-apps/plugin-fs';
import { getDataDirectory } from '../settings';
import { runMigrations } from './migrations';
import { notifyEntriesMutated } from './events';

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

let dbInstance: Database | null = null;
let currentDbPath: string = '';
let migrationsRun: boolean = false;
// Guards the one-time legacy file migration so concurrent connect() calls
// (multiple components mounting at once) only migrate once.
const legacyMigration: Map<string, Promise<void>> = new Map();
// In-flight connect() promise so concurrent callers share one Database.load
// + runMigrations() instead of racing. Cleared once settled so later calls
// still re-check the data directory (custom data dir can change at runtime).
let connectPromise: Promise<Database> | null = null;

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
async function migrateLegacyDatabase(dataDir: string): Promise<void> {
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

export async function connect(): Promise<Database> {
  if (connectPromise) return connectPromise;
  connectPromise = doConnect().finally(() => {
    connectPromise = null;
  });
  return connectPromise;
}

async function doConnect(): Promise<Database> {
  // Get the current data directory
  const dataDir = await getDataDirectory();

  // Run the one-time legacy migration (guarded per data directory). If it fails,
  // fall back to opening the legacy file directly so the user never loses access.
  let useLegacyFallback = false;
  if (!legacyMigration.has(dataDir)) {
    legacyMigration.set(dataDir, migrateLegacyDatabase(dataDir));
  }
  try {
    await legacyMigration.get(dataDir);
  } catch {
    useLegacyFallback = true;
  }

  const dbFilename = useLegacyFallback ? LEGACY_DB_FILENAME : DB_FILENAME;
  const dbPath = await join(dataDir, dbFilename);

  // If already connected to the same path, reuse connection
  if (dbInstance && currentDbPath === dbPath) {
    return dbInstance;
  }

  // Close existing connection if switching paths. The distinct-values and
  // profile-key caches were built from the old database, so flush them via
  // the mutation listeners before serving the new path.
  if (dbInstance && currentDbPath !== dbPath) {
    await dbInstance.close();
    dbInstance = null;
    migrationsRun = false;
    notifyEntriesMutated();
  }

  // Connect to the database
  console.log('[DB] Connecting to:', dbPath);
  const db = await Database.load(`sqlite:${dbPath}`);
  dbInstance = db;
  currentDbPath = dbPath;

  // Run migrations if not already done for this connection
  if (!migrationsRun) {
    await runMigrations(db);
    migrationsRun = true;
  }

  return db;
}

/**
 * Force reconnect to database (useful when settings change)
 */
export async function reconnect(): Promise<Database> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
    currentDbPath = '';
    // Cached distinct values / profile keys may describe the old database.
    notifyEntriesMutated();
  }
  return connect();
}
