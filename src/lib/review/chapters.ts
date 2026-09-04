import type { StatsEntry } from "../db";
import type { StatItem, TimelineBucket } from "../stats-logic";
import { selectBookends } from "./context";
import {
  REEL_CHAPTER_IDS,
  type AssembledReel,
  type ReelChapterId,
  type ReelChapterSpec,
  type ReviewAward,
  type ReviewBookends,
  type ReviewComparison,
  type ReviewContext,
} from "./types";

/**
 * Every threshold in one place, so unlock policy is tunable rather than
 * scattered through the specs as magic numbers.
 */
export const REEL_UNLOCKS = {
  /** Distinct genres before the constellation is worth drawing. */
  constellationGenres: 8,
  /** Entries in the top franchise before it counts as an obsession. */
  franchiseDepth: 3,
  /** Dated completions needed to have two ends to a year. */
  bookendsEntries: 2,
  /** Perfect scores needed for the perfect-tens chapter. */
  perfectTens: 1,
  /** Ratings needed before a score distribution says anything. */
  ratedEntries: 4,
} as const;

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Entries worth putting in a cover strip — a fallback tile reads as broken. */
function withCovers(entries: StatsEntry[]): StatsEntry[] {
  return entries.filter(
    (entry) => typeof entry.image_url === "string" && entry.image_url.trim().length > 0,
  );
}

// ─── Per-chapter data shapes ─────────────────────────────────────────────────

export interface OverviewData {
  total: number;
  avgScore: number;
  typeCount: number;
  replays: number;
}

export interface TypeChampionData {
  champion: StatItem;
  breakdown: StatItem[];
  total: number;
  share: number;
}

export interface BiggestMonthData {
  monthName: string;
  count: number;
  months: TimelineBucket[];
  entries: StatsEntry[];
}

export interface TopGenreData {
  top: StatItem;
  runnersUp: StatItem[];
}

export interface ConstellationData {
  genres: StatItem[];
}

export interface TopFranchiseData {
  top: StatItem;
  others: StatItem[];
}

export interface RatingsData {
  bars: StatItem[];
  mostCommon: StatItem;
  avgScore: number;
  ratedCount: number;
}

export interface PerfectTensData {
  entries: StatsEntry[];
  count: number;
}

export interface AwardsData {
  awards: ReviewAward[];
}

export interface SignatureData {
  entry: StatsEntry;
  note: string | null;
  score: number;
  isOnlyPerfect: boolean;
}

export interface FinaleData {
  total: number;
  perfectCount: number;
  avgScore: number;
  typeCount: number;
  replays: number;
  highlights: StatsEntry[];
}

export type BookendsData = ReviewBookends;
export type VersusData = ReviewComparison;

// ─── Specs ───────────────────────────────────────────────────────────────────

const overview: ReelChapterSpec<OverviewData> = {
  id: "overview",
  label: "The Opening",
  build: (ctx) =>
    ctx.basics.total === 0
      ? null
      : {
          total: ctx.basics.total,
          avgScore: ctx.basics.average_score,
          typeCount: ctx.types.length,
          replays: ctx.basics.rewatch_count,
        },
};

const typeChampion: ReelChapterSpec<TypeChampionData> = {
  id: "type-champion",
  label: "Your Medium",
  build: (ctx) => {
    const [champion, ...rest] = ctx.types;
    if (!champion || ctx.basics.total === 0) return null;
    return {
      champion,
      breakdown: [champion, ...rest].slice(0, 6),
      total: ctx.basics.total,
      share: champion.count / ctx.basics.total,
    };
  },
};

const biggestMonth: ReelChapterSpec<BiggestMonthData> = {
  id: "biggest-month",
  label: "Biggest Month",
  // A single-month review has no month to crown.
  build: (ctx) => {
    if (ctx.period.month != null) return null;
    const ranked = [...ctx.months].sort((left, right) => right.completions - left.completions);
    const peak = ranked[0];
    if (!peak || peak.completions === 0) return null;

    const monthIndex = ctx.months.indexOf(peak);
    const entries = ctx.datedEntries.filter(
      (entry) => entry.completion_date?.slice(5, 7) === String(monthIndex + 1).padStart(2, "0"),
    );

    return {
      monthName: MONTH_LABELS[monthIndex] ?? peak.label,
      count: peak.completions,
      months: ctx.months,
      entries: withCovers(entries).slice(-10),
    };
  },
  backdropPool: (data) => data.entries,
};

const bookends: ReelChapterSpec<BookendsData> = {
  id: "bookends",
  label: "The Bookends",
  unlock: {
    test: (ctx) => ctx.datedEntries.length >= REEL_UNLOCKS.bookendsEntries,
    condition: "Log two dated completions",
  },
  build: (ctx) => selectBookends(ctx.datedEntries),
  backdropPool: (data) => [data.first, data.last],
};

const topGenre: ReelChapterSpec<TopGenreData> = {
  id: "top-genre",
  label: "Genre of Choice",
  build: (ctx) => {
    const [top, ...runnersUp] = ctx.genres;
    return top ? { top, runnersUp: runnersUp.slice(0, 7) } : null;
  },
};

const constellation: ReelChapterSpec<ConstellationData> = {
  id: "constellation",
  label: "Constellation",
  unlock: {
    test: (ctx) => ctx.genres.length >= REEL_UNLOCKS.constellationGenres,
    condition: `Reach ${REEL_UNLOCKS.constellationGenres} genres in a year`,
  },
  build: (ctx) => (ctx.genres.length > 1 ? { genres: ctx.genres.slice(0, 35) } : null),
};

