import { invoke } from '@tauri-apps/api/core';
import type Database from '@tauri-apps/plugin-sql';

/**
 * Run every pending native migration for a freshly loaded database handle.
 * The native command owns one SQLite transaction per migration and updates
 * PRAGMA user_version in the same commit.
 */
export async function runMigrations(db: Database): Promise<void> {
  const applied = await invoke<number[]>('database_run_migrations', {
    databaseUrl: db.path,
  });
  if (applied.length > 0) {
    console.log('[DB] Applied schema migrations:', applied.join(', '));
  }
}
