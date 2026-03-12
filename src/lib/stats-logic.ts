import { type MediaEntry, dbService } from "./db";

export interface StatItem {
  name: string;
  count: number;
  value?: number;
  color?: string;
  avgScore?: number;
  perfectCount?: number;
  [key: string]: string | number | undefined;
}

export interface FullStats {
  total: number;
  average_score: number;
  rewatch_count: number;
  ratings: StatItem[];
  genres: StatItem[];
  platforms: StatItem[];
  franchises: StatItem[];
  studios: StatItem[];
  authors: StatItem[];
  actresses: StatItem[];
  perfectTenCount: number;
  entriesThisMonth: number;
  monthlyCompletions: { month: string; count: number }[];
  mediaTypeBreakdown: StatItem[];
}

export interface StatsFilters {
  year?: string;
  types?: string[];
}

export interface StatsDataset {
  entries: MediaEntry[];
  ratedEntries: Array<MediaEntry & { review_score: number }>;
  gameEntries: MediaEntry[];
  now: Date;
}

type CountableField =
  | "genre"
  | "platform"
  | "franchise"
  | "director"
  | "author"
  | "actress"
  | "entry_type";

const MONTH_KEYS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function appendStatsFilters(query: string, params: Array<string | number>, filters: StatsFilters) {
  let nextQuery = query;

  if (filters.year && filters.year !== "All Time") {
    params.push(filters.year);
    nextQuery += ` AND year_completed = $${params.length}`;
  }

  if ((filters.types ?? []).length > 0) {
    const selectedTypes = filters.types ?? [];
    const placeholders = selectedTypes.map((_, index) => `$${params.length + index + 1}`).join(", ");
    nextQuery += ` AND entry_type IN (${placeholders})`;
    params.push(...selectedTypes);
  }

  return nextQuery;
}

function hasReviewScore(entry: MediaEntry): entry is MediaEntry & { review_score: number } {
  return typeof entry.review_score === "number" && Number.isFinite(entry.review_score);
}

function isGameEntry(entry: MediaEntry) {
  return typeof entry.entry_type === "string" && entry.entry_type.trim().toLowerCase() === "game";
}

function getMonthFromDate(dateStr: string) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString("default", { month: "short" });
  } catch {
    return "Unknown";
  }
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

