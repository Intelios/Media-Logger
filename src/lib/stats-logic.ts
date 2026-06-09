import { type MediaEntry, dbService, adultExclusionSql } from "./db";

export interface StatItem {
  name: string;
  count: number;
  value?: number;
  color?: string;
  avgScore?: number;
  perfectCount?: number;
  [key: string]: string | number | undefined;
}

export interface ScoreTimelinePoint {
  label: string;
  averageScore: number | null;
  count: number;
}

export interface ComparisonSeries {
  monthlyCompletions: { month: string; count: number }[];
  scoreTimeline: ScoreTimelinePoint[];
}

export interface MultiLogDayEntry {
  id: number;
  name: string;
  entry_type: string | null;
  review_score: number | null;
}

export interface MultiLogDay {
  date: string;
  entries: MultiLogDayEntry[];
}

export interface DailyCompletion {
  date: string;
  count: number;
}

export interface MostReplayedItem {
  name: string;
  name_id: number;
  total_completions: number;
  rewatch_count: number;
  avg_score: number | null;
  entry_type: string | null;
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
  monthlyCompletions: { month: string; count: number }[];
  mediaTypeBreakdown: StatItem[];
  multiLogDays: MultiLogDay[];
  scoreTimeline: ScoreTimelinePoint[];
  scoreTimelineGranularity: "month" | "year";
  averageScoreByType: StatItem[];
  dailyCompletions: DailyCompletion[];
  mostReplayed: MostReplayedItem[];
}

export interface StatsFilters {
  year?: string;
  types?: string[];
}

export interface StatsDataset {
  entries: MediaEntry[];
  ratedEntries: Array<MediaEntry & { review_score: number }>;
  gameEntries: MediaEntry[];
  tvEntries: MediaEntry[];
  now: Date;
}

type CountableField =
  | "genre"
  | "platform"
  | "franchise"
  | "series"
  | "director"
  | "author"
  | "actress"
  | "entry_type";

const MONTH_KEYS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function getTimelineGranularity(filters: StatsFilters): "month" | "year" {
  return filters.year && filters.year !== "All Time" ? "month" : "year";
}

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

  // Exclude adult entries from every stat (totals, averages, breakdowns,
  // widgets) when the Adult Media setting is off. No-op when enabled.
  nextQuery += adultExclusionSql();

  return nextQuery;
}

function hasReviewScore(entry: MediaEntry): entry is MediaEntry & { review_score: number } {
  return typeof entry.review_score === "number" && Number.isFinite(entry.review_score);
}

function isGameEntry(entry: MediaEntry) {
  return typeof entry.entry_type === "string" && entry.entry_type.trim().toLowerCase() === "game";
}

function isTvEntry(entry: MediaEntry) {
  return typeof entry.entry_type === "string" && ["show", "k-drama", "anime"].includes(entry.entry_type.trim().toLowerCase());
}

