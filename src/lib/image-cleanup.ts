import { invoke } from '@tauri-apps/api/core';
import { getDataDirectory } from './settings';
import { dbService } from './db';

export interface OrphanedImage {
  name: string;
  sizeBytes: number;
  modifiedMs: number;
}

export interface ScanResult {
  orphans: OrphanedImage[];
  dataDir: string;
  scannedCount: number;
}

export interface TrashResult {
  trashed: string[];
  skipped: string[];
  failed: { name: string; error: string }[];
}

// Files modified more recently than this are never offered for cleanup:
// saveImage() writes the file before the DB row exists, so a very fresh
// file may belong to an in-flight save. The Rust side re-enforces this.
const MIN_AGE_MS = 5 * 60 * 1000;
const MIN_AGE_SECONDS = MIN_AGE_MS / 1000;

/**
 * Lists every file in <dataDir>/assets/images that no entry, backlog item,
 * or profile references. Throws (rather than over-reporting) if the DB or
 * the directory listing fails.
 */
export async function scanOrphanedImages(): Promise<ScanResult> {
  const dataDir = await getDataDirectory();
  const files = await invoke<OrphanedImage[]>('list_asset_images', { dataDir });
  const referenced = await dbService.getAllReferencedImagePaths();

  const now = Date.now();
  const orphans = files
    .filter(
      (file) =>
        !referenced.has(file.name.toLowerCase()) &&
        now - file.modifiedMs > MIN_AGE_MS
    )
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

  return { orphans, dataDir, scannedCount: files.length };
}

/**
 * Moves the given filenames from <dataDir>/assets/images to the OS Trash.
 * Re-verifies everything at call time: the data directory must still match
 * the one that was scanned, and the referenced set is recomputed fresh so
 * anything that became referenced since the scan is skipped, not trashed.
 */
export async function trashOrphanedImages(
  scanDataDir: string,
  filenames: string[]
): Promise<TrashResult> {
  const dataDir = await getDataDirectory();
  if (dataDir !== scanDataDir) {
    throw new Error('The data directory changed since the scan. Please scan again.');
  }

  // Throws on DB failure — never proceeds with a partial referenced set.
  const referenced = await dbService.getAllReferencedImagePaths();

  const nowReferenced = filenames.filter((name) =>
    referenced.has(name.toLowerCase())
  );
  const stillOrphaned = filenames.filter(
    (name) => !referenced.has(name.toLowerCase())
  );

  let result: TrashResult = { trashed: [], skipped: [], failed: [] };
  if (stillOrphaned.length > 0) {
    result = await invoke<TrashResult>('move_images_to_trash', {
      dataDir,
      filenames: stillOrphaned,
      referenced: [...referenced],
      minAgeSeconds: MIN_AGE_SECONDS,
    });
  }

  return { ...result, skipped: [...nowReferenced, ...result.skipped] };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 'B';
  for (const next of units) {
    if (value < 1024) break;
    value /= 1024;
    unit = next;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${unit}`;
}
