import { invoke } from '@tauri-apps/api/core';
import { useSyncExternalStore } from 'react';
import { getDataDirectory } from './settings';

export type CoverVariant = 'small' | 'card' | 'hero' | 'original';

export interface ImageServiceStatus {
  configured: boolean;
  protocolBase: string;
  recipeVersion: number;
  generation?: number;
  generationLimit: number;
  memoryEntries: number;
  memoryBytes: number;
  memoryLimitBytes: number;
  diskEntries: number;
  diskBytes: number;
  diskLimitBytes: number;
  stagedImports: number;
}

export interface ImagePrewarmRequest {
  imagePath: string;
  variant: Exclude<CoverVariant, 'original'>;
}

export interface ImagePrewarmResult {
  requested: number;
  generated: number;
  cached: number;
  failed: number;
}

export interface StagedCoverImport {
  token: string;
  previewUrl: string;
}

export interface CommittedCoverImport {
  imagePath: string;
}

type Listener = () => void;

const GIBIBYTE = 1024 * 1024 * 1024;
const DEFAULT_DISK_CACHE_BYTES = 3 * GIBIBYTE;
const CACHE_LIMIT_KEY = 'media-logger-image-cache-limit-gib';
export const IMAGE_PREWARM_MARKER_PREFIX = 'media-logger-image-prewarm:';
const listeners = new Set<Listener>();
let status: ImageServiceStatus | null = null;
let initialization: Promise<ImageServiceStatus> | null = null;
let configuredDataDirectory: string | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ImageServiceStatus | null {
  return status;
}

function encodePath(path: string): string {
  const bytes = new TextEncoder().encode(path);
  let binary = '';
  // Avoid spreading a potentially large typed array into String.fromCharCode.
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function normalizeProtocolBase(value: string): string {
  return value.replace(/\/+$/u, '');
}

function configuredCacheLimitBytes(): number {
  const selected = Number.parseInt(localStorage.getItem(CACHE_LIMIT_KEY) ?? '3', 10);
  return (selected === 1 || selected === 5 ? selected : 3) * GIBIBYTE;
}

export async function initializeImageService(force = false): Promise<ImageServiceStatus> {
  if (!force && initialization) return initialization;

  initialization = (async () => {
    const dataDir = await getDataDirectory();
    if (!force && status?.configured && configuredDataDirectory === dataDir) {
      return status;
    }
    configuredDataDirectory = dataDir;
    const next = await invoke<ImageServiceStatus>('configure_image_service', {
      dataDir,
      cacheLimit: configuredCacheLimitBytes() || DEFAULT_DISK_CACHE_BYTES,
    });
    status = { ...next, protocolBase: normalizeProtocolBase(next.protocolBase) };
    emit();
    return status;
  })().finally(() => {
    initialization = null;
  });

  return initialization;
}

export function getImageCacheLimitGiB(): 1 | 3 | 5 {
  const selected = Number.parseInt(localStorage.getItem(CACHE_LIMIT_KEY) ?? '3', 10);
  return selected === 1 || selected === 5 ? selected : 3;
}

export async function setImageCacheLimitGiB(limit: 1 | 3 | 5): Promise<ImageServiceStatus> {
  localStorage.setItem(CACHE_LIMIT_KEY, String(limit));
  return initializeImageService(true);
}

export function clearImagePrewarmMarkers(): void {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(IMAGE_PREWARM_MARKER_PREFIX)) localStorage.removeItem(key);
  }
}

export function useImageServiceStatus(): ImageServiceStatus | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getImageServiceStatusSnapshot(): ImageServiceStatus | null {
  return status;
}

export function createMediaUrl(
  imagePath: string | null | undefined,
  variant: CoverVariant,
): string {
  if (!imagePath) return '';
  if (/^https?:\/\//iu.test(imagePath)) return imagePath;
  if (!status?.configured || !status.protocolBase) return '';
  return `${status.protocolBase}/${variant}/${encodePath(imagePath)}`;
}

export function createMediaSources(
  imagePath: string | null | undefined,
  variant: CoverVariant,
): { src: string; srcSet?: string; sizes?: string } {
  if (!imagePath || /^https?:\/\//iu.test(imagePath) || variant === 'original') {
    return { src: createMediaUrl(imagePath, variant) };
  }

  if (variant === 'small') {
    return { src: createMediaUrl(imagePath, 'small') };
  }
  if (variant === 'card') {
    return {
      src: createMediaUrl(imagePath, 'card'),
      srcSet: `${createMediaUrl(imagePath, 'small')} 384w, ${createMediaUrl(imagePath, 'card')} 768w`,
      sizes: '(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 20vw',
    };
  }
  return {
    src: createMediaUrl(imagePath, 'hero'),
    srcSet: `${createMediaUrl(imagePath, 'card')} 768w, ${createMediaUrl(imagePath, 'hero')} 1600w`,
    sizes: '(max-width: 900px) 100vw, 70vw',
  };
}

export async function refreshImageServiceStatus(): Promise<ImageServiceStatus> {
  const next = await invoke<ImageServiceStatus>('image_service_status');
  status = { ...next, protocolBase: normalizeProtocolBase(next.protocolBase) };
  emit();
  return status;
}

export async function clearImageServiceCache(): Promise<ImageServiceStatus> {
  const next = await invoke<ImageServiceStatus>('clear_image_service_cache');
  status = { ...next, protocolBase: normalizeProtocolBase(next.protocolBase) };
  emit();
  return status;
}

export async function prewarmImageCache(
  requests: ImagePrewarmRequest[],
): Promise<ImagePrewarmResult> {
  if (requests.length === 0) {
    return { requested: 0, generated: 0, cached: 0, failed: 0 };
  }
  return invoke<ImagePrewarmResult>('prewarm_image_cache', { requests });
}

export async function stageCoverImport(sourcePath: string): Promise<StagedCoverImport> {
  return invoke<StagedCoverImport>('stage_cover_import', { sourcePath });
}

export async function commitCoverImport(token: string): Promise<CommittedCoverImport> {
  return invoke<CommittedCoverImport>('commit_cover_import', { token });
}

export async function cancelCoverImport(token: string): Promise<void> {
  await invoke('cancel_cover_import', { token });
}
