import type { RandomPickFilterOptions, RandomPickFilters } from '../db';

export const RANDOM_PICK_FILTERS_KEY = 'media-logger-random-pick-filters';

export const DEFAULT_RANDOM_PICK_FILTERS: RandomPickFilters = {
  entryTypes: [],
  excludedEntryTypes: [],
  scoreRange: null,
  yearMode: 'any',
  yearExact: null,
  yearFrom: null,
  yearTo: null,
  localCopy: 'any',
  rewatchStatus: 'any',
  duplicates: 'any',
  genres: [],
  excludedGenres: [],
  platforms: [],
  excludedPlatforms: [],
  franchises: [],
  excludedFranchises: [],
  series: [],
  excludedSeries: [],
  actresses: [],
  directors: [],
  authors: [],
};

/** Tri-state chip fields, each mapped to the array holding its excluded values. */
export const CHIP_FIELDS = {
  entryTypes: 'excludedEntryTypes',
  genres: 'excludedGenres',
  platforms: 'excludedPlatforms',
  franchises: 'excludedFranchises',
  series: 'excludedSeries',
} as const;

export type ChipField = keyof typeof CHIP_FIELDS;
export type ChipState = 'off' | 'include' | 'exclude';

/**
 * The subset of the Search page's filters that "Use search filters" can carry
 * across. Search passes its own filter object; only these fields are read.
 */
export interface SearchFilterSnapshot {
  entryTypes: string[];
  platforms: string[];
  actresses: string[];
  directors: string[];
  authors: string[];
  franchises: string[];
  series: string[];
  scoreRange: { min: number; max: number } | null;
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isYear = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);

const isScoreRange = (value: unknown): value is { min: number; max: number } => {
  if (typeof value !== 'object' || value === null) return false;
  const { min, max } = value as { min: unknown; max: unknown };
  return (
    typeof min === 'number' &&
    typeof max === 'number' &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min >= 0 &&
    max <= 10 &&
    min <= max
  );
};

const pickOption = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

export function loadRandomPickFilters(): RandomPickFilters {
  try {
    const stored = localStorage.getItem(RANDOM_PICK_FILTERS_KEY);
    if (!stored) return DEFAULT_RANDOM_PICK_FILTERS;
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_RANDOM_PICK_FILTERS;
    const raw = parsed as Record<string, unknown>;
    const strings = (key: keyof RandomPickFilters): string[] => {
      const value = raw[key];
      return isStringArray(value) ? value : [];
    };
    const year = (key: keyof RandomPickFilters): number | null => {
      const value = raw[key];
      return isYear(value) ? value : null;
    };

    return {
      entryTypes: strings('entryTypes'),
      excludedEntryTypes: strings('excludedEntryTypes'),
      scoreRange: isScoreRange(raw.scoreRange) ? raw.scoreRange : null,
      yearMode: pickOption(raw.yearMode, ['any', 'exact', 'range'] as const, 'any'),
      yearExact: year('yearExact'),
      yearFrom: year('yearFrom'),
      yearTo: year('yearTo'),
      localCopy: pickOption(raw.localCopy, ['any', 'yes', 'no'] as const, 'any'),
      rewatchStatus: pickOption(raw.rewatchStatus, ['any', 'never', 'has'] as const, 'any'),
      duplicates: pickOption(raw.duplicates, ['any', 'yes', 'no'] as const, 'any'),
      genres: strings('genres'),
      excludedGenres: strings('excludedGenres'),
      platforms: strings('platforms'),
      excludedPlatforms: strings('excludedPlatforms'),
      franchises: strings('franchises'),
      excludedFranchises: strings('excludedFranchises'),
      series: strings('series'),
      excludedSeries: strings('excludedSeries'),
      actresses: strings('actresses'),
      directors: strings('directors'),
      authors: strings('authors'),
    };
  } catch {
    // Fall back to defaults if local storage is unavailable or malformed.
    return DEFAULT_RANDOM_PICK_FILTERS;
  }
}