function countWithScores(entries: MediaEntry[], fieldName: CountableField): StatItem[] {
  const stats: Record<string, { count: number; totalScore: number; scoreCount: number; perfectCount: number }> = {};

  for (const entry of entries) {
    const rawValue = entry[fieldName];
    if (typeof rawValue !== "string" || rawValue.trim() === "") {
      continue;
    }

    const values = getDelimitedValues(rawValue);
    for (const value of values) {
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

export function createStatsDataset(entries: MediaEntry[], now = new Date()): StatsDataset {
  return {
    entries,
    ratedEntries: entries.filter(hasReviewScore),
    gameEntries: entries.filter(isGameEntry),
    now,
  };
}

export function selectBasicStats(dataset: StatsDataset) {
  const total = dataset.entries.length;
  const rewatch_count = dataset.entries.filter((entry) => Boolean(entry.is_rewatch)).length;
  const perfectTenCount = dataset.ratedEntries.filter((entry) => entry.review_score === 10).length;
  const totalRatedScore = dataset.ratedEntries.reduce((sum, entry) => sum + entry.review_score, 0);
  const average_score = dataset.ratedEntries.length > 0 ? totalRatedScore / dataset.ratedEntries.length : 0;
  const currentMonth = dataset.now.getMonth();
  const currentYear = dataset.now.getFullYear();
  const entriesThisMonth = dataset.entries.filter((entry) => {
    if (!entry.completion_date) {
      return false;
    }

    try {
      const completionDate = new Date(entry.completion_date);
      return completionDate.getMonth() === currentMonth && completionDate.getFullYear() === currentYear;
    } catch {
      return false;
    }
  }).length;

  return {
    total,
    rewatch_count,
    perfectTenCount,
    average_score,
    entriesThisMonth,
  };
}

export function selectRatingDistribution(dataset: StatsDataset): StatItem[] {
  const ratingMap = new Array(11).fill(0);

  for (const entry of dataset.ratedEntries) {
    if (entry.review_score >= 1 && entry.review_score <= 10) {
      ratingMap[entry.review_score] += 1;
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

  return ratings;
}

export function selectMonthlyCompletions(dataset: StatsDataset) {
  const monthlyMap = MONTH_KEYS.reduce<Record<(typeof MONTH_KEYS)[number], number>>((accumulator, month) => {
    accumulator[month] = 0;
    return accumulator;
  }, {} as Record<(typeof MONTH_KEYS)[number], number>);

  for (const entry of dataset.entries) {
    if (!entry.completion_date) {
      continue;
    }

    const month = getMonthFromDate(entry.completion_date);
    if (month in monthlyMap) {
      monthlyMap[month as keyof typeof monthlyMap] += 1;
    }
  }

  return MONTH_KEYS.map((month) => ({
    month,
    count: monthlyMap[month],
  }));
}

export function selectGenres(dataset: StatsDataset) {
  return countWithScores(dataset.entries, "genre").slice(0, 25);
}

export function selectPlatforms(dataset: StatsDataset) {
  return countWithScores(dataset.gameEntries, "platform").slice(0, 25);
}

export function selectFranchises(dataset: StatsDataset) {
  return countWithScores(dataset.gameEntries, "franchise").slice(0, 25);
}

export function selectStudios(dataset: StatsDataset) {
  return countWithScores(dataset.entries, "director").slice(0, 25);
}

export function selectAuthors(dataset: StatsDataset) {
  return countWithScores(dataset.entries, "author").slice(0, 25);
}

export function selectActresses(dataset: StatsDataset) {
  return countWithScores(dataset.entries, "actress").slice(0, 25);
}

export function selectMediaTypeBreakdown(dataset: StatsDataset) {
  return countWithScores(dataset.entries, "entry_type").slice(0, 15);
}

export function buildFullStatsFromDataset(dataset: StatsDataset): FullStats {
  const basicStats = selectBasicStats(dataset);

  return {
    ...basicStats,
    ratings: selectRatingDistribution(dataset),
    genres: selectGenres(dataset),
    platforms: selectPlatforms(dataset),
    franchises: selectFranchises(dataset),
    studios: selectStudios(dataset),
    authors: selectAuthors(dataset),
    actresses: selectActresses(dataset),
    monthlyCompletions: selectMonthlyCompletions(dataset),
    mediaTypeBreakdown: selectMediaTypeBreakdown(dataset),
  };
}

async function getFilteredEntries(filters: StatsFilters): Promise<MediaEntry[]> {
  const db = await dbService.connect();
  const params: Array<string | number> = [];
  let query = "SELECT * FROM entries WHERE 1=1";

  query = appendStatsFilters(query, params, filters);

  return db.select<MediaEntry[]>(query, params);
}

async function getPerfect10Entries(filters: StatsFilters): Promise<MediaEntry[]> {
  const db = await dbService.connect();
  const params: Array<string | number> = [];
  let query = "SELECT * FROM entries WHERE review_score = 10";

  query = appendStatsFilters(query, params, filters);
  query += " ORDER BY completion_date DESC";

  return db.select<MediaEntry[]>(query, params);
}

async function getEntriesByGenre(genre: string, filters: StatsFilters): Promise<MediaEntry[]> {
  const db = await dbService.connect();
  const params: Array<string | number> = [`%${genre}%`];
  let query = "SELECT * FROM entries WHERE genre LIKE $1";

  query = appendStatsFilters(query, params, filters);
  query += " ORDER BY review_score DESC, completion_date DESC";

  const entries = await db.select<MediaEntry[]>(query, params);

  return entries.filter((entry) => getDelimitedValues(entry.genre).includes(genre));
}

async function getThisMonthEntries(filters: StatsFilters): Promise<MediaEntry[]> {
  const db = await dbService.connect();
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split("T")[0];
  const params: Array<string | number> = [startDate, endDate];
  let query = "SELECT * FROM entries WHERE completion_date >= $1 AND completion_date < $2";

  query = appendStatsFilters(query, params, filters);
  query += " ORDER BY completion_date DESC";

  return db.select<MediaEntry[]>(query, params);
}

export const statsSelectors = {
  createStatsDataset,
  selectBasicStats,
  selectRatingDistribution,
  selectMonthlyCompletions,
  selectGenres,
  selectPlatforms,
  selectFranchises,
  selectStudios,
  selectAuthors,
  selectActresses,
  selectMediaTypeBreakdown,
  buildFullStatsFromDataset,
};

export const statsLogic = {
  async getStats(yearFilter?: string, typeFilter: string[] = []): Promise<FullStats> {
    const entries = await getFilteredEntries({ year: yearFilter, types: typeFilter });
    return buildFullStatsFromDataset(createStatsDataset(entries));
  },

  async getFilteredEntries(yearFilter?: string, typeFilter: string[] = []) {
    return getFilteredEntries({ year: yearFilter, types: typeFilter });
  },

  async getPerfect10Entries(yearFilter?: string, typeFilter: string[] = []) {
    return getPerfect10Entries({ year: yearFilter, types: typeFilter });
  },

  async getEntriesByGenre(genre: string, yearFilter?: string, typeFilter: string[] = []) {
    return getEntriesByGenre(genre, { year: yearFilter, types: typeFilter });
  },

  async getThisMonthEntries(yearFilter?: string, typeFilter: string[] = []) {
    return getThisMonthEntries({ year: yearFilter, types: typeFilter });
  },
};
