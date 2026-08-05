import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { readFile, writeFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { getDataDirectory } from './settings';
import defaultCoverImage from '../assets/cover-fallback.svg';

export type ImageVariant = 'thumbnail' | 'original';
export interface ImageLoadOptions {
  enabled?: boolean;
  variant?: ImageVariant;
}

export interface ImageLoadFailureDetail {
  path: string;
  operation: 'thumbnail' | 'read';
  error: string;
}

declare global {
  interface WindowEventMap {
    'image-load-failed': CustomEvent<ImageLoadFailureDetail>;
    'image-load-retry': CustomEvent<void>;
  }
}

interface QueueItem<T> {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
}

interface PendingUrlLoad {
  promise: Promise<string>;
  controller: AbortController;
  waiters: number;
}

const MAX_CONCURRENT_IMAGE_LOADS = 6;
let activeImageLoads = 0;
const imageLoadQueue: QueueItem<unknown>[] = [];

// Object URLs are shared while mounted. Thumbnail and original variants must
// never share a cache entry because they resolve to different underlying files.
const urlCache = new Map<string, { url: string; refs: number }>();
const pendingUrlLoads = new Map<string, PendingUrlLoad>();
const reportedFailures = new Set<string>();
const reportedFailureDetails = new Map<string, ImageLoadFailureDetail>();
export const DEFAULT_COVER_IMAGE = defaultCoverImage;

function imageCacheKey(dbPath: string, variant: ImageVariant): string {
  return `${variant}:${dbPath}`;
}

function abortError(): DOMException {
  return new DOMException('Image load cancelled', 'AbortError');
}

function pumpImageQueue(): void {
  while (activeImageLoads < MAX_CONCURRENT_IMAGE_LOADS && imageLoadQueue.length > 0) {
    const item = imageLoadQueue.shift();
    if (!item) return;
    if (item.signal?.aborted) {
      item.reject(abortError());
      continue;
    }

    activeImageLoads += 1;
    if (import.meta.env.DEV) {
      console.debug('[image-loader]', {
        active: activeImageLoads,
        queued: imageLoadQueue.length,
        limit: MAX_CONCURRENT_IMAGE_LOADS,
      });
    }
    void item.run()
      .then(item.resolve, item.reject)
      .finally(() => {
        activeImageLoads -= 1;
        pumpImageQueue();
      });
  }
}

function enqueueImageLoad<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    imageLoadQueue.push({ run, resolve, reject, signal } as QueueItem<unknown>);
    pumpImageQueue();
  });
}

function reportImageFailure(detail: ImageLoadFailureDetail): void {
  const failureKey = `${detail.operation}:${detail.path}:${detail.error}`;
  if (reportedFailures.has(failureKey)) return;
  reportedFailures.add(failureKey);
  reportedFailureDetails.set(failureKey, detail);
  console.error('[Image Load Failed]', detail);
  window.dispatchEvent(new CustomEvent('image-load-failed', { detail }));
}

export function retryFailedImages(): void {
  reportedFailures.clear();
  reportedFailureDetails.clear();
  window.dispatchEvent(new CustomEvent('image-load-retry'));
}

export function getReportedImageFailures(): ImageLoadFailureDetail[] {
  return [...reportedFailureDetails.values()];
}

export function resetThumbnailImageCache(): void {
  for (const [key, pending] of pendingUrlLoads) {
    if (key.startsWith('thumbnail:')) pending.controller.abort();
  }
  for (const [key, cached] of urlCache) {
    if (!key.startsWith('thumbnail:')) continue;
    URL.revokeObjectURL(cached.url);
    urlCache.delete(key);
  }
  retryFailedImages();
}

export function getImageLoaderDiagnostics(): { active: number; queued: number; limit: number } {
  return { active: activeImageLoads, queued: imageLoadQueue.length, limit: MAX_CONCURRENT_IMAGE_LOADS };
}

async function createLocalImageUrl(
  dbPath: string,
  variant: ImageVariant,
  signal: AbortSignal
): Promise<string> {
  const dataDir = await getDataDirectory();
  let fullPath = await join(dataDir, 'assets', dbPath);
  let mime = 'image/jpeg';
  let resolvedThumbnail = false;

  if (variant === 'thumbnail') {
    try {
      fullPath = await invoke<string>('ensure_cover_thumbnail', { dataDir, imagePath: dbPath });
      resolvedThumbnail = true;
    } catch (error) {
      reportImageFailure({ path: dbPath, operation: 'thumbnail', error: String(error) });
      // Thumbnail generation is an optimization. Continue with the original so
      // unusual formats still render rather than becoming broken covers.
    }
  }

  if (!resolvedThumbnail) {
    const ext = dbPath.split('.').pop()?.toLowerCase();
    if (ext === 'png') mime = 'image/png';
    if (ext === 'webp') mime = 'image/webp';
    if (ext === 'gif') mime = 'image/gif';
  }

  if (signal.aborted) throw abortError();
  const fileBytes = await readFile(fullPath);
  if (signal.aborted) throw abortError();
  return URL.createObjectURL(new Blob([fileBytes], { type: mime }));
}