const topFranchise: ReelChapterSpec<TopFranchiseData> = {
  id: "top-franchise",
  label: "The Obsession",
  unlock: {
    test: (ctx) => (ctx.franchises[0]?.count ?? 0) >= REEL_UNLOCKS.franchiseDepth,
    condition: `Finish ${REEL_UNLOCKS.franchiseDepth} in one franchise`,
  },
  build: (ctx) => {
    const [top, ...others] = ctx.franchises;
    return top ? { top, others: others.slice(0, 4) } : null;
  },
};

const ratings: ReelChapterSpec<RatingsData> = {
  id: "ratings",
  label: "How You Rated",
  unlock: {
    test: (ctx) => ctx.dataset.ratedEntries.length >= REEL_UNLOCKS.ratedEntries,
    condition: `Rate ${REEL_UNLOCKS.ratedEntries} entries`,
  },
  build: (ctx) => {
    if (ctx.dataset.ratedEntries.length === 0) return null;
    const mostCommon = ctx.ratings.reduce(
      (best, bar) => (bar.count > best.count ? bar : best),
      ctx.ratings[0],
    );
    if (!mostCommon) return null;
    return {
      bars: ctx.ratings,
      mostCommon,
      avgScore: ctx.basics.average_score,
      ratedCount: ctx.dataset.ratedEntries.length,
    };
  },
};

const perfectTens: ReelChapterSpec<PerfectTensData> = {
  id: "perfect-tens",
  label: "Perfect Tens",
  unlock: {
    test: (ctx) => ctx.basics.perfectTenCount >= REEL_UNLOCKS.perfectTens,
    condition: "Give something a 10",
  },
  // Strict === 10, matching selectBasicStats rather than the rounded buckets.
  build: (ctx) => {
    const entries = ctx.dataset.ratedEntries.filter((entry) => entry.review_score === 10);
    return entries.length > 0 ? { entries, count: entries.length } : null;
  },
  backdropPool: (data) => data.entries,
};

const versus: ReelChapterSpec<VersusData> = {
  id: "versus",
  label: "You vs. Last Year",
  unlock: {
    test: (ctx) => ctx.comparison !== null,
    condition: "Log an earlier year",
  },
  // The comparison is whole-year on both sides; inside a single month it
  // would measure a month against a year.
  build: (ctx) => (ctx.period.month == null ? ctx.comparison : null),
};

const awards: ReelChapterSpec<AwardsData> = {
  id: "awards",
  label: "Award Night",
  unlock: {
    test: (ctx) => ctx.awards.length > 0,
    condition: "Pick your award winners",
  },
  // Awards are a whole-year concept; a single month has none of its own.
  build: (ctx) =>
    ctx.period.month == null && ctx.awards.length > 0 ? { awards: ctx.awards } : null,
};

const signature: ReelChapterSpec<SignatureData> = {
  id: "signature",
  label: "No. 01 of the Year",
  needsNote: true,
  build: (ctx) => {
    const entry = ctx.topEntry;
    if (!entry || entry.review_score == null) return null;
    return {
      entry,
      note: ctx.topNote,
      score: entry.review_score,
      isOnlyPerfect: entry.review_score === 10 && ctx.basics.perfectTenCount === 1,
    };
  },
  backdropPool: (data) => [data.entry],
};

const finale: ReelChapterSpec<FinaleData> = {
  id: "finale",
  label: "The Poster",
  build: (ctx) => {
    if (ctx.basics.total === 0) return null;
    const highlights = withCovers(
      [...ctx.dataset.ratedEntries].sort(
        (left, right) => right.review_score - left.review_score || right.id - left.id,
      ),
    ).slice(0, 12);
    return {
      total: ctx.basics.total,
      perfectCount: ctx.basics.perfectTenCount,
      avgScore: ctx.basics.average_score,
      typeCount: ctx.types.length,
      replays: ctx.basics.rewatch_count,
      highlights,
    };
  },
  backdropPool: (data) => data.highlights,
};

/** Keyed by id; REEL_CHAPTER_IDS holds the play order. */
export const REEL_CHAPTERS: Record<ReelChapterId, ReelChapterSpec<unknown>> = {
  overview,
  "type-champion": typeChampion,
  "biggest-month": biggestMonth,
  bookends,
  "top-genre": topGenre,
  constellation,
  "top-franchise": topFranchise,
  ratings,
  "perfect-tens": perfectTens,
  versus,
  awards,
  signature,
  finale,
};

/**
 * Resolves the reel and the landing screen's tile grid from one context, so a
 * tile can never disagree with what actually plays.
 *
 * Backdrops are assigned only to surviving chapters — running the picker over
 * dropped ones would burn unique covers on frames nobody sees.
 */
export function assembleReel(ctx: ReviewContext): AssembledReel {
  const chapters: AssembledReel["chapters"] = [];
  const tiles: AssembledReel["tiles"] = [];

  for (const id of REEL_CHAPTER_IDS) {
    const spec = REEL_CHAPTERS[id];
    const data = spec.build(ctx);

    // No data at all: the chapter does not exist for this period.
    if (data == null) continue;

    if (spec.unlock && !spec.unlock.test(ctx)) {
      tiles.push({ id, spec, state: "locked", condition: spec.unlock.condition });
      continue;
    }

    tiles.push({ id, spec, state: "ready" });
    chapters.push({
      id,
      spec,
      data,
      backdrop: ctx.backdrops(spec.backdropPool?.(data)),
    });
  }

  return { chapters, tiles };
}

/** True when any surviving chapter needs the top entry's note prefetched. */
export function reelNeedsNote(ctx: ReviewContext): boolean {
  return assembleReel(ctx).chapters.some((chapter) => chapter.spec.needsNote);
}
