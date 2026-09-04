import type { StatsEntry } from "../db";
import {
  countFieldWithScores,
  createStatsDataset,
  selectBasicStats,
  selectDailyCompletions,
  selectMediaTypeBreakdown,
  selectRatingDistribution,
  selectTimelineSeries,
} from "../stats-logic";
import type {
  BackdropPicker,
  ReviewAward,
  ReviewBookends,
  ReviewComparison,
  ReviewContext,
  ReviewParams,
  ReviewYearCoverRow,
  ReviewYearTotal,
  ReviewYearTypeRow,
} from "./types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * True when the row's completion_date actually falls inside the period.
 *
 * year_completed and completion_date are independent columns and nothing
 * enforces they agree, so a row filed under 2025 can carry a 2024-12-30 date.
 * Every date-driven chapter (Bookends, Biggest Month, the month grid) has to
 * filter on the date itself or it reports the wrong "first thing you finished".
 */
function isInPeriod(entry: StatsEntry, year: number, month?: number): boolean {
  const date = entry.completion_date;
  if (typeof date !== "string" || date.length < 7) return false;
  if (!date.startsWith(`${year}-`)) return false;
  if (month == null) return true;
  return date.startsWith(`${year}-${String(month).padStart(2, "0")}`);
}

/** Small deterministic PRNG, so a given run always draws the same frames. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Assigns backdrops without repeating a cover while unused ones remain.
 *
 * Seeded rather than Math.random (which the original used): the context is
 * rebuilt whenever anything derived changes — including the note arriving
 * asynchronously mid-playback — and an unseeded picker would reshuffle every
 * chapter's backdrop underneath the viewer. It also means a given year always
 * looks the same, which is what you want of a keepsake.
 */
function createBackdropPicker(
  pool: Array<{ image_url: string | null }>,
  seed: number,
): BackdropPicker {
  const used = new Set<string>();
  const random = mulberry32(seed);

  const paths = (source: Array<{ image_url: string | null }>) => [
    ...new Set(
      source
        .map((entry) => entry.image_url)
        .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
        .map((url) => url.trim()),
    ),
  ];

  const fallbackPaths = paths(pool);

  return (primary) => {
    const primaryPaths = primary ? paths(primary) : [];
    const candidates = [
      primaryPaths.filter((path) => !used.has(path)),
      primaryPaths,
      fallbackPaths.filter((path) => !used.has(path)),
      fallbackPaths,
    ].find((list) => list.length > 0);

    if (!candidates || candidates.length === 0) return null;

    const selected = candidates[Math.floor(random() * candidates.length)];
    used.add(selected);
    return selected;
  };
}

/**
 * Per-year totals across the selected types, with the weighted average
 * recomputed from the score sums so the filter is honoured exactly.
 */
export function selectYearTotals(
  rows: ReviewYearTypeRow[],
  typeFilter: string[],
  covers: ReviewYearCoverRow[] = [],
): ReviewYearTotal[] {
  const allowed = new Set(typeFilter);
  const byYear = new Map<number, { count: number; scoreSum: number; rated: number }>();

  for (const row of rows) {
    if (row.type != null && !allowed.has(row.type)) continue;
    const bucket = byYear.get(row.year) ?? { count: 0, scoreSum: 0, rated: 0 };
    bucket.count += row.total;
    bucket.scoreSum += row.score_sum ?? 0;
    bucket.rated += row.rated;
    byYear.set(row.year, bucket);
  }

  const coverByYear = new Map(covers.map((row) => [row.year, row.cover_path]));

  return [...byYear.entries()]
    .filter(([, bucket]) => bucket.count > 0)
    .map(([year, bucket]) => ({
      year,
      count: bucket.count,
      avgScore: bucket.rated > 0 ? bucket.scoreSum / bucket.rated : null,
      coverPath: coverByYear.get(year) ?? null,
    }))
    .sort((left, right) => right.year - left.year);
}