function getMonthFromDate(dateStr: string) {
  // completion_date is stored as "YYYY-MM-DD"; parse the month directly so the
  // label is locale-independent and always matches MONTH_KEYS.
  const monthIndex = Number(dateStr.slice(5, 7)) - 1;
  return MONTH_KEYS[monthIndex] ?? "Unknown";
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
    tvEntries: entries.filter(isTvEntry),
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

export function selectSeries(dataset: StatsDataset) {
  return countWithScores(dataset.tvEntries, "series").slice(0, 25);
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

export function selectScoreTimeline(dataset: StatsDataset, granularity: "month" | "year"): ScoreTimelinePoint[] {
  if (granularity === "month") {
    const monthlyScores = MONTH_KEYS.reduce<
      Record<(typeof MONTH_KEYS)[number], { totalScore: number; count: number }>
    >((accumulator, month) => {
      accumulator[month] = { totalScore: 0, count: 0 };
      return accumulator;
    }, {} as Record<(typeof MONTH_KEYS)[number], { totalScore: number; count: number }>);

    for (const entry of dataset.ratedEntries) {
      if (!entry.completion_date) {
        continue;
      }

      const month = getMonthFromDate(entry.completion_date);
      if (month in monthlyScores) {
        monthlyScores[month as keyof typeof monthlyScores].totalScore += entry.review_score;
        monthlyScores[month as keyof typeof monthlyScores].count += 1;
      }
    }

    return MONTH_KEYS.map((month) => ({
      label: month,
      averageScore: monthlyScores[month].count > 0 ? monthlyScores[month].totalScore / monthlyScores[month].count : null,
      count: monthlyScores[month].count,
    }));
  }

  const yearlyScores = new Map<string, { totalScore: number; count: number }>();

  for (const entry of dataset.ratedEntries) {
    if (!entry.completion_date) {
      continue;
    }

    try {
      const yearLabel = new Date(entry.completion_date).getFullYear().toString();
      const current = yearlyScores.get(yearLabel) ?? { totalScore: 0, count: 0 };
      current.totalScore += entry.review_score;
      current.count += 1;
      yearlyScores.set(yearLabel, current);
    } catch {
      // Ignore invalid dates.
    }
  }

  return [...yearlyScores.entries()]
    .sort(([leftYear], [rightYear]) => Number(leftYear) - Number(rightYear))
    .map(([label, value]) => ({
      label,
      averageScore: value.count > 0 ? value.totalScore / value.count : null,
      count: value.count,
    }));
}

export function selectAverageScoreByType(dataset: StatsDataset) {
  return countWithScores(dataset.entries, "entry_type")
    .filter((item) => item.avgScore !== undefined)
    .sort((left, right) => {
      const avgDiff = (right.avgScore ?? 0) - (left.avgScore ?? 0);
      return avgDiff !== 0 ? avgDiff : right.count - left.count;
    })
    .slice(0, 8);
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
    { total: number; rewatches: number; id: number; scores: number[]; entryType: string | null }
  >();

  for (const entry of dataset.entries) {
    const existing = groups.get(entry.name);
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
    } else {
      groups.set(entry.name, {
        total: 1,
        rewatches: Boolean(entry.is_rewatch) ? 1 : 0,
        id: entry.id,
        scores: hasReviewScore(entry) ? [entry.review_score] : [],
        entryType: entry.entry_type ?? null,
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
    }));
}

export function buildFullStatsFromDataset(dataset: StatsDataset, filters: StatsFilters = {}): FullStats {
  const basicStats = selectBasicStats(dataset);
  const timelineGranularity = getTimelineGranularity(filters);

  return {
    ...basicStats,
    ratings: selectRatingDistribution(dataset),
    genres: selectGenres(dataset),
    platforms: selectPlatforms(dataset),
    franchises: selectFranchises(dataset),
    series: selectSeries(dataset),
    studios: selectStudios(dataset),
    authors: selectAuthors(dataset),
    actresses: selectActresses(dataset),
    monthlyCompletions: selectMonthlyCompletions(dataset),
    mediaTypeBreakdown: selectMediaTypeBreakdown(dataset),
    multiLogDays: selectMultiLogDays(dataset),
    scoreTimeline: selectScoreTimeline(dataset, timelineGranularity),
    scoreTimelineGranularity: timelineGranularity,
    averageScoreByType: selectAverageScoreByType(dataset),
    dailyCompletions: selectDailyCompletions(dataset),
    mostReplayed: selectMostReplayed(dataset),
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

async function getEntriesByCompletionDate(date: string, filters: StatsFilters): Promise<MediaEntry[]> {
  const db = await dbService.connect();
  const params: Array<string | number> = [date];
  let query = "SELECT * FROM entries WHERE completion_date = $1";

  query = appendStatsFilters(query, params, filters);
  query += " ORDER BY id DESC";

  return db.select<MediaEntry[]>(query, params);
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
  selectMultiLogDays,
  selectScoreTimeline,
  selectAverageScoreByType,
  buildFullStatsFromDataset,
};

export const statsLogic = {
  async getStats(yearFilter?: string, typeFilter: string[] = []): Promise<FullStats> {
    const entries = await getFilteredEntries({ year: yearFilter, types: typeFilter });
    return buildFullStatsFromDataset(createStatsDataset(entries), { year: yearFilter, types: typeFilter });
  },

  // Lightweight fetch for the per-widget "Compare year" overlay. A comparison year is always a
  // specific year, so the score timeline is computed at month granularity to line up with the
  // active chart's Jan–Dec axis. Filters (types + adult exclusion) are honoured via getFilteredEntries.
  async getComparisonSeries(year: string, typeFilter: string[] = []): Promise<ComparisonSeries> {
    const entries = await getFilteredEntries({ year, types: typeFilter });
    const dataset = createStatsDataset(entries);
    return {
      monthlyCompletions: selectMonthlyCompletions(dataset),
      scoreTimeline: selectScoreTimeline(dataset, "month"),
    };
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

  async getEntriesByCompletionDate(date: string, yearFilter?: string, typeFilter: string[] = []) {
    return getEntriesByCompletionDate(date, { year: yearFilter, types: typeFilter });
  },

  async getThisMonthEntries(yearFilter?: string, typeFilter: string[] = []) {
    return getThisMonthEntries({ year: yearFilter, types: typeFilter });
  },
};
