import type { StatsEntry } from "../db";
import type { DailyCompletion, StatItem, StatsDataset, TimelineBucket } from "../stats-logic";

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface ReviewParams {
  year: number;
  /** 1-12. Undefined means the whole year. */
  month?: number;
  typeFilter: string[];
}

// ─── Query row shapes ────────────────────────────────────────────────────────

/**
 * One row per (year, entry_type). Deliberately *not* filtered by the user's
 * type selection: the selection is applied in JS so the Customise sheet never
 * invalidates this cache, and the year-over-year comparison respects the
 * filter for free.
 */
export interface ReviewYearTypeRow {
  year: number;
  type: string | null;
  total: number;
  /** SUM(review_score) — null when nothing in the bucket was rated. */
  score_sum: number | null;
  /** Count of rows carrying a score; the divisor for a weighted average. */
  rated: number;
}

export interface ReviewYearCoverRow {
  year: number;
  cover_path: string | null;
}

export interface ReviewAward {
  category: string;
  winner: string;
  imageUrl: string | null;
  entryType: string | null;
  score: number | null;
}

// ─── Derived ─────────────────────────────────────────────────────────────────

export interface ReviewYearTotal {
  year: number;
  count: number;
  /** Weighted mean across the selected types, or null when nothing is rated. */
  avgScore: number | null;
  coverPath: string | null;
}

export interface ReviewComparison {
  currentYear: number;
  previousYear: number;
  currentCount: number;
  previousCount: number;
  currentAvg: number | null;
  previousAvg: number | null;
  /** currentCount - previousCount. */
  countDelta: number;
  /** Fractional change, or null when the previous year was empty. */
  countRatio: number | null;
}

export interface ReviewBookends {
  first: StatsEntry;
  last: StatsEntry;
  /** Whole days between the two completion dates. Zero when both fall on one day. */
  dayGap: number;
}

/** Assigns each chapter a backdrop, preferring unused covers from its own pool. */
export type BackdropPicker = (
  primary: Array<{ image_url: string | null }> | undefined,
) => string | null;

/**
 * Everything a chapter can read, derived once per (year, month, typeFilter).
 * Pure — built by buildReviewContext with no I/O of its own.
 */
export interface ReviewContext {
  period: { year: number; month?: number; label: string };
  typeFilter: string[];
  dataset: StatsDataset;
  basics: {
    total: number;
    rewatch_count: number;
    perfectTenCount: number;
    average_score: number;
    entriesThisMonth: number;
  };
  ratings: StatItem[];
  /** Uncapped, unlike selectGenres which slices to 25. */
  genres: StatItem[];
  /** Across all entries, not just games — selectFranchises is game-scoped. */
  franchises: StatItem[];
  types: StatItem[];
  months: TimelineBucket[];
  daily: DailyCompletion[];
  /**
   * In-period entries with a usable completion_date, ascending. Rows whose
   * completion_date year disagrees with year_completed are excluded — the two
   * columns are independent and nothing enforces they agree.
   */
  datedEntries: StatsEntry[];
  /** Highest score, id DESC as tiebreak. Null when nothing in range is rated. */
  topEntry: StatsEntry | null;
  /** The top entry's free-text note. Null until the reel fetches it. */
  topNote: string | null;
  comparison: ReviewComparison | null;
  awards: ReviewAward[];
  backdrops: BackdropPicker;
}

// ─── Chapters ────────────────────────────────────────────────────────────────

export const REEL_CHAPTER_IDS = [
  "overview",
  "type-champion",
  "biggest-month",
  "bookends",
  "top-genre",
  "constellation",
  "top-franchise",
  "ratings",
  "perfect-tens",
  "versus",
  "awards",
  "signature",
  "finale",
] as const;

export type ReelChapterId = (typeof REEL_CHAPTER_IDS)[number];

/**
 * A chapter's identity and gating, with no rendering attached — this file and
 * chapters.ts stay free of React so the gating stays pure and testable by
 * inspection. Icons and renderers live beside the components, in
 * components/review/reel/chapters, keyed by the same id.
 */
export interface ReelChapterSpec<D = unknown> {
  id: ReelChapterId;
  /** Tile label on the landing screen, and the reel's accessible chapter name. */
  label: string;
  /**
   * Threshold gate. When the test fails the chapter is skipped in the reel but
   * its tile stays visible, greyed, showing `condition`. Absent means the
   * chapter can never be locked — only dropped for want of data.
   */
  unlock?: { test: (ctx: ReviewContext) => boolean; condition: string };
  /** Data gate. Returning null drops the chapter from the reel and the grid. */
  build: (ctx: ReviewContext) => D | null;
  /**
   * Preferred backdrop pool; falls back to the whole period.
   *
   * Declared as a method rather than a property so the parameter is bivariant
   * and a ReelChapterSpec<SomethingSpecific> stays assignable to
   * ReelChapterSpec<unknown> — which is what lets the registry hold thirteen
   * differently-typed specs and the assembler walk them uniformly.
   */
  backdropPool?(data: D): Array<{ image_url: string | null }> | undefined;
  /** True when the chapter reads ctx.topNote, so the reel prefetches it. */
  needsNote?: boolean;
}

export interface AssembledChapter {
  id: ReelChapterId;
  spec: ReelChapterSpec<unknown>;
  data: unknown;
  backdrop: string | null;
}

export type ChapterTileState = "ready" | "locked";

export interface AssembledTile {
  id: ReelChapterId;
  spec: ReelChapterSpec<unknown>;
  state: ChapterTileState;
  condition?: string;
}

export interface AssembledReel {
  chapters: AssembledChapter[];
  tiles: AssembledTile[];
}

// ─── Poster ──────────────────────────────────────────────────────────────────

export interface PosterStat {
  label: string;
  value: string;
  /** Optional accent for the figure; defaults to white. */
  accent?: string;
}

export interface PosterRow {
  rank: number;
  name: string;
  type: string | null;
  score: number | null;
}

export interface PosterData {
  year: number;
  label: string;
  /** One-line archetype read, e.g. "You were The Devotee." */
  archetype: string;
  headline: string;
  stats: PosterStat[];
  top5: PosterRow[];
  /** Genre weights, 0-1, driving the generated bloom. */
  bloom: number[];
  footer: string;
}
