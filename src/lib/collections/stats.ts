import type { CollectionItemView, Era } from "../collections-logic";
import { createStatsDataset, selectBasicStats, selectGenres, type StatItem } from "../stats-logic";

// One row in the "Average Rating by Era" breakdown. Only eras with at least
// one assigned item get a row; items without an era are simply not part of
// this breakdown — not everything has to be in an era.
export interface CollectionEraStat {
  eraId: number;
  name: string;
  color: string;
  count: number;
  ratedCount: number;
  averageScore: number | null;
  perfectCount: number;
}

export interface CollectionStatsSummary {
  itemCount: number;
  ratedCount: number;
  averageScore: number | null;
  perfectTenCount: number;
  rewatchCount: number;
  distinctGenreCount: number;
  eraStats: CollectionEraStat[];
  genres: StatItem[];
  topRated: Array<CollectionItemView & { review_score: number }>;
}

const TOP_RATED_LIMIT = 12;

function hasScore(item: CollectionItemView): item is CollectionItemView & { review_score: number } {
  return typeof item.review_score === "number" && Number.isFinite(item.review_score);
}

function buildEraStat(
  eraId: number,
  name: string,
  color: string,
  members: CollectionItemView[]
): CollectionEraStat {
  let totalScore = 0;
  let ratedCount = 0;
  let perfectCount = 0;

  for (const item of members) {
    if (typeof item.review_score === "number" && Number.isFinite(item.review_score)) {
      totalScore += item.review_score;
      ratedCount += 1;
      if (item.review_score === 10) {
        perfectCount += 1;
      }
    }
  }

  return {
    eraId,
    name,
    color,
    count: members.length,
    ratedCount,
    averageScore: ratedCount > 0 ? totalScore / ratedCount : null,
    perfectCount,
  };
}

// Pure derivation over the item rows the Collections page already holds in
// state — no queries. `CollectionItemView` is structurally assignable to
// `StatsEntry`, so the shared stats-logic selectors work untouched.
export function deriveCollectionStats(items: CollectionItemView[], eras: Era[]): CollectionStatsSummary {
  const dataset = createStatsDataset(items);
  const basic = selectBasicStats(dataset);
  const genres = selectGenres(dataset);

  // Same comma-split convention as stats-logic's counters, but counted without
  // the 25-row display cap so the headline number never plateaus.
  const distinctGenres = new Set<string>();
  for (const item of items) {
    if (!item.genre) continue;
    for (const part of item.genre.split(",")) {
      const value = part.trim();
      if (value) distinctGenres.add(value);
    }
  }

  const eraStats: CollectionEraStat[] = [];
  for (const era of eras) {
    const members = items.filter((item) => item.era_id === era.id);
    if (members.length === 0) continue;
    eraStats.push(buildEraStat(era.id, era.name, era.color, members));
  }

  const topRated = items
    .filter(hasScore)
    .sort((left, right) => {
      const scoreDiff = right.review_score - left.review_score;
      if (scoreDiff !== 0) return scoreDiff;
      const leftDate = left.completion_date ?? "";
      const rightDate = right.completion_date ?? "";
      if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);
      return left.name.localeCompare(right.name);
    })
    .slice(0, TOP_RATED_LIMIT);

  const ratedCount = dataset.ratedEntries.length;

  return {
    itemCount: basic.total,
    ratedCount,
    averageScore: ratedCount > 0 ? basic.average_score : null,
    perfectTenCount: basic.perfectTenCount,
    rewatchCount: basic.rewatch_count,
    distinctGenreCount: distinctGenres.size,
    eraStats,
    genres,
    topRated,
  };
}
