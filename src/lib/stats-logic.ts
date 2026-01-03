import { dbService } from "./db";

export interface StatItem {
  name: string;
  count: number;
  value?: number; // For charts
  color?: string;
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
}

// Helper to process list-based strings (e.g. "Action, Sci-Fi")
const countOccurrences = (items: string[]) => {
  const counts: Record<string, number> = {};
  items.forEach(item => {
    const trimmed = item.trim();
    if (trimmed) counts[trimmed] = (counts[trimmed] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count, value: count }))
    .sort((a, b) => b.count - a.count);
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
    // If typeFilter is empty or has all types, we don't need to filter SQL (optimization)
    // But usually it's safer to just filter if passed.
    if (typeFilter.length > 0) {
      // Create placeholders like ($2, $3, $4)
      const placeholders = typeFilter.map((_, i) => `$${params.length + i + 1}`).join(", ");
      query += ` AND entry_type IN (${placeholders})`;
      params.push(...typeFilter);
    }

    const entries = await db.select<any[]>(query, params);

    // 1. Basic Counts
    const total = entries.length;
    const rewatch_count = entries.filter(e => e.is_rewatch).length;
    
    // 2. Ratings (1-10)
    const ratedEntries = entries.filter(e => e.review_score);
    const sumScore = ratedEntries.reduce((acc, e) => acc + (e.review_score || 0), 0);
    const average_score = ratedEntries.length ? sumScore / ratedEntries.length : 0;

    // Prepare Rating Distribution (10 down to 1)
    const ratingMap = new Array(11).fill(0);
    ratedEntries.forEach(e => {
        if(e.review_score) ratingMap[e.review_score]++;
    });
    
    const ratings: StatItem[] = [];
    for (let i = 10; i >= 1; i--) {
        ratings.push({ name: i.toString(), count: ratingMap[i], value: ratingMap[i] });
    }

    // 3. Aggregations (Genre, Platform, Studio, Author)
    const allGenres: string[] = [];
    const allPlatforms: string[] = [];
    const allStudios: string[] = [];
    const allAuthors: string[] = [];

    entries.forEach(e => {
        if (e.genre) allGenres.push(...e.genre.split(','));
        if (e.platform) allPlatforms.push(e.platform);
        if (e.director) allStudios.push(e.director); // "director" column is used for Studio in JAV/Movies
        if (e.author) allAuthors.push(e.author);
    });

    return {
      total,
      average_score,
      rewatch_count,
      ratings,
      genres: countOccurrences(allGenres).slice(0, 10), // Top 10
      platforms: countOccurrences(allPlatforms),
      studios: countOccurrences(allStudios).slice(0, 10),
      authors: countOccurrences(allAuthors).slice(0, 10)
    };
  }
};