import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useState } from 'react';
import { useImageServiceStatus } from './image-service';

/**
 * Colours extracted from a cover's own artwork by the native image service.
 *
 * Every palette comes back inside a fixed lightness band, so the three stops
 * can be dropped into a gradient anywhere in the app without checking whether
 * white type will survive on top of them.
 */
export interface CoverPalette {
  shadow: string;
  base: string;
  accent: string;
}

interface CoverPaletteEntry {
  imagePath: string;
  palette: CoverPalette | null;
}

/** One invoke per this many covers. A typical library is a single round trip. */
const BATCH_SIZE = 256;

/**
 * Process-wide, because a palette is a pure function of the cover file: the
 * same path always yields the same colours, so re-deriving one when a page
 * remounts would be wasted work. A `null` value is a remembered miss (no
 * artwork, unreadable file) and stops the path being requested again.
 */
const cache = new Map<string, CoverPalette | null>();
const inFlight = new Map<string, Promise<void>>();
let cachedGeneration: number | null = null;

/**
 * Cover paths are only valid within one data-directory generation, so a switch
 * drops everything rather than serving colours belonging to the old library.
 */
function ensureGeneration(generation: number | null): void {
  if (cachedGeneration === generation) return;
  cachedGeneration = generation;
  cache.clear();
  inFlight.clear();
}

function normalizePaths(paths: ReadonlyArray<string | null | undefined>): string[] {
  const unique = new Set<string>();
  for (const path of paths) {
    // Remote candidates (cover-art search results) never reach the native
    // service, so they can't be sampled.
    if (path && !/^https?:\/\//iu.test(path)) unique.add(path);
  }
  return [...unique].sort();
}

async function loadBatch(paths: string[]): Promise<void> {
  try {
    const entries = await invoke<CoverPaletteEntry[]>('cover_palettes', { imagePaths: paths });
    for (const entry of entries) cache.set(entry.imagePath, entry.palette);
  } catch (error) {
    console.error('[Cover Palette] Extraction failed:', error);
    // Remember the failure. Without this a browser-only `npm run dev` session,
    // where the command does not exist, re-requests on every single render.
    for (const path of paths) if (!cache.has(path)) cache.set(path, null);
  } finally {
    for (const path of paths) inFlight.delete(path);
  }
}

/**
 * Populate the cache for `paths`. Resolves to true when anything new landed, so
 * callers know whether a re-render is worth scheduling.
 */
export async function loadCoverPalettes(paths: string[]): Promise<boolean> {
  const pending: Promise<void>[] = [];
  const missing: string[] = [];

  for (const path of paths) {
    const existing = inFlight.get(path);
    if (existing) pending.push(existing);
    else if (!cache.has(path)) missing.push(path);
  }

  for (let offset = 0; offset < missing.length; offset += BATCH_SIZE) {
    const batch = missing.slice(offset, offset + BATCH_SIZE);
    const request = loadBatch(batch);
    for (const path of batch) inFlight.set(path, request);
    pending.push(request);
  }

  if (pending.length === 0) return false;
  await Promise.all(pending);
  return true;
}

export function getCoverPaletteSnapshot(path: string | null | undefined): CoverPalette | null {
  return (path && cache.get(path)) || null;
}

/**
 * Palettes for a list of cover paths, keyed by path. Missing entries simply
 * aren't in the map — a caller always needs a fallback for coverless items, so
 * "not extracted yet" and "no artwork" are deliberately the same state.
 */
export function useCoverPalettes(
  imagePaths: ReadonlyArray<string | null | undefined>,
): ReadonlyMap<string, CoverPalette> {
  const service = useImageServiceStatus();
  const configured = Boolean(service?.configured);
  const generation = service?.generation ?? null;
  const [revision, setRevision] = useState(0);

  // Keyed on the *contents* of the path list, not its identity: callers build
  // it from a fresh query result on every render and would otherwise re-fetch
  // forever.
  const requestKey = normalizePaths(imagePaths).join('\n');
  const paths = useMemo(() => (requestKey ? requestKey.split('\n') : []), [requestKey]);

  useEffect(() => {
    if (!configured || paths.length === 0) return;
    ensureGeneration(generation);
    let cancelled = false;
    void loadCoverPalettes(paths).then((changed) => {
      if (changed && !cancelled) setRevision((current) => current + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [configured, generation, paths]);

  return useMemo(() => {
    const resolved = new Map<string, CoverPalette>();
    for (const path of paths) {
      const palette = cache.get(path);
      if (palette) resolved.set(path, palette);
    }
    return resolved;
    // `revision` is the signal that the cache above changed under us.
  }, [paths, revision]);
}
