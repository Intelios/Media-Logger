import type { StatsEntry } from "./db";

export interface StatItem {
  name: string;
  count: number;
  value?: number;
  color?: string;
  avgScore?: number;
  perfectCount?: number;
  [key: string]: string | number | undefined;
}

interface MultiLogDayEntry {
  id: number;
  name: string;
  entry_type: string | null;
  review_score: number | null;
  is_rewatch: number;
  own_local_copy: number;
  has_subtitles: number;
  is_platinum: number;
  is_early_access: number;
  is_expansion: number;
}

export interface MultiLogDay {
  date: string;
  entries: MultiLogDayEntry[];
}

export interface DailyCompletion {
  date: string;
  count: number;
}

export interface MostReplayedLog {
  completion_date: string | null;
  review_score: number | null;
  is_rewatch: boolean;
}

export interface MostReplayedItem {
  name: string;
  name_id: number;
  total_completions: number;
  rewatch_count: number;
  avg_score: number | null;
  entry_type: string | null;
  logs: MostReplayedLog[];
}

export interface FullStats {
  total: number;
  average_score: number;
  rewatch_count: number;
  ratings: StatItem[];
  genres: StatItem[];
  platforms: StatItem[];
  franchises: StatItem[];
  series: StatItem[];
  studios: StatItem[];
  authors: StatItem[];
  actresses: StatItem[];
  perfectTenCount: number;
  entriesThisMonth: number;
  mediaTypeBreakdown: StatItem[];
  multiLogDays: MultiLogDay[];
  averageScoreByType: StatItem[];
  dailyCompletions: DailyCompletion[];
  mostReplayed: MostReplayedItem[];
}

export interface TimelineBucket {
  key: string;
  label: string;
  completions: number;
  averageScore: number | null;
  /** Entries in the bucket carrying a score — the sample averageScore is drawn from. */
  ratedCount: number;
  rewatches: number;
  platinums: number;
}

export interface StatsDataset {
  entries: StatsEntry[];
  ratedEntries: Array<StatsEntry & { review_score: number }>;
  gameEntries: StatsEntry[];
  tvEntries: StatsEntry[];
  now: Date;
}

export type CountableField =
  | "genre"
  | "platform"
  | "franchise"
  | "series"
  | "director"
  | "author"
  | "actress"
  | "entry_type";

/**
 * The aggregate list fields of FullStats. The plate only renders four panels at
 * a time, so its derivation passes a requirement set and every list outside it
 * comes back empty — never compute a list no slotted panel can read.
 */
export type StatsListId =
  | "ratings"
  | "genres"
  | "platforms"
  | "franchises"
  | "series"
  | "studios"
  | "authors"
  | "actresses"
  | "mediaTypeBreakdown"
  | "multiLogDays"
  | "averageScoreByType"
  | "dailyCompletions"
  | "mostReplayed";

export type StatsListRequirement = ReadonlySet<StatsListId>;

export const ALL_STATS_LIST_IDS: readonly StatsListId[] = [
  "ratings",
  "genres",
  "platforms",
  "franchises",
  "series",
  "studios",
  "authors",
  "actresses",
  "mediaTypeBreakdown",
  "multiLogDays",
  "averageScoreByType",
  "dailyCompletions",
  "mostReplayed",
];

const MONTH_KEYS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function hasReviewScore(entry: StatsEntry): entry is StatsEntry & { review_score: number } {
  return typeof entry.review_score === "number" && Number.isFinite(entry.review_score);
}

function isGameEntry(entry: StatsEntry) {
  return typeof entry.entry_type === "string" && entry.entry_type.trim().toLowerCase() === "game";
}

function isTvEntry(entry: StatsEntry) {
  return typeof entry.entry_type === "string" && ["show", "k-drama", "anime"].includes(entry.entry_type.trim().toLowerCase());
}

