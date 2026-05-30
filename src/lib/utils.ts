import { useEffect, useState } from 'react';
import { join } from '@tauri-apps/api/path';
import { readFile, writeFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { getDataDirectory } from './settings';
import defaultCoverImage from '../assets/cover-fallback.svg';

// Helper to share Object URLs while they are mounted and revoke them afterward.
const urlCache = new Map<string, { url: string; refs: number }>();
const pendingUrlLoads = new Map<string, Promise<string>>();
export const DEFAULT_COVER_IMAGE = defaultCoverImage;

export async function getImageUrl(dbPath: string | null): Promise<string> {
  if (!dbPath) return DEFAULT_COVER_IMAGE;
  if (dbPath.startsWith('http')) return dbPath;

  // Return cached URL if we already loaded this image
  const cached = urlCache.get(dbPath);
  if (cached) {
    cached.refs += 1;
    return cached.url;
  }

  const pendingUrl = pendingUrlLoads.get(dbPath);
  if (pendingUrl) {
    try {
      const objectUrl = await pendingUrl;
      const loaded = urlCache.get(dbPath);
      if (loaded) {
        loaded.refs += 1;
      }
      return objectUrl;
    } catch (e) {
      console.error(`[Image Failed] Could not read file: ${dbPath}`, e);
      return DEFAULT_COVER_IMAGE;
    }
  }

  try {
    const objectUrlPromise = (async () => {
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
      return URL.createObjectURL(blob);
    })();
    pendingUrlLoads.set(dbPath, objectUrlPromise);

    const objectUrl = await objectUrlPromise;

    // Cache it
    urlCache.set(dbPath, { url: objectUrl, refs: 1 });

    console.log(`[Image Success] Loaded blob for: ${dbPath}`);
    return objectUrl;

  } catch (e) {
    console.error(`[Image Failed] Could not read file: ${dbPath}`, e);
    return DEFAULT_COVER_IMAGE;
  } finally {
    pendingUrlLoads.delete(dbPath);
  }
}

export function releaseImageUrl(dbPath: string | null | undefined): void {
  if (!dbPath || dbPath.startsWith('http')) return;

  const cached = urlCache.get(dbPath);
  if (!cached) return;

  cached.refs -= 1;
  if (cached.refs <= 0) {
    URL.revokeObjectURL(cached.url);
    urlCache.delete(dbPath);
  }
}

export function useImageUrl(dbPath: string | null | undefined, fallback = DEFAULT_COVER_IMAGE): string {
  const [imageUrl, setImageUrl] = useState(fallback);

  useEffect(() => {
    if (!dbPath) {
      setImageUrl(fallback);
      return;
    }

    let cancelled = false;
    let acquired = false;
    setImageUrl(fallback);

    getImageUrl(dbPath).then((url) => {
      acquired = true;
      if (cancelled) {
        releaseImageUrl(dbPath);
        return;
      }

      setImageUrl(url);
    });

    return () => {
      cancelled = true;
      if (acquired) {
        releaseImageUrl(dbPath);
      }
    };
  }, [dbPath, fallback]);

  return imageUrl;
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
