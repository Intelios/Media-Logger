import { adultExclusionSql, dbService } from "../db";
import type { ReviewAward, ReviewYearCoverRow, ReviewYearTypeRow } from "./types";

/**
 * The four things Review cannot derive from a single year's rows.
 *
 * Everything else comes from dbService.getStatsEntries(year) — the same thin
 * projection and the same cache key the Stats screen uses — so type and month
 * filtering cost no queries at all.
 */

/**
 * Award winners for a year.
 *
 * Deliberately not awardsLogic.getAwardsForYear(): that helper does not apply
 * adult exclusion, and a hidden entry must not surface here. The award tables
 * can be legitimately empty, so a failure is not exceptional.
 */
export async function getReviewAwards(year: number): Promise<ReviewAward[]> {
  try {
    const db = await dbService.connect();
    const rows = await db.select<
      {
        category_name: string;
        winner_name: string;
        image_url: string | null;
        entry_type: string | null;
        review_score: number | null;
      }[]
    >(
      `SELECT c.name as category_name, m.name as winner_name, m.image_url, m.entry_type, m.review_score
       FROM award_categories c
       JOIN award_winners w ON w.category_id = c.id
       JOIN entries m ON w.media_id = m.id
       WHERE c.year = $1${adultExclusionSql()}
       ORDER BY c.sort_order ASC, c.id ASC`,
      [year],
    );

    return rows.map((row) => ({
      category: row.category_name,
      winner: row.winner_name,
      imageUrl: row.image_url,
      entryType: row.entry_type,
      score: row.review_score,
    }));
  } catch {
    // Award tables may hold nothing for this year.
    return [];
  }
}

/**
 * Per-year × per-type totals. One query serves the year list, the Replay
 * column's counts and averages, and the You-vs-Last-Year comparison.
 *
 * At most (years × entry types) rows. Not parameterised by the type filter on
 * purpose — see ReviewYearTypeRow.
 */
export async function getReviewYearTypeTotals(): Promise<ReviewYearTypeRow[]> {
  const db = await dbService.connect();
  return db.select<ReviewYearTypeRow[]>(
    `SELECT year_completed AS year,
            entry_type AS type,
            COUNT(*) AS total,
            SUM(review_score) AS score_sum,
            SUM(CASE WHEN review_score IS NOT NULL THEN 1 ELSE 0 END) AS rated
     FROM entries
     WHERE year_completed IS NOT NULL${adultExclusionSql()}
     GROUP BY year_completed, entry_type`,
  );
}

/**
 * The single best-rated cover per year, for the Replay column's 34×46 spines.
 *
 * A window function ranks candidates in SQLite so we transfer one row per year
 * rather than every cover (same shape as the collection-thumbnail query in
 * collections-logic.ts). `entry_type` resolves unambiguously inside the
 * subquery. `(review_score IS NULL)` sorts unrated last without NULLS LAST.
 */
export async function getReviewYearCovers(): Promise<ReviewYearCoverRow[]> {
  const db = await dbService.connect();
  return db.select<ReviewYearCoverRow[]>(
    `SELECT year, cover_path
     FROM (
       SELECT year_completed AS year,
              image_url AS cover_path,
              ROW_NUMBER() OVER (
                PARTITION BY year_completed
                ORDER BY (review_score IS NULL), review_score DESC, id DESC
              ) AS rn
       FROM entries
       WHERE year_completed IS NOT NULL
         AND image_url IS NOT NULL
         AND TRIM(image_url) <> ''${adultExclusionSql()}
     )
     WHERE rn = 1
     ORDER BY year DESC`,
  );
}

/**
 * The free-text note the user wrote for one entry.
 *
 * `notes` is omitted from every thin projection (StatsEntry, EntryCardSummary),
 * so the signature chapter has to reach for a detail row. Goes through
 * getEntriesByIds — the sanctioned detail path — rather than hand-rolled SQL.
 */
export async function getReviewNote(entryId: number): Promise<string | null> {
  const rows = await dbService.getEntriesByIds([entryId]);
  const note = rows[0]?.notes;
  return typeof note === "string" && note.trim().length > 0 ? note.trim() : null;
}
