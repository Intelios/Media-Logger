import { dbService } from "./db";

export interface StatItem {
  name: string;
  count: number;
  value?: number; // For charts
  color?: string;
  avgScore?: number; // Average score for this category
  perfectCount?: number; // Number of perfect 10s
  [key: string]: string | number | undefined; // Index signature for Recharts compatibility
}

export interface FullStats {
  total: number;
  average_score: number;
  rewatch_count: number;
  ratings: StatItem[];
  genres: StatItem[];
  platforms: StatItem[];
  studios: StatItem[];
  authors: StatItem[];
  actresses: StatItem[];
  // NEW enhanced metrics
  perfectTenCount: number;
  entriesThisMonth: number;
  monthlyCompletions: { month: string; count: number }[];
  mediaTypeBreakdown: StatItem[];
}

// Helper to count with average scores
const countWithScores = (entries: any[], fieldName: string): StatItem[] => {
  const stats: Record<string, { count: number; totalScore: number; scoreCount: number; perfectCount: number }> = {};

  entries.forEach(e => {
    const value = e[fieldName];
    if (!value) return;

    // Handle comma-separated values (like genres)
    const values = value.includes(',') ? value.split(',').map((v: string) => v.trim()) : [value.trim()];

    values.forEach((v: string) => {
      if (!v) return;
      if (!stats[v]) {
        stats[v] = { count: 0, totalScore: 0, scoreCount: 0, perfectCount: 0 };
      }
      stats[v].count++;
      if (e.review_score) {
        stats[v].totalScore += e.review_score;
        stats[v].scoreCount++;
        if (e.review_score === 10) {
          stats[v].perfectCount++;
        }
      }
    });
  });

  return Object.entries(stats)
    .map(([name, data]) => ({
      name,
      count: data.count,
      value: data.count,
      avgScore: data.scoreCount > 0 ? data.totalScore / data.scoreCount : undefined,
      perfectCount: data.perfectCount,
    }))
    .sort((a, b) => b.count - a.count);
};

// Get month name from date string
const getMonthFromDate = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('default', { month: 'short' });
  } catch {
    return 'Unknown';
  }
};

export const statsLogic = {
  // NEW: Accept typeFilter array
  async getStats(yearFilter?: string, typeFilter: string[] = []): Promise<FullStats> {
    const db = await dbService.connect();

    // Base Query Construction
    let query = "SELECT * FROM javs WHERE 1=1";
    const params: any[] = [];

    // 1. Year Filter
    if (yearFilter && yearFilter !== "All Time") {
      params.push(yearFilter);
      query += ` AND year_completed = $${params.length}`;
    }

    // 2. Type Filter (NEW)
    if (typeFilter.length > 0) {
      const placeholders = typeFilter.map((_, i) => `$${params.length + i + 1}`).join(", ");
      query += ` AND entry_type IN (${placeholders})`;
      params.push(...typeFilter);
    }

    const entries = await db.select<any[]>(query, params);

    // 1. Basic Counts
    const total = entries.length;
    const rewatch_count = entries.filter(e => e.is_rewatch).length;
    const perfectTenCount = entries.filter(e => e.review_score === 10).length;

    // 2. Ratings (1-10)
    const ratedEntries = entries.filter(e => e.review_score);
    const sumScore = ratedEntries.reduce((acc, e) => acc + (e.review_score || 0), 0);
    const average_score = ratedEntries.length ? sumScore / ratedEntries.length : 0;

    // Prepare Rating Distribution (10 down to 1)
    const ratingMap = new Array(11).fill(0);
    ratedEntries.forEach(e => {
      if (e.review_score) ratingMap[e.review_score]++;
    });

    const ratings: StatItem[] = [];
    for (let i = 10; i >= 1; i--) {
      ratings.push({ name: i.toString(), count: ratingMap[i], value: ratingMap[i] });
    }

    // 3. Monthly Completions (for current filter)
    const monthlyMap: Record<string, number> = {
      'Jan': 0, 'Feb': 0, 'Mar': 0, 'Apr': 0, 'May': 0, 'Jun': 0,
      'Jul': 0, 'Aug': 0, 'Sep': 0, 'Oct': 0, 'Nov': 0, 'Dec': 0
    };

    entries.forEach(e => {
      if (e.completion_date) {
        const month = getMonthFromDate(e.completion_date);
        if (monthlyMap[month] !== undefined) {
          monthlyMap[month]++;
        }
      }
    });

    const monthlyCompletions = Object.entries(monthlyMap).map(([month, count]) => ({
      month,
      count
    }));

    // 4. Entries this month
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const entriesThisMonth = entries.filter(e => {
      if (!e.completion_date) return false;
      try {
        const date = new Date(e.completion_date);
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      } catch {
        return false;
      }
    }).length;

    // 5. Enhanced category aggregations with scores
    const genres = countWithScores(entries, 'genre').slice(0, 25);
    const platforms = countWithScores(entries, 'platform').slice(0, 25);
    const studios = countWithScores(entries, 'director').slice(0, 25); // director = studio
    const authors = countWithScores(entries, 'author').slice(0, 25);
    const actresses = countWithScores(entries, 'actress').slice(0, 25);
    const mediaTypeBreakdown = countWithScores(entries, 'entry_type').slice(0, 15);

    return {
      total,
      average_score,
      rewatch_count,
      ratings,
      genres,
      platforms,
      studios,
      authors,
      actresses,
      perfectTenCount,
      entriesThisMonth,
      monthlyCompletions,
      mediaTypeBreakdown,
    };
  }
};