/** The most recent earlier year that has entries under the current filter. */
export function selectComparison(
  rows: ReviewYearTypeRow[],
  year: number,
  typeFilter: string[],
): ReviewComparison | null {
  const totals = selectYearTotals(rows, typeFilter);
  const current = totals.find((entry) => entry.year === year);
  const previous = totals.filter((entry) => entry.year < year).sort((a, b) => b.year - a.year)[0];
  if (!current || !previous) return null;

  return {
    currentYear: current.year,
    previousYear: previous.year,
    currentCount: current.count,
    previousCount: previous.count,
    currentAvg: current.avgScore,
    previousAvg: previous.avgScore,
    countDelta: current.count - previous.count,
    countRatio: previous.count > 0 ? (current.count - previous.count) / previous.count : null,
  };
}

/** First and last dated completion of the period, with the gap between them. */
export function selectBookends(datedEntries: StatsEntry[]): ReviewBookends | null {
  if (datedEntries.length < 2) return null;
  const first = datedEntries[0];
  const last = datedEntries[datedEntries.length - 1];
  if (!first.completion_date || !last.completion_date) return null;

  const firstTime = Date.parse(first.completion_date);
  const lastTime = Date.parse(last.completion_date);
  if (Number.isNaN(firstTime) || Number.isNaN(lastTime)) return null;

  return { first, last, dayGap: Math.round((lastTime - firstTime) / 86_400_000) };
}

export interface ReviewContextInput {
  params: ReviewParams;
  /** Thin rows for the year, unfiltered by type — filtering happens here. */
  entries: StatsEntry[];
  yearTypeRows: ReviewYearTypeRow[];
  awards: ReviewAward[];
  /** The top entry's note, once the reel has fetched it. */
  topNote?: string | null;
  now?: Date;
}

/**
 * Derives everything the chapters read. Pure: no I/O, no React, no randomness
 * beyond the backdrop picker.
 */
export function buildReviewContext(input: ReviewContextInput): ReviewContext {
  const { params, yearTypeRows, awards } = input;
  const allowed = new Set(params.typeFilter);

  // Types are filtered here rather than in SQL so the shared statsForYear cache
  // stays valid for the Stats screen, and so toggling a chip costs no query.
  const scoped = input.entries.filter((entry) => {
    if (entry.entry_type != null && !allowed.has(entry.entry_type)) return false;
    if (params.month != null) return isInPeriod(entry, params.year, params.month);
    return true;
  });

  const dataset = createStatsDataset(scoped, input.now ?? new Date());

  const datedEntries = scoped
    .filter((entry) => isInPeriod(entry, params.year, params.month))
    .sort((left, right) => (left.completion_date ?? "").localeCompare(right.completion_date ?? ""));

  // Strict === 10 rather than a rounded bucket, so this agrees with
  // selectBasicStats.perfectTenCount and the rest of the app.
  const topEntry =
    dataset.ratedEntries.length > 0
      ? dataset.ratedEntries.reduce((best, entry) =>
          entry.review_score > best.review_score ||
          (entry.review_score === best.review_score && entry.id > best.id)
            ? entry
            : best,
        )
      : null;

  const label =
    params.month != null
      ? `${MONTH_NAMES[params.month - 1]} ${params.year}`
      : `${params.year}`;

  return {
    period: { year: params.year, month: params.month, label },
    typeFilter: params.typeFilter,
    dataset,
    basics: selectBasicStats(dataset),
    ratings: selectRatingDistribution(dataset),
    // Uncapped — selectGenres slices to 25 and the constellation wants more.
    genres: countFieldWithScores(dataset.entries, "genre"),
    // Across every entry — selectFranchises only looks at games.
    franchises: countFieldWithScores(dataset.entries, "franchise"),
    types: selectMediaTypeBreakdown(dataset),
    months: selectTimelineSeries(dataset, "month"),
    daily: selectDailyCompletions(dataset),
    datedEntries,
    topEntry,
    topNote: input.topNote ?? null,
    comparison: selectComparison(yearTypeRows, params.year, params.typeFilter),
    awards,
    // Seeded off the period so the same run always draws the same frames.
    backdrops: createBackdropPicker(scoped, params.year * 100 + (params.month ?? 0)),
  };
}
