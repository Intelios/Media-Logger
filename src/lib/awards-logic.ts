import { dbService, type MediaEntry } from "./db";

export interface AwardTemplate {
  id: number;
  name: string;
  created_date: string;
  usage_count?: number; // How many years used this template
}

export interface AwardCategory {
  id: number;
  name: string;
  year: number;
  sort_order: number;
  template_id: number | null;
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

export interface TemplateWinnerHistory {
  year: number;
  winner: MediaEntry | null;
  category_id: number;
}

export const awardsLogic = {
  // 1. Get list of years that have awards
  async getAwardYears(): Promise<AwardYearSummary[]> {
    const db = await dbService.connect();
    // Get unique years from categories
    const yearsResult = await db.select<{ year: number }[]>("SELECT DISTINCT year FROM award_categories ORDER BY year DESC");

    // Calculate stats for each year (categories vs winners)
    const summaries: AwardYearSummary[] = [];

    for (const y of yearsResult) {
      const cats = await db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM award_categories WHERE year = $1", [y.year]);
      // Join winners -> categories to count winners for this year
      const wins = await db.select<{ count: number }[]>(
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
         JOIN entries m ON w.media_id = m.id 
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

  // 3. Create Category (also creates template if it doesn't exist)
  async createCategory(name: string, year: number) {
    const db = await dbService.connect();

    // First, ensure template exists for this name
    await db.execute(
      "INSERT OR IGNORE INTO award_templates (name, created_date) VALUES ($1, datetime('now'))",
      [name]
    );

    // Get the template id
    const template = await db.select<{ id: number }[]>(
      "SELECT id FROM award_templates WHERE name = $1",
      [name]
    );
    const templateId = template[0]?.id || null;

    // Get max sort order
    const maxSort = await db.select<{ max: number }[]>("SELECT MAX(sort_order) as max FROM award_categories WHERE year = $1", [year]);
    const nextSort = (maxSort[0].max || 0) + 1;

    await db.execute(
      "INSERT INTO award_categories (name, year, created_date, sort_order, template_id) VALUES ($1, $2, datetime('now'), $3, $4)",
      [name, year, nextSort, templateId]
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
  },

  // 6. Update Category Order
  async updateCategoryOrder(year: number, categoryIds: number[]) {
    const db = await dbService.connect();
    for (let i = 0; i < categoryIds.length; i++) {
      await db.execute(
        "UPDATE award_categories SET sort_order = $1 WHERE id = $2 AND year = $3",
        [i, categoryIds[i], year]
      );
    }
  },

  // 7. Get all awards won by a specific media entry
  async getAwardsForMedia(mediaId: number): Promise<{ categoryName: string; year: number }[]> {
    const db = await dbService.connect();
    const results = await db.select<{ name: string; year: number }[]>(
      `SELECT c.name, c.year 
       FROM award_winners w 
       JOIN award_categories c ON w.category_id = c.id 
       WHERE w.media_id = $1 
       ORDER BY c.year DESC, c.name ASC`,
      [mediaId]
    );
    return results.map(r => ({ categoryName: r.name, year: r.year }));
  },

  // 8. Get all awards for a list of media IDs (batch query for efficiency)
  async getAwardsForMediaBatch(mediaIds: number[]): Promise<Map<number, { categoryName: string; year: number }[]>> {
    if (mediaIds.length === 0) return new Map();

    const db = await dbService.connect();
    const placeholders = mediaIds.map((_, i) => `$${i + 1}`).join(',');
    const results = await db.select<{ media_id: number; name: string; year: number }[]>(
      `SELECT w.media_id, c.name, c.year 
       FROM award_winners w 
       JOIN award_categories c ON w.category_id = c.id 
       WHERE w.media_id IN (${placeholders}) 
       ORDER BY c.year DESC, c.name ASC`,
      mediaIds
    );

    const awardsMap = new Map<number, { categoryName: string; year: number }[]>();
    for (const r of results) {
      const existing = awardsMap.get(r.media_id) || [];
      existing.push({ categoryName: r.name, year: r.year });
      awardsMap.set(r.media_id, existing);
    }
    return awardsMap;
  },

  // ============ TEMPLATE FUNCTIONS ============

  // 9. Get all award templates with usage count
  async getAllTemplates(): Promise<AwardTemplate[]> {
    const db = await dbService.connect();
    const templates = await db.select<(AwardTemplate & { usage_count: number })[]>(
      `SELECT t.*, COUNT(DISTINCT c.year) as usage_count 
       FROM award_templates t 
       LEFT JOIN award_categories c ON c.template_id = t.id 
       GROUP BY t.id 
       ORDER BY usage_count DESC, t.name ASC`
    );
    return templates;
  },

  // 10. Get template by ID with full winner history
  async getTemplateById(templateId: number): Promise<AwardTemplate | null> {
    const db = await dbService.connect();
    const templates = await db.select<AwardTemplate[]>(
      "SELECT * FROM award_templates WHERE id = $1",
      [templateId]
    );
    return templates[0] || null;
  },

  // 11. Get winner history for a template (all years)
  async getTemplateHistory(templateId: number): Promise<TemplateWinnerHistory[]> {
    const db = await dbService.connect();

    // Get all categories for this template
    const categories = await db.select<{ id: number; year: number }[]>(
      "SELECT id, year FROM award_categories WHERE template_id = $1 ORDER BY year DESC",
      [templateId]
    );

    if (categories.length === 0) return [];

    // Get winners for these categories
    const categoryIds = categories.map(c => c.id);
    const placeholders = categoryIds.map((_, i) => `$${i + 1}`).join(',');

    const winners = await db.select<(AwardWinner & MediaEntry)[]>(
      `SELECT w.category_id, w.media_id, m.* 
       FROM award_winners w 
       JOIN entries m ON w.media_id = m.id 
       WHERE w.category_id IN (${placeholders})`,
      categoryIds
    );

    const winnerMap = new Map<number, MediaEntry>();
    winners.forEach(w => {
      const { category_id, media_id, ...media } = w;
      winnerMap.set(category_id, media as MediaEntry);
    });

    return categories.map(cat => ({
      year: cat.year,
      winner: winnerMap.get(cat.id) || null,
      category_id: cat.id
    }));
  },

  // 12. Create a new template (standalone)
  async createTemplate(name: string): Promise<number> {
    const db = await dbService.connect();
    const result: any = await db.execute(
      "INSERT INTO award_templates (name, created_date) VALUES ($1, datetime('now'))",
      [name]
    );
    return result.lastInsertId;
  },

  // 13. Create category from existing template
  async createCategoryFromTemplate(templateId: number, year: number): Promise<void> {
    const db = await dbService.connect();

    // Get template name
    const template = await db.select<{ name: string }[]>(
      "SELECT name FROM award_templates WHERE id = $1",
      [templateId]
    );

    if (template.length === 0) {
      throw new Error("Template not found");
    }

    // Check if this template is already used in this year
    const existing = await db.select<{ id: number }[]>(
      "SELECT id FROM award_categories WHERE template_id = $1 AND year = $2",
      [templateId, year]
    );

    if (existing.length > 0) {
      throw new Error("This award already exists for this year");
    }

    // Get max sort order
    const maxSort = await db.select<{ max: number }[]>(
      "SELECT MAX(sort_order) as max FROM award_categories WHERE year = $1",
      [year]
    );
    const nextSort = (maxSort[0].max || 0) + 1;

    await db.execute(
      "INSERT INTO award_categories (name, year, created_date, sort_order, template_id) VALUES ($1, $2, datetime('now'), $3, $4)",
      [template[0].name, year, nextSort, templateId]
    );
  },

  // 14. Get templates not yet used in a specific year (for the picker)
  async getTemplatesNotUsedInYear(year: number): Promise<AwardTemplate[]> {
    const db = await dbService.connect();
    const templates = await db.select<AwardTemplate[]>(
      `SELECT t.* 
       FROM award_templates t 
       WHERE t.id NOT IN (
         SELECT template_id FROM award_categories WHERE year = $1 AND template_id IS NOT NULL
       )
       ORDER BY t.name ASC`,
      [year]
    );
    return templates;
  }
};