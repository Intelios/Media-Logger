import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { readFile } from '@tauri-apps/plugin-fs';

// Helper to cache Object URLs so we don't leak memory creating duplicates
const urlCache = new Map<string, string>();

export async function getImageUrl(dbPath: string | null): Promise<string> {
  const DEFAULT_IMAGE = "https://via.placeholder.com/300x150.png?text=No+Image";
  
  if (!dbPath) return DEFAULT_IMAGE;
  if (dbPath.startsWith('http')) return dbPath;

  // Return cached URL if we already loaded this image
  if (urlCache.has(dbPath)) {
    return urlCache.get(dbPath)!;
  }

  try {
    const appDataDirPath = await appLocalDataDir();
    // Construct the full path
    const fullPath = await join(appDataDirPath, 'assets', dbPath);
    
    // 1. Read the file explicitly using the FS plugin
    // This uses the "fs:scope" permission we configured
    const fileBytes = await readFile(fullPath);
    
    // 2. Determine mime type based on extension
    const ext = dbPath.split('.').pop()?.toLowerCase();
    let mime = 'image/jpeg';
    if (ext === 'png') mime = 'image/png';
    if (ext === 'webp') mime = 'image/webp';
    if (ext === 'gif') mime = 'image/gif';

    // 3. Create a Blob and an Object URL
    const blob = new Blob([fileBytes], { type: mime });
    const objectUrl = URL.createObjectURL(blob);
    
    // Cache it
    urlCache.set(dbPath, objectUrl);
    
    console.log(`[Image Success] Loaded blob for: ${dbPath}`);
    return objectUrl;

  } catch (e) {
    console.error(`[Image Failed] Could not read file: ${dbPath}`, e);
    return DEFAULT_IMAGE;
  }
}