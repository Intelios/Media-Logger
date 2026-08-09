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
// Mirrors the key owned by settings.ts. Reading this synchronous value lets us
// retain automatic path switching when Settings changes the directory, without
// repeating async Tauri path/filesystem work on every query.
const DATA_DIRECTORY_STORAGE_KEY = 'media-logger-data-directory';
// localStorage key set after a successful legacy migration; consumed once by the UI
// to show a one-time banner.
export const DB_MIGRATED_FLAG_KEY = 'media-logger-db-migrated';

let dbInstance: Database | null = null;
let currentDbPath: string = '';
// Path resolution crosses the Tauri boundary and probes the filesystem. Keep
// one resolved path for the live connection; reconnect() invalidates it when
// Settings changes the data directory.
let resolvedDatabasePath: Promise<string> | null = null;
let resolvedDatabasePathSetting: string | null | undefined;
// Guards the one-time legacy file migration so concurrent connect() calls
// (multiple components mounting at once) only migrate once.
const legacyMigration: Map<string, Promise<void>> = new Map();
// Concurrent callers resolving the same target path share one candidate load
// and migration. A candidate is never published until migration succeeds.
const connectPromises: Map<string, Promise<Database>> = new Map();

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
 * partial copy is removed and the error is propagated for a safe retry.
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
    // Roll back any partial copy. The legacy file remains dormant and untouched.
    console.error('[DB] Legacy database copy failed.', e);
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

async function resolveDatabasePathUncached(): Promise<string> {
  // Get the current data directory
  const dataDir = await getDataDirectory();

  // Run the one-time legacy migration (guarded per data directory). The legacy
  // file is never opened: a failed copy is surfaced so retry remains safe.
  if (!legacyMigration.has(dataDir)) {
    const migration = migrateLegacyDatabase(dataDir).catch((error) => {
      legacyMigration.delete(dataDir);
      throw error;
    });
    legacyMigration.set(dataDir, migration);
  }
  await legacyMigration.get(dataDir);

  return join(dataDir, DB_FILENAME);
}

function resolveDatabasePath(): Promise<string> {
  const configuredDirectory = localStorage.getItem(DATA_DIRECTORY_STORAGE_KEY);
  if (
    resolvedDatabasePath &&
    configuredDirectory === resolvedDatabasePathSetting
  ) {
    return resolvedDatabasePath;
  }

  const pending = resolveDatabasePathUncached();
  resolvedDatabasePath = pending;
  resolvedDatabasePathSetting = configuredDirectory;
  void pending.catch(() => {
    if (resolvedDatabasePath === pending) {
      resolvedDatabasePath = null;
      resolvedDatabasePathSetting = undefined;
    }
  });
  return pending;
}

export async function connect(): Promise<Database> {
  const dbPath = await resolveDatabasePath();

  if (dbInstance && currentDbPath === dbPath) {
    return dbInstance;
  }

  const existingPromise = connectPromises.get(dbPath);
  if (existingPromise) return existingPromise;

  const promise = doConnect(dbPath).finally(() => {
    connectPromises.delete(dbPath);
  });
  connectPromises.set(dbPath, promise);
  return promise;
}

async function doConnect(dbPath: string): Promise<Database> {
  if (dbInstance && currentDbPath === dbPath) {
    return dbInstance;
  }

  // Close the previously published handle before switching paths. The new
  // handle below remains private until its migration has committed.
  if (dbInstance && currentDbPath !== dbPath) {
    await dbInstance.close(dbInstance.path);
    dbInstance = null;
    currentDbPath = '';
    notifyEntriesMutated();
  }

  console.log('[DB] Connecting to:', dbPath);
  const candidate = await Database.load(`sqlite:${dbPath}`);
  try {
    await runMigrations(candidate);
    // The long-lived connection asks SQLite to refresh planner statistics
    // (0x10002 = run ANALYZE without persisting schema changes). It is
    // bounded by SQLite itself and a failure must not make a healthy database
    // unusable on older runtimes.
    try {
      await candidate.execute('PRAGMA optimize=0x10002');
    } catch (optimizeError) {
      console.warn('[DB] PRAGMA optimize was unavailable:', optimizeError);
    }
  } catch (error) {
    try {
      await candidate.close(candidate.path);
    } catch (closeError) {
      console.error('[DB] Failed to close rejected database candidate:', closeError);
    }
    throw error;
  }

  dbInstance = candidate;
  currentDbPath = dbPath;
  return candidate;
}

/**
 * Force reconnect to database (useful when settings change)
 */
export async function reconnect(): Promise<Database> {
  resolvedDatabasePath = null;
  resolvedDatabasePathSetting = undefined;
  if (dbInstance) {
    await dbInstance.close(dbInstance.path);
    dbInstance = null;
    currentDbPath = '';
    // Cached distinct values / profile keys may describe the old database.
    notifyEntriesMutated();
  }
  return connect();
}
