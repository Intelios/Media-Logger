import { invoke } from '@tauri-apps/api/core';
import type { StagedCoverImport } from './image-service';
import {
  getGameCoverProvider,
  getIgdbClientId,
  getIgdbClientSecret,
  getRawgApiKey,
  getTmdbApiKey,
  isCoverArtEnabled,
} from './settings';

/** One candidate cover row returned by the native `cover_search` command. */
export interface CoverCandidate {
  id: string;
  title: string;
  subtitle: string | null;
  thumbnailUrl: string;
  originalUrl: string;
}

export type CoverSearchAvailability = 'disabled' | 'ready' | 'needs-key' | 'unsupported';

/** Entry types the feature covers; adult types and Other stay manual. */
const COVER_SEARCH_TYPES = new Set(['Movie', 'Show', 'K-Drama', 'Anime', 'Book', 'Album', 'Game']);

/** Display name of the provider that serves each type (also used for credits). */
export const COVER_SEARCH_PROVIDER_BY_TYPE: Record<string, string> = {
  Movie: 'TMDB',
  Show: 'TMDB',
  'K-Drama': 'TMDB',
  Anime: 'AniList',
  Book: 'Open Library',
  Album: 'iTunes',
};

/** Provider display name, honoring the Game provider toggle. */
export function getCoverSearchProviderName(entryType: string): string {
  if (entryType === 'Game') {
    return getGameCoverProvider() === 'rawg' ? 'RAWG' : 'IGDB';
  }
  return COVER_SEARCH_PROVIDER_BY_TYPE[entryType] ?? '';
}

/**
 * Whether the "Search Cover Art" button should render for a given entry type.
 * `disabled` means the opt-in toggle in Settings is off; `needs-key` means the
 * button renders but searching will ask for the missing provider key first.
 */
export function getCoverSearchAvailability(
  entryType: string | null | undefined,
): CoverSearchAvailability {
  if (!isCoverArtEnabled()) return 'disabled';
  if (!entryType || !COVER_SEARCH_TYPES.has(entryType)) return 'unsupported';
  if (entryType === 'Movie' || entryType === 'Show' || entryType === 'K-Drama') {
    return getTmdbApiKey() ? 'ready' : 'needs-key';
  }
  if (entryType === 'Game') {
    if (getGameCoverProvider() === 'rawg') {
      return getRawgApiKey() ? 'ready' : 'needs-key';
    }
    return getIgdbClientId() && getIgdbClientSecret() ? 'ready' : 'needs-key';
  }
  return 'ready';
}

export async function searchCoverArt(query: string, entryType: string): Promise<CoverCandidate[]> {
  return invoke<CoverCandidate[]>('cover_search', {
    query,
    entryType,
    tmdbApiKey: getTmdbApiKey(),
    igdbClientId: getIgdbClientId(),
    igdbClientSecret: getIgdbClientSecret(),
    rawgApiKey: getRawgApiKey(),
    gameProvider: getGameCoverProvider(),
  });
}

/**
 * Downloads the chosen original through the native image service and returns a
 * staged-cover token identical to a manual file pick, so commit/cancel behave
 * exactly the same downstream.
 */
export async function stageCoverFromUrl(url: string): Promise<StagedCoverImport> {
  return invoke<StagedCoverImport>('cover_stage_from_url', { url });
}
