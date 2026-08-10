import type { MediaEntry } from '../db/types';

export const PROFILE_TYPES = [
  'director',
  'actress',
  'artist',
  'author',
  'platform',
  'franchise',
  'series',
] as const;

export type ProfileType = (typeof PROFILE_TYPES)[number];

export interface ProfileIdentity {
  type: ProfileType;
  name: string;
}

// Non-destructive crop/reframe descriptor for a profile's cover image.
// Stored as JSON in profiles.crop_data and applied at render time.
export interface CropData {
  x: number;
  y: number;
  scale: number;
  fit: 'cover' | 'contain';
}

export const DEFAULT_CROP: CropData = { x: 50, y: 50, scale: 1, fit: 'cover' };

export interface ProfileSummary extends ProfileIdentity {
  count: number;
  average_score: number;
  image_url?: string;
  crop?: CropData;
  track_avg_history?: boolean;
}

export interface ProfileIndex {
  visible: ProfileSummary[];
  hidden: ProfileSummary[];
}

export type ProfileField =
  | 'director'
  | 'actress'
  | 'artist'
  | 'author'
  | 'platform'
  | 'franchise'
  | 'series';

export const PROFILE_FIELD_BY_TYPE: Record<ProfileType, ProfileField> = {
  director: 'director',
  actress: 'actress',
  artist: 'artist',
  author: 'author',
  platform: 'platform',
  franchise: 'franchise',
  series: 'series',
};

const PROFILE_TYPE_SET = new Set<string>(PROFILE_TYPES);
const SERIES_ENTRY_TYPES = new Set(['Show', 'K-Drama', 'Anime']);

export type ProfileEntrySource = Pick<
  MediaEntry,
  | 'entry_type'
  | 'director'
  | 'actress'
  | 'artist'
  | 'author'
  | 'platform'
  | 'franchise'
  | 'series'
>;

export type ProfileAggregationEntry = ProfileEntrySource & Pick<MediaEntry, 'review_score'>;

export function isProfileType(value: string): value is ProfileType {
  return PROFILE_TYPE_SET.has(value);
}

export function makeProfileKey(type: ProfileType, name: string): string {
  return `${type}:${name}`;
}

export function getProfileKey(profile: ProfileIdentity): string {
  return makeProfileKey(profile.type, profile.name);
}

export function splitProfileNames(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((name) => name.trim()).filter(Boolean);
}

export function parseCropData(raw: string | null | undefined): CropData | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' && parsed !== null &&
      'x' in parsed && typeof parsed.x === 'number' &&
      'y' in parsed && typeof parsed.y === 'number' &&
      'scale' in parsed && typeof parsed.scale === 'number' &&
      'fit' in parsed && (parsed.fit === 'cover' || parsed.fit === 'contain')
    ) {
      return { x: parsed.x, y: parsed.y, scale: parsed.scale, fit: parsed.fit };
    }
  } catch {
    // Malformed crop JSON is treated as an unedited profile.
  }
  return undefined;
}

/** Literal field membership used by the profile detail view. */
export function entryMatchesProfile(
  entry: ProfileEntrySource,
  type: ProfileType,
  name: string,
): boolean {
  const value = entry[PROFILE_FIELD_BY_TYPE[type]];
  return typeof value === 'string' && splitProfileNames(value).includes(name);
}

/**
 * Profile identities contributed by an entry to profile aggregation/history.
 * A Set removes duplicate names both within one field and across old/new inputs.
 */
export function extractProfileIdentities(entry: ProfileEntrySource): ProfileIdentity[] {
  const identities = new Map<string, ProfileIdentity>();
  const add = (type: ProfileType) => {
    const field = PROFILE_FIELD_BY_TYPE[type];
    const value = entry[field];
    if (typeof value !== 'string') return;
    for (const name of splitProfileNames(value)) {
      const identity = { type, name };
      identities.set(getProfileKey(identity), identity);
    }
  };

  add('director');
  add('actress');
  add('artist');
  add('author');
  if (entry.entry_type === 'Game') {
    add('platform');
    add('franchise');
  }
  if (SERIES_ENTRY_TYPES.has(entry.entry_type ?? '')) {
    add('series');
  }

  return [...identities.values()];
}