export function saveRandomPickFilters(filters: RandomPickFilters): void {
  try {
    localStorage.setItem(RANDOM_PICK_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // Ignore storage failures.
  }
}

export function getChipState(filters: RandomPickFilters, field: ChipField, value: string): ChipState {
  if (filters[field].includes(value)) return 'include';
  if (filters[CHIP_FIELDS[field]].includes(value)) return 'exclude';
  return 'off';
}

/** off → include → exclude → off. A value never sits in both arrays. */
export function cycleChip(filters: RandomPickFilters, field: ChipField, value: string): RandomPickFilters {
  const excludedField = CHIP_FIELDS[field];
  const included = filters[field];
  const excluded = filters[excludedField];

  if (included.includes(value)) {
    return {
      ...filters,
      [field]: included.filter((item) => item !== value),
      [excludedField]: [...excluded, value],
    };
  }
  if (excluded.includes(value)) {
    return { ...filters, [excludedField]: excluded.filter((item) => item !== value) };
  }
  return { ...filters, [field]: [...included, value] };
}

export function clearChipField(filters: RandomPickFilters, field: ChipField): RandomPickFilters {
  return { ...filters, [field]: [], [CHIP_FIELDS[field]]: [] };
}

/**
 * Drops persisted selections that the library no longer offers (deleted
 * values, or adult types hidden by the Adult Media toggle) so every active
 * filter still has a visible chip to turn it off. Returns the same object
 * when nothing changed.
 */
export function pruneToOptions(filters: RandomPickFilters, options: RandomPickFilterOptions): RandomPickFilters {
  const available: Record<ChipField, Set<string>> = {
    entryTypes: new Set(options.entryTypes),
    genres: new Set(options.genres),
    platforms: new Set(options.platforms),
    franchises: new Set(options.franchises),
    series: new Set(options.series),
  };
  const years = new Set(options.years);

  let changed = false;
  const next: RandomPickFilters = { ...filters };
  for (const field of Object.keys(CHIP_FIELDS) as ChipField[]) {
    for (const key of [field, CHIP_FIELDS[field]] as const) {
      const kept = filters[key].filter((value) => available[field].has(value));
      if (kept.length !== filters[key].length) {
        next[key] = kept;
        changed = true;
      }
    }
  }
  for (const key of ['yearExact', 'yearFrom', 'yearTo'] as const) {
    const value = filters[key];
    if (value != null && !years.has(value)) {
      next[key] = null;
      changed = true;
    }
  }

  return changed ? next : filters;
}

export function hasActiveRandomPickFilters(filters: RandomPickFilters): boolean {
  return (
    filters.scoreRange !== null ||
    filters.yearMode !== 'any' ||
    filters.localCopy !== 'any' ||
    filters.rewatchStatus !== 'any' ||
    filters.duplicates !== 'any' ||
    (Object.keys(CHIP_FIELDS) as ChipField[]).some(
      (field) => filters[field].length > 0 || filters[CHIP_FIELDS[field]].length > 0,
    ) ||
    filters.actresses.length > 0 ||
    filters.directors.length > 0 ||
    filters.authors.length > 0
  );
}

/**
 * Copies Search's active filters in. Each field Search has values for replaces
 * that field's includes (and drops the same values from its excludes); fields
 * Search leaves empty keep their current Random Pick selection.
 */
export function applySearchFilters(filters: RandomPickFilters, search: SearchFilterSnapshot): RandomPickFilters {
  let next: RandomPickFilters = { ...filters };
  const replaceIncludes = (field: ChipField, values: string[]) => {
    if (values.length === 0) return;
    const incoming = new Set(values);
    next = {
      ...next,
      [field]: [...values],
      [CHIP_FIELDS[field]]: next[CHIP_FIELDS[field]].filter((value) => !incoming.has(value)),
    };
  };

  replaceIncludes('entryTypes', search.entryTypes);
  replaceIncludes('platforms', search.platforms);
  replaceIncludes('franchises', search.franchises);
  replaceIncludes('series', search.series);
  if (search.scoreRange) next.scoreRange = { ...search.scoreRange };
  if (search.actresses.length > 0) next.actresses = [...search.actresses];
  if (search.directors.length > 0) next.directors = [...search.directors];
  if (search.authors.length > 0) next.authors = [...search.authors];
  return next;
}

export function hasSearchFilters(search: SearchFilterSnapshot | null | undefined): search is SearchFilterSnapshot {
  if (!search) return false;
  return (
    search.scoreRange !== null ||
    [search.entryTypes, search.platforms, search.actresses, search.directors, search.authors, search.franchises, search.series]
      .some((values) => values.length > 0)
  );
}

/** True when applying Search's filters would change nothing. */
export function searchFiltersApplied(filters: RandomPickFilters, search: SearchFilterSnapshot): boolean {
  return JSON.stringify(applySearchFilters(filters, search)) === JSON.stringify(filters);
}