function createPendingLoad(dbPath: string, variant: ImageVariant, key: string): PendingUrlLoad {
  const controller = new AbortController();
  const promise = enqueueImageLoad(
    () => createLocalImageUrl(dbPath, variant, controller.signal),
    controller.signal
  ).then((url) => {
    urlCache.set(key, { url, refs: 0 });
    return url;
  }).catch((error) => {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      reportImageFailure({ path: dbPath, operation: 'read', error: String(error) });
    }
    throw error;
  }).finally(() => {
    pendingUrlLoads.delete(key);
  });

  return { promise, controller, waiters: 0 };
}

function waitForPendingLoad(promise: Promise<string>, signal?: AbortSignal): Promise<string> {
  if (!signal) return promise;
  return new Promise<string>((resolve, reject) => {
    const handleAbort = () => reject(abortError());
    signal.addEventListener('abort', handleAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', handleAbort);
    });
  });
}

export async function getImageUrl(
  dbPath: string | null,
  options: Pick<ImageLoadOptions, 'variant'> = {},
  signal?: AbortSignal
): Promise<string> {
  if (!dbPath) return DEFAULT_COVER_IMAGE;
  if (dbPath.startsWith('http')) return dbPath;
  const variant = options.variant ?? 'original';
  const key = imageCacheKey(dbPath, variant);

  const cached = urlCache.get(key);
  if (cached) {
    cached.refs += 1;
    return cached.url;
  }

  let pending = pendingUrlLoads.get(key);
  if (!pending) {
    pending = createPendingLoad(dbPath, variant, key);
    pendingUrlLoads.set(key, pending);
  }
  pending.waiters += 1;

  try {
    if (signal?.aborted) throw abortError();
    const url = await waitForPendingLoad(pending.promise, signal);
    if (signal?.aborted) throw abortError();
    const loaded = urlCache.get(key);
    if (loaded) loaded.refs += 1;
    return url;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return DEFAULT_COVER_IMAGE;
  } finally {
    pending.waiters -= 1;
    if (pending.waiters <= 0 && pendingUrlLoads.get(key) === pending) {
      pending.controller.abort();
    }
    const loaded = urlCache.get(key);
    if (loaded && loaded.refs <= 0) {
      URL.revokeObjectURL(loaded.url);
      urlCache.delete(key);
    }
  }
}

export function releaseImageUrl(
  dbPath: string | null | undefined,
  variant: ImageVariant = 'original'
): void {
  if (!dbPath || dbPath.startsWith('http')) return;

  const key = imageCacheKey(dbPath, variant);
  const cached = urlCache.get(key);
  if (!cached) return;

  cached.refs -= 1;
  if (cached.refs <= 0) {
    URL.revokeObjectURL(cached.url);
    urlCache.delete(key);
  }
}

// Loading state for a cover image. `loading` means we are still reading the
// file off disk (show a skeleton, NOT the fallback graphic); `empty` means the
// entry genuinely has no usable image (show DEFAULT_COVER_IMAGE); `ready` means
// the real cover URL is available.
export type ImageStatus = 'loading' | 'ready' | 'empty';
export interface ImageSource {
  src: string;
  status: ImageStatus;
}

// Read-only synchronous resolution for the initial paint. Never mutates the
// refcount — it only lets already-known images (remote URLs and warm cache
// hits) render on the very first frame instead of flashing a placeholder.
function peekImageUrl(dbPath: string | null | undefined, variant: ImageVariant): ImageSource {
  if (!dbPath) return { src: DEFAULT_COVER_IMAGE, status: 'empty' };
  if (dbPath.startsWith('http')) return { src: dbPath, status: 'ready' };

  const cached = urlCache.get(imageCacheKey(dbPath, variant));
  if (cached) return { src: cached.url, status: 'ready' };

  return { src: '', status: 'loading' };
}

