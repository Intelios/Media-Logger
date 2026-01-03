import { dbService, type MediaEntry } from "./db";

export interface DashboardStats {
  total_entries: number;
  average_rating: string;
  most_common_type: string;
  most_productive_year: string;
  completion_rate: number; // For progress bar
  diversity_score: number; // For progress bar
}

export const dashboardLogic = {
  async getStats(): Promise<DashboardStats> {
    const db = await dbService.connect();

    // 1. Basic Totals
    const totalResult = await db.select<{count: number}[]>("SELECT COUNT(*) as count FROM javs");
    const total = totalResult[0].count;

    // 2. Average Rating
    const avgResult = await db.select<{avg: number}[]>("SELECT AVG(review_score) as avg FROM javs WHERE review_score IS NOT NULL");
    const avg = avgResult[0].avg || 0;

    // 3. Most Common Type
    const typeResult = await db.select<{entry_type: string}[]>(
      "SELECT entry_type, COUNT(*) as c FROM javs GROUP BY entry_type ORDER BY c DESC LIMIT 1"
    );
    const commonType = typeResult[0]?.entry_type || "N/A";

    // 4. Most Productive Year
    const yearResult = await db.select<{year_completed: number, c: number}[]>(
      "SELECT year_completed, COUNT(*) as c FROM javs WHERE year_completed IS NOT NULL GROUP BY year_completed ORDER BY c DESC LIMIT 1"
    );
    const productiveYear = yearResult[0]?.year_completed ? `${yearResult[0].year_completed}` : "N/A";
    const productiveYearCount = yearResult[0]?.c || 0;

    // 5. Completion Rate (Arbitrary calculation based on your Python code logic)
    // In your code: entries with completion_date vs total. 
    // Since our query filters empty dates usually, let's assume 100% for now or query specifically.
    const completedResult = await db.select<{count: number}[]>("SELECT COUNT(*) as count FROM javs WHERE completion_date IS NOT NULL");
    const completionRate = total > 0 ? (completedResult[0].count / total) * 100 : 0;

    return {
      total_entries: total,
      average_rating: avg.toFixed(1),
      most_common_type: commonType,
      most_productive_year: `${productiveYear} (${productiveYearCount})`,
      completion_rate: completionRate,
      diversity_score: 75, // Placeholder for the complex Shannon index calc from Python
    };
  },

  async getFeaturedEntry(): Promise<MediaEntry | null> {
    const db = await dbService.connect();
    // Logic from python: Rating >= 8 OR recent, random 1
    const result = await db.select<MediaEntry[]>(
      "SELECT * FROM javs WHERE review_score >= 8 OR completion_date >= date('now', '-30 days') ORDER BY RANDOM() LIMIT 1"
    );
    return result[0] || null;
  },

  async getRecentEntries(): Promise<MediaEntry[]> {
    const db = await dbService.connect();
    return await db.select<MediaEntry[]>(
      "SELECT * FROM javs WHERE completion_date IS NOT NULL ORDER BY completion_date DESC, id DESC LIMIT 6"
    );
  }
};