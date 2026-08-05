import { dbService, type MediaEntry, adultExclusionSql } from "./db";
import { isFeaturedAdultAllowed } from "./settings";
import { ADULT_ENTRY_TYPES } from "./media-config";

export interface DashboardStats {
  total_entries: number;
  average_rating: number;
  most_common_type: string;
  most_productive_year: { year: number; count: number } | null;
}

type DashboardStatsRow = {
  total_entries: number;
  average_rating: number | null;
  most_common_type: string | null;
  most_productive_year: number | null;
  most_productive_year_count: number | null;
};

export const dashboardLogic = {
  async getStats(): Promise<DashboardStats> {
    const db = await dbService.connect();

    // Keep all dashboard metrics on the same filtered snapshot and round trip.
    const result = await db.select<DashboardStatsRow[]>(`
      WITH visible_entries AS (
        SELECT entry_type, review_score, year_completed
        FROM entries
        WHERE 1=1${adultExclusionSql()}
      ),
      type_counts AS (
        SELECT entry_type, COUNT(*) AS entry_count
        FROM visible_entries
        GROUP BY entry_type
        ORDER BY entry_count DESC
        LIMIT 1
      ),
      year_counts AS (
        SELECT year_completed, COUNT(*) AS entry_count
        FROM visible_entries
        WHERE year_completed IS NOT NULL
        GROUP BY year_completed
        ORDER BY entry_count DESC
        LIMIT 1
      )
      SELECT
        COUNT(*) AS total_entries,
        AVG(review_score) AS average_rating,
        (SELECT entry_type FROM type_counts) AS most_common_type,
        (SELECT year_completed FROM year_counts) AS most_productive_year,
        (SELECT entry_count FROM year_counts) AS most_productive_year_count
      FROM visible_entries
    `);
    const stats = result[0];
    const productiveYear = stats?.most_productive_year;

    return {
      total_entries: stats?.total_entries ?? 0,
      average_rating: stats?.average_rating ?? 0,
      most_common_type: stats?.most_common_type || "N/A",
      most_productive_year: productiveYear != null
        ? { year: productiveYear, count: stats?.most_productive_year_count ?? 0 }
        : null,
    };
  },

  async getFeaturedEntry(excludeId?: number): Promise<MediaEntry | null> {
    const db = await dbService.connect();
    // Pick from all visible entries so every (shown) item can be featured.
    // Optionally also exclude adult entries from the featured pool, independent
    // of the global Adult Media setting (adult entries stay visible elsewhere).
    const featuredAdultExclusion =
      isFeaturedAdultAllowed() ? '' : ` AND entry_type NOT IN (${ADULT_ENTRY_TYPES.map((t) => `'${t}'`).join(',')})`;
    const baseWhere = `WHERE 1=1${adultExclusionSql()}${featuredAdultExclusion}`;
    // On a reroll, skip the entry that's already showing so it never repeats
    // back-to-back — unless it's the only match, in which case we keep it.
    const exclusion =
      excludeId != null && Number.isFinite(excludeId) ? ` AND id != ${Math.trunc(excludeId)}` : '';

    let where = baseWhere + exclusion;
    let totalCount =
      (await db.select<{ count: number }[]>(`SELECT COUNT(*) as count FROM entries ${where}`))[0]
        ?.count || 0;

    if (totalCount === 0 && exclusion) {
      // Excluding the current entry left nothing — fall back to the full pool.
      where = baseWhere;
      totalCount =
        (await db.select<{ count: number }[]>(`SELECT COUNT(*) as count FROM entries ${where}`))[0]
          ?.count || 0;
    }
    if (totalCount === 0) return null;

    const randomOffset = Math.floor(Math.random() * totalCount);
    const result = await db.select<MediaEntry[]>(
      `SELECT * FROM entries ${where} ORDER BY id ASC LIMIT 1 OFFSET $1`,
      [randomOffset]
    );
    return result[0] || null;
  },

  async getRecentEntries(): Promise<MediaEntry[]> {
    const db = await dbService.connect();
    return await db.select<MediaEntry[]>(
      `SELECT * FROM entries WHERE completion_date IS NOT NULL${adultExclusionSql()} ORDER BY completion_date DESC, id DESC LIMIT 15`
    );
  },

  async getOnThisDayEntries(): Promise<MediaEntry[]> {
    const db = await dbService.connect();
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    // substr(completion_date, 6, 5) extracts 'MM-DD' from 'YYYY-MM-DD'
    return await db.select<MediaEntry[]>(
      `SELECT * FROM entries WHERE completion_date IS NOT NULL AND substr(completion_date, 6, 5) = $1${adultExclusionSql()} ORDER BY completion_date DESC, id DESC LIMIT 12`,
      [`${month}-${day}`]
    );
  }
};