// Loads a cover image and reports its loading state, so callers can show a
// skeleton while it reads off disk and fade the real image in once ready
// (instead of flashing the DEFAULT_COVER_IMAGE placeholder mid-load).
export function useImageSource(
  dbPath: string | null | undefined,
  options: ImageLoadOptions = {}
): ImageSource {
  const enabled = options.enabled ?? true;
  const variant = options.variant ?? 'original';
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [state, setState] = useState<ImageSource>(() =>
    enabled ? peekImageUrl(dbPath, variant) : { src: '', status: 'loading' }
  );

  useEffect(() => {
    if (!enabled) return;
    const handleRetry = () => setRetryGeneration((generation) => generation + 1);
    window.addEventListener('image-load-retry', handleRetry);
    return () => window.removeEventListener('image-load-retry', handleRetry);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setState({ src: '', status: 'loading' });
      return;
    }
    setState(peekImageUrl(dbPath, variant));
    if (!dbPath) return;

    let cancelled = false;
    let acquired = false;
    const controller = new AbortController();

    getImageUrl(dbPath, { variant }, controller.signal).then((url) => {
      acquired = true;
      if (cancelled) {
        releaseImageUrl(dbPath, variant);
        return;
      }

      setState({ src: url, status: url === DEFAULT_COVER_IMAGE ? 'empty' : 'ready' });
    }).catch((error) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setState({ src: DEFAULT_COVER_IMAGE, status: 'empty' });
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
      if (acquired) {
        releaseImageUrl(dbPath, variant);
      }
    };
  }, [dbPath, enabled, retryGeneration, variant]);

  return state;
}

// Backward-compatible string API: returns the real URL once ready, otherwise
// the fallback. Behaves like the original hook (fallback while loading and for
// entries with no image), but now benefits from the synchronous cache/remote
// fast path in useImageSource so warm images no longer flash.
export function useImageUrl(
  dbPath: string | null | undefined,
  fallback = DEFAULT_COVER_IMAGE,
  options: ImageLoadOptions = {}
): string {
  const { src, status } = useImageSource(dbPath, options);
  return status === 'ready' ? src : fallback;
}

export function useNearViewport<T extends Element>(rootMargin = '600px'): {
  ref: (node: T | null) => void;
  isNearViewport: boolean;
} {
  const [node, setNode] = useState<T | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);

  useEffect(() => {
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsNearViewport(entry.isIntersecting),
      { rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, rootMargin]);

  return { ref: setNode, isNearViewport };
}

// Robustly reveals a cover <img> with a fade-in once it has actually painted.
// Callers render a skeleton while `revealed` is false and fade the <img> in
// (opacity 0 -> 100) when it flips true: wire `reveal` onto onLoad/onError and
// `attachImg` onto the element's `ref`.
//
// Why this exists (do NOT go back to a bare onLoad handler): our covers are
// inserted into the DOM only AFTER their bytes are read off disk (see
// useImageSource). In WKWebView (macOS) a dynamically-inserted <img> can finish
// decoding before React attaches its onLoad listener — or, with loading="lazy",
// never fire a load at all — so the event is missed and the skeleton sits there
// forever until an unrelated re-layout (navigating away and back) nudges it.
// The `attachImg` ref catches the already-complete case; onLoad/onError cover
// the normal async case. Introduced to fix the stuck-skeleton regression from
// the 3.8 "Image Loading 2.0" refactor.
export interface CoverReveal {
  revealed: boolean;
  reveal: () => void;
  attachImg: (node: HTMLImageElement | null) => void;
}

export function useCoverReveal(src: string | null | undefined, status: ImageStatus): CoverReveal {
  // Warm cache / remote images are 'ready' on mount, so skip the skeleton.
  const [revealed, setRevealed] = useState(status === 'ready');
  const nodeRef = useRef<HTMLImageElement | null>(null);
  const prevSrcRef = useRef(src);

  useEffect(() => {
    if (prevSrcRef.current === src) return;
    prevSrcRef.current = src;
    // The source changed: hide and wait for the new image to load — unless the
    // element already has it decoded, in which case a load event may never come.
    const node = nodeRef.current;
    setRevealed(Boolean(node && node.complete && node.naturalWidth > 0));
  }, [src]);

  const reveal = useCallback(() => setRevealed(true), []);

  const attachImg = useCallback((node: HTMLImageElement | null) => {
    nodeRef.current = node;
    // Already decoded by the time it attaches → reveal now, don't wait on a
    // load event that may have already fired.
    if (node && node.complete && node.naturalWidth > 0) setRevealed(true);
  }, []);

  return { revealed, reveal, attachImg };
}

// Reads an arbitrary local file path (e.g. one returned by the file dialog)
// and returns a blob: URL suitable for <img src>. The caller is responsible
// for revoking the URL via URL.revokeObjectURL when no longer needed.
//
// We use this instead of convertFileSrc() because the asset protocol is not
// enabled in tauri.conf.json, so asset:// URLs would fail to load in the
// webview. Blob URLs are permitted by the CSP and work without any extra
// Tauri config, mirroring how getImageUrl renders stored assets.
export async function getLocalFileBlobUrl(filePath: string): Promise<string> {
  const fileBytes = await readFile(filePath);

  const ext = filePath.split('.').pop()?.toLowerCase();
  let mime = 'image/jpeg';
  if (ext === 'png') mime = 'image/png';
  if (ext === 'webp') mime = 'image/webp';
  if (ext === 'gif') mime = 'image/gif';

  const blob = new Blob([fileBytes], { type: mime });
  return URL.createObjectURL(blob);
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
