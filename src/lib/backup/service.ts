import { invoke } from '@tauri-apps/api/core';
import { dbService } from '../db';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  createEmptyTableCounts,
  createFailedImportResult,
  type BackupEnvelopeV2,
  type BackupTables,
  type ImportResult,
  type ImportTableCounts,
} from './types';
import { parseAndValidateBackup } from './validation';

interface NativeImportResult {
  tableCounts: Partial<ImportTableCounts>;
}

export async function exportAllData(): Promise<BackupEnvelopeV2> {
  const db = await dbService.connect();
  const tables = await invoke<BackupTables>('database_export_snapshot', {
    databaseUrl: db.path,
  });
  return {
    format: BACKUP_FORMAT,
    format_version: BACKUP_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    tables,
  };
}

export async function exportToFile(): Promise<string> {
  return JSON.stringify(await exportAllData(), null, 2);
}

export async function importFromFile(fileContent: string): Promise<ImportResult> {
  let tables: BackupTables;
  try {
    // Deliberately complete parsing and validation before connect() can run a
    // migration or any import write can begin.
    tables = parseAndValidateBackup(fileContent);
  } catch (error) {
    return createFailedImportResult(error);
  }

  try {
    const db = await dbService.connect();
    const nativeResult = await invoke<NativeImportResult>('database_import_backup', {
      databaseUrl: db.path,
      tables,
    });
    const tableCounts = createEmptyTableCounts();
    for (const [table, count] of Object.entries(nativeResult.tableCounts)) {
      if (table in tableCounts && count) {
        tableCounts[table as keyof ImportTableCounts] = count;
      }
    }
    dbService.notifyExternalMutation();
    return {
      success: true,
      tableCounts,
      assetsRestored: 0,
      warnings: [],
      errors: [],
    };
  } catch (error) {
    return createFailedImportResult(error);
  }
}

export async function getDataStats(): Promise<{
  mediaCount: number;
  collectionCount: number;
  awardCount: number;
}> {
  const db = await dbService.connect();
  const [mediaResult, collectionResult, awardResult] = await Promise.all([
    db.select<{ count: number }[]>('SELECT COUNT(*) as count FROM entries'),
    db.select<{ count: number }[]>('SELECT COUNT(*) as count FROM collections'),
    db.select<{ count: number }[]>('SELECT COUNT(*) as count FROM award_categories'),
  ]);
  return {
    mediaCount: mediaResult[0].count,
    collectionCount: collectionResult[0].count,
    awardCount: awardResult[0].count,
  };
}
