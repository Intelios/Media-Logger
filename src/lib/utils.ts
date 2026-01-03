import { join } from '@tauri-apps/api/path';
import { readFile, writeFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { getDataDirectory } from './settings';

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
    const dataDir = await getDataDirectory();
    // Construct the full path
    const fullPath = await join(dataDir, 'assets', dbPath);

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

export async function saveImage(sourcePath: string): Promise<string | null> {
  if (!sourcePath) return null;

  try {
    const dataDir = await getDataDirectory();
    const assetsDir = await join(dataDir, 'assets');
    const imagesDir = await join(assetsDir, 'images');

    // DEBUG LOG
    console.log("Saving image to:", imagesDir);

    if (!(await exists(imagesDir))) {
      await mkdir(imagesDir, { recursive: true });
    }

    const ext = sourcePath.split('.').pop() || 'png';
    const filename = `${crypto.randomUUID()}.${ext}`;
    const destinationPath = await join(imagesDir, filename);

    const fileData = await readFile(sourcePath);
    await writeFile(destinationPath, fileData);

    console.log("Image saved successfully to:", destinationPath);

    // Return the relative string for the database
    return `images/${filename}`;
  } catch (e) {
    console.error("Failed to save image:", e);
    return null;
  }
}