function getDelimitedValues(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Per-row facets that a derive would otherwise recompute on every brush frame:
 * the comma splits of delimited fields, the game/TV type flags, and the parsed
 * completion month/year. Keyed on the row object, so each facet is computed
 * once per dataset version — the worker retains its cloned rows and the
 * synchronous fallback retains the main-thread rows, and replaced datasets
 * drop out of the map for the GC to collect.
 */
interface EntryFacets {
  delimited: Partial<Record<CountableField, readonly string[]>>;
  isGame?: boolean;
  isTv?: boolean;
  parsedCompletion?: { monthIndex: number; year: number } | null;
}

const entryFacetsCache = new WeakMap<StatsEntry, EntryFacets>();

function facetsOf(entry: StatsEntry): EntryFacets {
  let facets = entryFacetsCache.get(entry);
  if (facets === undefined) {
    facets = { delimited: {} };
    entryFacetsCache.set(entry, facets);
  }
  return facets;
}

/** Memoized getDelimitedValues for one field of one row; splitting semantics are identical. */
export function delimitedFieldValues(entry: StatsEntry, field: CountableField): readonly string[] {
  const facets = facetsOf(entry);
  const cached = facets.delimited[field];
  if (cached !== undefined) {
    return cached;
  }

  const values = getDelimitedValues(entry[field]);
  facets.delimited[field] = values;
  return values;
}

function isGameEntryCached(entry: StatsEntry): boolean {
  const facets = facetsOf(entry);
  if (facets.isGame === undefined) {
    facets.isGame = isGameEntry(entry);
  }
  return facets.isGame;
}

function isTvEntryCached(entry: StatsEntry): boolean {
  const facets = facetsOf(entry);
  if (facets.isTv === undefined) {
    facets.isTv = isTvEntry(entry);
  }
  return facets.isTv;
}

function parsedCompletionOf(entry: StatsEntry): { monthIndex: number; year: number } | null {
  const facets = facetsOf(entry);
  if (facets.parsedCompletion === undefined) {
    facets.parsedCompletion = null;
    if (entry.completion_date) {
      const parsed = new Date(entry.completion_date);
      if (!Number.isNaN(parsed.getTime())) {
        facets.parsedCompletion = { monthIndex: parsed.getMonth(), year: parsed.getFullYear() };
      }
    }
  }
  return facets.parsedCompletion;
}

/**
 * Counts a comma-delimited field across entries, carrying average and perfect-10
 * counts. `avgScore` is deliberately unrounded — round at the render layer.
 */
export function countFieldWithScores(entries: StatsEntry[], fieldName: CountableField): StatItem[] {
  const stats: Record<string, { count: number; totalScore: number; scoreCount: number; perfectCount: number }> = {};

  for (const entry of entries) {
    for (const value of delimitedFieldValues(entry, fieldName)) {
      if (!stats[value]) {
        stats[value] = { count: 0, totalScore: 0, scoreCount: 0, perfectCount: 0 };
      }

      stats[value].count += 1;

      if (hasReviewScore(entry)) {
        stats[value].totalScore += entry.review_score;
        stats[value].scoreCount += 1;

        if (entry.review_score === 10) {
          stats[value].perfectCount += 1;
        }
      }
    }
  }

  return Object.entries(stats)
    .map(([name, data]) => ({
      name,
      count: data.count,
      value: data.count,
      avgScore: data.scoreCount > 0 ? data.totalScore / data.scoreCount : undefined,
      perfectCount: data.perfectCount,
    }))
    .sort((left, right) => right.count - left.count);
}

export function createStatsDataset(entries: StatsEntry[], now = new Date()): StatsDataset {
  return {
    entries,
    ratedEntries: entries.filter(hasReviewScore),
    gameEntries: entries.filter(isGameEntryCached),
    tvEntries: entries.filter(isTvEntryCached),
    now,
  };
}

export function selectBasicStats(dataset: StatsDataset) {
  const total = dataset.entries.length;
  const currentMonth = dataset.now.getMonth();
  const currentYear = dataset.now.getFullYear();

  let rewatchCount = 0;
  let entriesThisMonth = 0;
  for (const entry of dataset.entries) {
    if (entry.is_rewatch) {
      rewatchCount += 1;
    }

    const parsed = parsedCompletionOf(entry);
    if (parsed !== null && parsed.monthIndex === currentMonth && parsed.year === currentYear) {
      entriesThisMonth += 1;
    }
  }

  let totalRatedScore = 0;
  let perfectTenCount = 0;
  for (const entry of dataset.ratedEntries) {
    totalRatedScore += entry.review_score;
    if (entry.review_score === 10) {
      perfectTenCount += 1;
    }
  }

  return {
    total,
    rewatch_count: rewatchCount,
    perfectTenCount,
    average_score: dataset.ratedEntries.length > 0 ? totalRatedScore / dataset.ratedEntries.length : 0,
    entriesThisMonth,
  };
}

export function selectRatingDistribution(dataset: StatsDataset): StatItem[] {
  const ratingMap = new Array(11).fill(0);

  for (const entry of dataset.ratedEntries) {
    // review_score is REAL in the schema; round fractional scores into integer
    // buckets (matching the Review slide) instead of silently dropping them.
    const score = Math.round(entry.review_score);
    if (score >= 0 && score <= 10) {
      ratingMap[score] += 1;
    }
  }

  const ratings: StatItem[] = [];
  for (let score = 10; score >= 1; score -= 1) {
    ratings.push({
      name: score.toString(),
      count: ratingMap[score],
      value: ratingMap[score],
    });
  }

  // Zero is a selectable score; show its bar only when someone actually used it.
  if (ratingMap[0] > 0) {
    ratings.push({
      name: "0",
      count: ratingMap[0],
      value: ratingMap[0],
    });
  }

  return ratings;
}

export function selectGenres(dataset: StatsDataset) {
  return countFieldWithScores(dataset.entries, "genre").slice(0, 25);
}

export function selectPlatforms(dataset: StatsDataset) {
  return countFieldWithScores(dataset.gameEntries, "platform").slice(0, 25);
}

export function selectFranchises(dataset: StatsDataset) {
  return countFieldWithScores(dataset.gameEntries, "franchise").slice(0, 25);
}

export function selectSeries(dataset: StatsDataset) {
  return countFieldWithScores(dataset.tvEntries, "series").slice(0, 25);
}

export function selectStudios(dataset: StatsDataset) {
  return countFieldWithScores(dataset.entries, "director").slice(0, 25);
}

export function selectAuthors(dataset: StatsDataset) {
  return countFieldWithScores(dataset.entries, "author").slice(0, 25);
}

export function selectActresses(dataset: StatsDataset) {
  return countFieldWithScores(dataset.entries, "actress").slice(0, 25);
}

export function selectMediaTypeBreakdown(dataset: StatsDataset) {
  return countFieldWithScores(dataset.entries, "entry_type").slice(0, 15);
}

export function selectMultiLogDays(dataset: StatsDataset): MultiLogDay[] {
  const days = new Map<string, MultiLogDayEntry[]>();

  for (const entry of dataset.entries) {
    const date = entry.completion_date?.trim();
    if (!date) {
      continue;
    }

    const entriesForDay = days.get(date) ?? [];
    entriesForDay.push({
      id: entry.id,
      name: entry.name,
      entry_type: entry.entry_type,
      review_score: entry.review_score,
      is_rewatch: entry.is_rewatch,
      own_local_copy: entry.own_local_copy,
      has_subtitles: entry.has_subtitles,
      is_platinum: entry.is_platinum,
      is_early_access: entry.is_early_access,
      is_expansion: entry.is_expansion,
    });
    days.set(date, entriesForDay);
  }

  return [...days.entries()]
    .filter(([, entries]) => entries.length > 1)
    .sort(([leftDate], [rightDate]) => rightDate.localeCompare(leftDate))
    .map(([date, entries]) => ({
      date,
      entries: [...entries].sort((left, right) => {
        const idDiff = right.id - left.id;
        return idDiff !== 0 ? idDiff : left.name.localeCompare(right.name);
      }),
    }));
}

// One row per month (specific year) or per year (All Time), carrying every series
// the stats timeline can draw. Month buckets are pre-seeded so the axis stays
// Jan–Dec regardless of activity; year buckets only exist where there is data.
//
// Takes the raw row array rather than a StatsDataset: the plate derives the
// timeline from the full unbrushed set every frame, and building the dataset's
// rated/game/tv arrays for it was per-brush work nothing ever read.
export function selectTimelineSeriesFromEntries(
  entries: StatsEntry[],
  granularity: "month" | "year"
): TimelineBucket[] {
  type Accumulator = {
    label: string;
    completions: number;
    totalScore: number;
    scoredCount: number;
    rewatches: number;
    platinums: number;
  };

  const buckets = new Map<string, Accumulator>();

  const ensureBucket = (key: string, label: string) => {
    const existing = buckets.get(key);
    if (existing) {
      return existing;
    }

    const created: Accumulator = { label, completions: 0, totalScore: 0, scoredCount: 0, rewatches: 0, platinums: 0 };
    buckets.set(key, created);
    return created;
  };

  if (granularity === "month") {
    MONTH_KEYS.forEach((month, index) => ensureBucket(String(index).padStart(2, "0"), month));
  }

  for (const entry of entries) {
    if (!entry.completion_date) {
      continue;
    }

    const monthIndex = Number(entry.completion_date.slice(5, 7)) - 1;
    const key = granularity === "month" ? String(monthIndex).padStart(2, "0") : entry.completion_date.slice(0, 4);

    if (granularity === "month" && (monthIndex < 0 || monthIndex > 11)) {
      continue;
    }

    const bucket = ensureBucket(key, granularity === "month" ? MONTH_KEYS[monthIndex] : key);
    bucket.completions += 1;

    if (hasReviewScore(entry)) {
      bucket.totalScore += entry.review_score;
      bucket.scoredCount += 1;
    }

    if (entry.is_rewatch) {
      bucket.rewatches += 1;
    }

    if (entry.is_platinum) {
      bucket.platinums += 1;
    }
  }

  return [...buckets.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      completions: bucket.completions,
      averageScore: bucket.scoredCount > 0 ? bucket.totalScore / bucket.scoredCount : null,
      ratedCount: bucket.scoredCount,
      rewatches: bucket.rewatches,
      platinums: bucket.platinums,
    }));
}

