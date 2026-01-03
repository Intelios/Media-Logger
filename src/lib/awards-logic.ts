import { dbService, type MediaEntry } from "./db";

export interface AwardCategory {
  id: number;
  name: string;
  year: number;
  sort_order: number;
}

export interface AwardWinner {
  category_id: number;
  media_id: number;
  media?: MediaEntry; // Joined data
}

export interface AwardYearSummary {
  year: number;
  categories: number;
  winners: number;
}

export const awardsLogic = {
  // 1. Get list of years that have awards
  async getAwardYears(): Promise<AwardYearSummary[]> {
    const db = await dbService.connect();
    // Get unique years from categories
    const yearsResult = await db.select<{year: number}[]>("SELECT DISTINCT year FROM award_categories ORDER BY year DESC");
    
    // Calculate stats for each year (categories vs winners)
    const summaries: AwardYearSummary[] = [];
    
    for (const y of yearsResult) {
        const cats = await db.select<{count: number}[]>("SELECT COUNT(*) as count FROM award_categories WHERE year = $1", [y.year]);
        // Join winners -> categories to count winners for this year
        const wins = await db.select<{count: number}[]>(
            "SELECT COUNT(*) as count FROM award_winners w JOIN award_categories c ON w.category_id = c.id WHERE c.year = $1", 
            [y.year]
        );
        
        summaries.push({
            year: y.year,
            categories: cats[0].count,
            winners: wins[0].count
        });
    }
    
    return summaries;
  },

  // 2. Get full data for a specific year
  async getAwardsForYear(year: number) {
    const db = await dbService.connect();
    
    // Get Categories
    const categories = await db.select<AwardCategory[]>(
        "SELECT * FROM award_categories WHERE year = $1 ORDER BY sort_order ASC, id ASC", 
        [year]
    );

    // Get Winners and join Media info
    const winnersRaw = await db.select<(AwardWinner & MediaEntry)[]>(
        `SELECT w.category_id, w.media_id, m.* 
         FROM award_winners w 
         JOIN javs m ON w.media_id = m.id 
         WHERE w.category_id IN (SELECT id FROM award_categories WHERE year = $1)`,
        [year]
    );

    // Map winners to categories for easy UI consumption
    const winnerMap = new Map<number, MediaEntry>();
    winnersRaw.forEach(w => {
        // Extract MediaEntry part
        const { category_id, media_id, ...media } = w;
        winnerMap.set(category_id, media as MediaEntry);
    });

    return categories.map(cat => ({
        ...cat,
        winner: winnerMap.get(cat.id) || null
    }));
  },

  // 3. Create Category
  async createCategory(name: string, year: number) {
    const db = await dbService.connect();
    // Get max sort order
    const maxSort = await db.select<{max: number}[]>("SELECT MAX(sort_order) as max FROM award_categories WHERE year = $1", [year]);
    const nextSort = (maxSort[0].max || 0) + 1;

    await db.execute(
        "INSERT INTO award_categories (name, year, created_date, sort_order) VALUES ($1, $2, datetime('now'), $3)",
        [name, year, nextSort]
    );
  },

  // 4. Set Winner
  async setWinner(categoryId: number, mediaId: number) {
    const db = await dbService.connect();
    await db.execute(
        "INSERT OR REPLACE INTO award_winners (category_id, media_id, selected_date) VALUES ($1, $2, datetime('now'))",
        [categoryId, mediaId]
    );
  },

  // 5. Delete Category
  async deleteCategory(id: number) {
    const db = await dbService.connect();
    // Winners table has foreign key cascade usually, but manual cleanup is safer if foreign keys aren't strictly enforced in your sqlite config
    await db.execute("DELETE FROM award_winners WHERE category_id = $1", [id]);
    await db.execute("DELETE FROM award_categories WHERE id = $1", [id]);
  }
};