export function selectTimelineSeries(dataset: StatsDataset, granularity: "month" | "year"): TimelineBucket[] {
  return selectTimelineSeriesFromEntries(dataset.entries, granularity);
}

function toAverageScoreByType(items: StatItem[]): StatItem[] {
  return items
    .filter((item) => item.avgScore !== undefined)
    .sort((left, right) => {
      const avgDiff = (right.avgScore ?? 0) - (left.avgScore ?? 0);
      return avgDiff !== 0 ? avgDiff : right.count - left.count;
    })
    .slice(0, 8);
}

export function selectAverageScoreByType(dataset: StatsDataset) {
  return toAverageScoreByType(countFieldWithScores(dataset.entries, "entry_type"));
}

export function selectDailyCompletions(dataset: StatsDataset): DailyCompletion[] {
  const dailyMap = new Map<string, number>();

  for (const entry of dataset.entries) {
    const date = entry.completion_date?.trim();
    if (!date) {
      continue;
    }

    dailyMap.set(date, (dailyMap.get(date) ?? 0) + 1);
  }

  return [...dailyMap.entries()]
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([date, count]) => ({ date, count }));
}

export function selectMostReplayed(dataset: StatsDataset): MostReplayedItem[] {
  const groups = new Map<
    string,
    {
      total: number;
      rewatches: number;
      id: number;
      scores: number[];
      entryType: string | null;
      logs: MostReplayedLog[];
    }
  >();

  for (const entry of dataset.entries) {
    const existing = groups.get(entry.name);
    const log: MostReplayedLog = {
      completion_date: entry.completion_date,
      review_score: entry.review_score,
      is_rewatch: Boolean(entry.is_rewatch),
    };
    if (existing) {
      existing.total += 1;
      if (Boolean(entry.is_rewatch)) {
        existing.rewatches += 1;
      }
      if (hasReviewScore(entry)) {
        existing.scores.push(entry.review_score);
      }
      if (entry.entry_type) {
        existing.entryType = entry.entry_type;
      }
      existing.logs.push(log);
    } else {
      groups.set(entry.name, {
        total: 1,
        rewatches: Boolean(entry.is_rewatch) ? 1 : 0,
        id: entry.id,
        scores: hasReviewScore(entry) ? [entry.review_score] : [],
        entryType: entry.entry_type ?? null,
        logs: [log],
      });
    }
  }

  return [...groups.entries()]
    .filter(([, data]) => data.total >= 2)
    .sort(([, left], [, right]) => right.total - left.total)
    .slice(0, 25)
    .map(([name, data]) => ({
      name,
      name_id: data.id,
      total_completions: data.total,
      rewatch_count: data.rewatches,
      avg_score: data.scores.length > 0
        ? data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length
        : null,
      entry_type: data.entryType,
      logs: data.logs.sort((left, right) => {
        if (left.completion_date === null && right.completion_date === null) return 0;
        if (left.completion_date === null) return 1;
        if (right.completion_date === null) return -1;
        return left.completion_date.localeCompare(right.completion_date);
      }),
    }));
}

/**
 * Derives every FullStats list from one dataset. Without `requiredLists` all
 * lists are computed; with it, lists outside the set are returned empty — the
 * plate passes the set implied by its four slotted panels so a brush frame
 * never pays for lists nothing on screen can read. `dailyCompletions` is always
 * computed because the timeline overlay's heatmap is openable at any moment.
 */
export function buildFullStatsFromDataset(dataset: StatsDataset, requiredLists?: StatsListRequirement): FullStats {
  const needs = (listId: StatsListId) => requiredLists === undefined || requiredLists.has(listId);
  const basicStats = selectBasicStats(dataset);

  // entry_type feeds two lists; count it once when either is required, and
  // gate each derivation on its own need so an unrequired list stays empty.
  const entryTypeItems =
    needs("mediaTypeBreakdown") || needs("averageScoreByType")
      ? countFieldWithScores(dataset.entries, "entry_type")
      : null;

  return {
    ...basicStats,
    ratings: needs("ratings") ? selectRatingDistribution(dataset) : [],
    genres: needs("genres") ? selectGenres(dataset) : [],
    platforms: needs("platforms") ? selectPlatforms(dataset) : [],
    franchises: needs("franchises") ? selectFranchises(dataset) : [],
    series: needs("series") ? selectSeries(dataset) : [],
    studios: needs("studios") ? selectStudios(dataset) : [],
    authors: needs("authors") ? selectAuthors(dataset) : [],
    actresses: needs("actresses") ? selectActresses(dataset) : [],
    mediaTypeBreakdown: needs("mediaTypeBreakdown") && entryTypeItems !== null ? entryTypeItems.slice(0, 15) : [],
    multiLogDays: needs("multiLogDays") ? selectMultiLogDays(dataset) : [],
    averageScoreByType: needs("averageScoreByType") && entryTypeItems !== null ? toAverageScoreByType(entryTypeItems) : [],
    dailyCompletions: selectDailyCompletions(dataset),
    mostReplayed: needs("mostReplayed") ? selectMostReplayed(dataset) : [],
  };
}

// Compatibility facade for non-Plate callers. Keep the data-layer import lazy
// so worker bundles that use only the pure selectors never pull Tauri/SQLite
// code (or Window-only globals) into their execution context.
async function getFilteredEntries(yearFilter?: string): Promise<StatsEntry[]> {
  const { dbService } = await import("./db");
  return dbService.getStatsEntries(yearFilter);
}

export const statsLogic = { getFilteredEntries };
