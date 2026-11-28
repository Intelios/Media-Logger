import { adultExclusionSql, dbService, type EntryCardSummary, type MediaEntry } from "./db";
import { ENTRY_TYPES } from "./media-config";
import { invoke } from "@tauri-apps/api/core";

export interface AwardTemplate {
  id: number;
  name: string;
  created_date: string;
  /** Media type the award belongs to (Movie, Game, …). null = General. */
  entry_type: string | null;
  /** 0/1: each winner also credits a person (the actor for Best Actor). */
  credits_person: number;
  usage_count?: number; // How many years used this template
}

export interface AwardCategory {
  id: number;
  name: string;
  year: number;
  sort_order: number;
  template_id: number | null;
}

/** A year's award category joined with its winner and template settings. */
export type AwardCategoryWithWinner = AwardCategory & {
  winner: MediaEntry | null;
  entry_type: string | null;
  /** 0/1 from the template: whether this award credits a person. */
  credits_person: number;
  /** The winner's credited person; null when none, or while the award's switch is off. */
  credited_person: string | null;
};

/** Award labels are grouped by media type; untagged awards share this bucket. */
export const GENERAL_GROUP = "General";

/** Winner columns selected next to `m.*` (aliased so they can't collide with entries columns). */
interface AwardWinner {
  category_id: number;
  media_id: number;
  award_credited_person: string | null;
}

/** One award an entry won, for card badges, tooltips and chips. */
export interface EntryAward {
  categoryName: string;
  year: number;
  creditedPerson: string | null;
}

/**
 * The winner's credited person, but only while its award still credits one.
 * Switching the option off hides stored names without deleting them, so
 * switching it back on brings them back.
 *
 * Expects `w` (award_winners) and `c` (award_categories) in scope. This is a
 * correlated lookup rather than a JOIN on purpose: award_templates has its own
 * `entry_type` column, which would make adultExclusionSql()'s bare
 * `entry_type` ambiguous in the queries that append it.
 */
export const CREDITED_PERSON_SQL =
  "CASE WHEN EXISTS (SELECT 1 FROM award_templates ct WHERE ct.id = c.template_id AND ct.credits_person = 1) THEN w.credited_person END";

/** Longest credited name we store. */
export const CREDITED_PERSON_MAX_LENGTH = 120;

/** "Oppenheimer — Cillian Murphy", or just the entry name when no one is credited. */
export function withCreditedPerson(name: string, person: string | null | undefined): string {
  return person ? `${name} — ${person}` : name;
}

// Award names that almost always honour a person. Only a hint: it pre-ticks
// "Credit a person" when creating an award, and the user can untick it. Word
// boundaries keep "Podcast" and "Ghost" from matching "cast" and "host".
const PERSON_AWARD_HINT =
  /\b(actors?|actress(es)?|acting|performances?|performers?|directors?|directing|voice|cast|ensemble|composers?|narrator|narration|host|supporting)\b/i;

/** Whether an award's name suggests it honours a person (Best Actor, Best Director…). */
export function suggestsPersonCredit(name: string): boolean {
  return PERSON_AWARD_HINT.test(name);
}

/** Trim and collapse whitespace; an empty name means no one is credited. */
function normalizeCreditedPerson(name: string | null | undefined): string | null {
  if (name == null) return null;
  const normalized = name.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  if (normalized.length > CREDITED_PERSON_MAX_LENGTH) {
    throw new Error(`Keep the name under ${CREDITED_PERSON_MAX_LENGTH} characters.`);
  }
  return normalized;
}

export interface AwardYearSummary {
  year: number;
  categories: number;
  winners: number;
}

/** What deleting an award template would take with it. */
export interface TemplateDeletionImpact {
  /** Number of award years the template currently appears in. */
  years: number;
  /** Number of those years that have a winner recorded. */
  winners: number;
}

export interface TemplateWinnerHistory {
  year: number;
  winner: MediaEntry | null;
  /** That year's credited person; null when none, or while the award's switch is off. */
  credited_person: string | null;
  category_id: number;
}

export interface MediaAwardWin {
  categoryId: number;
  categoryName: string;
  year: number;
  templateId: number | null;
  sortOrder: number;
  creditedPerson: string | null;
}

export interface MostAwardedEntry {
  entry: EntryCardSummary;
  winCount: number;
  /** Distinct award years in descending order (e.g. [2024] or [2025, 2024]). */
  years: number[];
  /** Every award won by this entry, ordered by year DESC, sort_order ASC, id ASC. */
  awards: MediaAwardWin[];
}

/** Normalize an award/template name: trim whitespace and collapse internal runs. */
function normalizeAwardName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Strict year validation: must be a 4-digit positive integer string/number. */
function validateAwardYear(year: number): number {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    throw new Error("Please enter a valid 4-digit year (e.g. 2026).");
  }
  return year;
}

/** Award tags are a controlled vocabulary: a canonical entry type, or null (General). */
function validateAwardType(entryType: string | null | undefined): string | null {
  if (entryType == null) return null;
  if (!ENTRY_TYPES.includes(entryType)) {
    throw new Error(`"${entryType}" is not a valid media type.`);
  }
  return entryType;
}

export const awardsLogic = {
  // 1. Get list of years that have awards
  async getAwardYears(): Promise<AwardYearSummary[]> {
    const db = await dbService.connect();
    return await db.select<AwardYearSummary[]>(
      `SELECT y.year as year,
              COUNT(DISTINCT c.id) as categories,
              COUNT(DISTINCT w.category_id) as winners
       FROM award_years y
       LEFT JOIN award_categories c ON c.year = y.year
       LEFT JOIN award_winners w ON w.category_id = c.id
       GROUP BY y.year
       ORDER BY y.year DESC`
    );
  },

  async createYear(year: number): Promise<void> {
    validateAwardYear(year);
    const db = await dbService.connect();
    await db.execute(
      "INSERT OR IGNORE INTO award_years (year, created_date) VALUES ($1, datetime('now'))",
      [year]
    );
  },

  /** Create a new year, optionally reusing another year's categories without winners. */
  async createNewYear(year: number, copyFromYear: number | null): Promise<void> {
    validateAwardYear(year);
    if (copyFromYear !== null) validateAwardYear(copyFromYear);
    const db = await dbService.connect();
    await invoke('database_create_award_year', {
      databaseUrl: db.path,
      year,
      copyFromYear,
    });
  },

  async deleteYear(year: number): Promise<void> {
    const db = await dbService.connect();
    const categoryCount = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM award_categories WHERE year = $1",
      [year]
    );

    if ((categoryCount[0]?.count ?? 0) > 0) {
      throw new Error("Only empty award years can be deleted");
    }

    await db.execute("DELETE FROM award_years WHERE year = $1", [year]);
  },

  // 2. Get full data for a specific year
  async getAwardsForYear(year: number): Promise<AwardCategoryWithWinner[]> {
    const db = await dbService.connect();

    // Get Categories (with each template's media type and person-credit switch)
    const categories = await db.select<
      (AwardCategory & { entry_type: string | null; credits_person: number })[]
    >(
      `SELECT c.*, t.entry_type AS entry_type, COALESCE(t.credits_person, 0) AS credits_person
       FROM award_categories c
       LEFT JOIN award_templates t ON t.id = c.template_id
       WHERE c.year = $1
       ORDER BY c.sort_order ASC, c.id ASC`,
      [year]
    );

    // Get Winners and join Media info
    const winnersRaw = await db.select<(AwardWinner & MediaEntry)[]>(
      `SELECT w.category_id, w.media_id, ${CREDITED_PERSON_SQL} AS award_credited_person, m.*
         FROM award_winners w
         JOIN award_categories c ON c.id = w.category_id
         JOIN entries m ON w.media_id = m.id
         WHERE c.year = $1`,
      [year]
    );

    // Map winners to categories for easy UI consumption
    const winnerMap = new Map<number, { media: MediaEntry; creditedPerson: string | null }>();
    winnersRaw.forEach(w => {
      // Extract MediaEntry part
      const { category_id, media_id, award_credited_person, ...media } = w;
      winnerMap.set(category_id, {
        media: media as MediaEntry,
        creditedPerson: award_credited_person,
      });
    });

    return categories.map(cat => {
      const winner = winnerMap.get(cat.id);
      return {
        ...cat,
        winner: winner?.media ?? null,
        credited_person: winner?.creditedPerson ?? null,
      };
    });
  },

  // 2b. The lead artwork per year for the home view's year cards: the cover of
  // whichever award comes first in the year's stored order. Null paths are
  // kept, so a year whose lead winner has no artwork can show an empty band.
  async getAwardYearLeads(): Promise<Map<number, string | null>> {
    const db = await dbService.connect();
    const rows = await db.select<{ year: number; image_url: string | null }[]>(
      `SELECT c.year AS year, m.image_url AS image_url
       FROM award_categories c
       JOIN award_winners w ON w.category_id = c.id
       JOIN entries m ON m.id = w.media_id
       ORDER BY c.year ASC, c.sort_order ASC, c.id ASC`
    );

    const leads = new Map<number, string | null>();
    for (const row of rows) {
      if (!leads.has(row.year)) leads.set(row.year, row.image_url);
    }
    return leads;
  },

  // 3. Create Category (also creates template if it doesn't exist)
  async createCategory(
    name: string,
    year: number,
    entryType: string | null = null,
    creditsPerson = false
  ) {
    const normalized = normalizeAwardName(name);
    if (!normalized) {
      throw new Error("Please enter an award name.");
    }
    validateAwardYear(year);
    const normalizedType = validateAwardType(entryType);

    const db = await dbService.connect();
    await this.createYear(year);

    // First, ensure template exists for this normalized name. INSERT OR IGNORE
    // leaves an existing template's stored type and person-credit switch
    // untouched.
    await db.execute(
      "INSERT OR IGNORE INTO award_templates (name, created_date, entry_type, credits_person) VALUES ($1, datetime('now'), $2, $3)",
      [normalized, normalizedType, creditsPerson ? 1 : 0]
    );

    // Get the template id
    const template = await db.select<{ id: number }[]>(
      "SELECT id FROM award_templates WHERE name = $1",
      [normalized]
    );
    const templateId = template[0]?.id ?? null;
    if (templateId == null) {
      throw new Error("Could not create or find the award template.");
    }

    // Same dedupe guard as createCategoryFromTemplate: a template may only
    // appear once per year. (Also enforced by a partial unique index.)
    const existing = await db.select<{ id: number }[]>(
      "SELECT id FROM award_categories WHERE template_id = $1 AND year = $2",
      [templateId, year]
    );
    if (existing.length > 0) {
      throw new Error(`"${normalized}" already exists for ${year}.`);
    }

    // Get max sort order
    const maxSort = await db.select<{ max: number }[]>("SELECT MAX(sort_order) as max FROM award_categories WHERE year = $1", [year]);
    const nextSort = (maxSort[0].max || 0) + 1;

    await db.execute(
      "INSERT INTO award_categories (name, year, created_date, sort_order, template_id) VALUES ($1, $2, datetime('now'), $3, $4)",
      [normalized, year, nextSort, templateId]
    );
  },

  // 4. Set Winner. The whole row is replaced, so a new winner never inherits
  // the previous winner's credited person.
  async setWinner(categoryId: number, mediaId: number, creditedPerson: string | null = null) {
    const person = normalizeCreditedPerson(creditedPerson);
    const db = await dbService.connect();
    await db.execute(
      "INSERT OR REPLACE INTO award_winners (category_id, media_id, selected_date, credited_person) VALUES ($1, $2, datetime('now'), $3)",
      [categoryId, mediaId, person]
    );
  },

  // 4b. Credit (or clear, with null/empty) the person beside an existing winner
  async setCreditedPerson(categoryId: number, name: string | null): Promise<void> {
    const person = normalizeCreditedPerson(name);
    const db = await dbService.connect();
    const result = await db.execute(
      "UPDATE award_winners SET credited_person = $1 WHERE category_id = $2",
      [person, categoryId]
    );
    if (result.rowsAffected === 0) {
      throw new Error("Choose a winner before crediting a person.");
    }
  },

  // 4c. Every name credited so far, for autocomplete. Names on hidden adult
  // entries' awards stay hidden. Deduplicated case-insensitively.
  async getCreditedPeople(): Promise<string[]> {
    const db = await dbService.connect();
    const rows = await db.select<{ name: string }[]>(
      `SELECT DISTINCT w.credited_person AS name
       FROM award_winners w
       JOIN entries m ON m.id = w.media_id
       WHERE w.credited_person IS NOT NULL${adultExclusionSql()}
       ORDER BY name COLLATE NOCASE`
    );
    const seen = new Set<string>();
    return rows
      .map((row) => row.name)
      .filter((name) => {
        const key = name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
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
    await invoke('database_reorder_award_categories', {
      databaseUrl: db.path,
      year,
      categoryIds,
    });
  },

  // 7. Get all awards won by a specific media entry
  async getAwardsForMedia(mediaId: number): Promise<EntryAward[]> {
    const db = await dbService.connect();
    const results = await db.select<{ name: string; year: number; credited_person: string | null }[]>(
      `SELECT c.name, c.year, ${CREDITED_PERSON_SQL} AS credited_person
       FROM award_winners w
       JOIN award_categories c ON w.category_id = c.id
       WHERE w.media_id = $1
       ORDER BY c.year DESC, c.name ASC`,
      [mediaId]
    );
    return results.map(r => ({
      categoryName: r.name,
      year: r.year,
      creditedPerson: r.credited_person,
    }));
  },

  // 8. Get all awards for a list of media IDs (batch query for efficiency)
  async getAwardsForMediaBatch(mediaIds: number[]): Promise<Map<number, EntryAward[]>> {
    if (mediaIds.length === 0) return new Map();

    const db = await dbService.connect();
    const placeholders = mediaIds.map((_, i) => `$${i + 1}`).join(',');
    const results = await db.select<
      { media_id: number; name: string; year: number; credited_person: string | null }[]
    >(
      `SELECT w.media_id, c.name, c.year, ${CREDITED_PERSON_SQL} AS credited_person
       FROM award_winners w
       JOIN award_categories c ON w.category_id = c.id
       WHERE w.media_id IN (${placeholders})
       ORDER BY c.year DESC, c.name ASC`,
      mediaIds
    );

    const awardsMap = new Map<number, EntryAward[]>();
    for (const r of results) {
      const existing = awardsMap.get(r.media_id) || [];
      existing.push({ categoryName: r.name, year: r.year, creditedPerson: r.credited_person });
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
      `SELECT w.category_id, w.media_id, ${CREDITED_PERSON_SQL} AS award_credited_person, m.*
       FROM award_winners w
       JOIN award_categories c ON c.id = w.category_id
       JOIN entries m ON w.media_id = m.id
       WHERE w.category_id IN (${placeholders})`,
      categoryIds
    );

    const winnerMap = new Map<number, { media: MediaEntry; creditedPerson: string | null }>();
    winners.forEach(w => {
      const { category_id, media_id, award_credited_person, ...media } = w;
      winnerMap.set(category_id, {
        media: media as MediaEntry,
        creditedPerson: award_credited_person,
      });
    });

    return categories.map(cat => {
      const winner = winnerMap.get(cat.id);
      return {
        year: cat.year,
        winner: winner?.media ?? null,
        credited_person: winner?.creditedPerson ?? null,
        category_id: cat.id,
      };
    });
  },

  // 12. Create a new template (standalone)
  async createTemplate(name: string, entryType: string | null = null): Promise<number> {
    const normalized = normalizeAwardName(name);
    if (!normalized) {
      throw new Error("Please enter an award name.");
    }
    const normalizedType = validateAwardType(entryType);
    const db = await dbService.connect();
    const result: any = await db.execute(
      "INSERT INTO award_templates (name, created_date, entry_type) VALUES ($1, datetime('now'), $2)",
      [normalized, normalizedType]
    );
    return result.lastInsertId;
  },

  // 13. Create category from existing template
  async createCategoryFromTemplate(templateId: number, year: number): Promise<void> {
    validateAwardYear(year);
    const db = await dbService.connect();
    await this.createYear(year);

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
      throw new Error(`"${template[0].name}" already exists for ${year}.`);
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

  // 14. How much a template deletion would remove, for the confirm dialog
  async getTemplateDeletionImpact(templateId: number): Promise<TemplateDeletionImpact> {
    const db = await dbService.connect();
    const rows = await db.select<{ years: number; winners: number }[]>(
      `SELECT COUNT(DISTINCT c.year) as years,
              COUNT(DISTINCT w.category_id) as winners
       FROM award_categories c
       LEFT JOIN award_winners w ON w.category_id = c.id
       WHERE c.template_id = $1`,
      [templateId]
    );
    return {
      years: rows[0]?.years ?? 0,
      winners: rows[0]?.winners ?? 0,
    };
  },

  // 15. Delete a template and every year category/winner that uses it
  async deleteTemplate(templateId: number): Promise<void> {
    const db = await dbService.connect();
    await invoke('database_delete_award_template', {
      databaseUrl: db.path,
      templateId,
    });
  },

  // 16. Get templates not yet used in a specific year (for the picker)
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
  },

  // 17. Set an award template's media type (null clears it back to General)
  async updateTemplateType(templateId: number, entryType: string | null): Promise<void> {
    const normalizedType = validateAwardType(entryType);
    const db = await dbService.connect();
    await db.execute(
      "UPDATE award_templates SET entry_type = $1 WHERE id = $2",
      [normalizedType, templateId]
    );
  },

  // 17b. Switch whether an award credits a person with each winner. Turning it
  // off hides stored names (see CREDITED_PERSON_SQL) without deleting them.
  async updateTemplateCreditsPerson(templateId: number, enabled: boolean): Promise<void> {
    const db = await dbService.connect();
    await db.execute(
      "UPDATE award_templates SET credits_person = $1 WHERE id = $2",
      [enabled ? 1 : 0, templateId]
    );
  },

  // 18. Get entries that have won multiple awards across all time
  async getMostAwardedEntries(minWins = 2): Promise<MostAwardedEntry[]> {
    const db = await dbService.connect();
    type WinRow = EntryCardSummary & {
      award_category_id: number;
      award_category_name: string;
      award_year: number;
      award_template_id: number | null;
      award_sort_order: number;
      award_credited_person: string | null;
    };

    const rows = await db.select<WinRow[]>(
      `SELECT c.id AS award_category_id,
              c.name AS award_category_name,
              c.year AS award_year,
              c.template_id AS award_template_id,
              c.sort_order AS award_sort_order,
              ${CREDITED_PERSON_SQL} AS award_credited_person,
              m.id,
              m.name,
              m.genre,
              m.completion_date,
              m.review_score,
              m.year_completed,
              m.is_rewatch,
              m.own_local_copy,
              m.has_subtitles,
              m.is_platinum,
              m.is_completed,
              m.is_early_access,
              m.early_access_version,
              m.is_expansion,
              m.parent_entry_id,
              m.image_url,
              m.entry_type,
              m.platform,
              m.author,
              m.artist,
              m.director,
              m.actress,
              m.update_version,
              m.franchise,
              m.series,
              m.cover_framing
       FROM award_winners w
       JOIN award_categories c ON c.id = w.category_id
       JOIN entries m ON m.id = w.media_id
       WHERE 1 = 1${adultExclusionSql()}
       ORDER BY c.year DESC, c.sort_order ASC, c.id ASC`
    );

    const byMediaId = new Map<
      number,
      {
        entry: EntryCardSummary;
        yearsSet: Set<number>;
        awards: MediaAwardWin[];
      }
    >();

    for (const row of rows) {
      const {
        award_category_id,
        award_category_name,
        award_year,
        award_template_id,
        award_sort_order,
        award_credited_person,
        ...entry
      } = row;

      let record = byMediaId.get(entry.id);
      if (!record) {
        record = {
          entry,
          yearsSet: new Set<number>(),
          awards: [],
        };
        byMediaId.set(entry.id, record);
      }

      record.yearsSet.add(award_year);
      record.awards.push({
        categoryId: award_category_id,
        categoryName: award_category_name,
        year: award_year,
        templateId: award_template_id,
        sortOrder: award_sort_order,
        creditedPerson: award_credited_person,
      });
    }

    const result: MostAwardedEntry[] = [];
    for (const record of byMediaId.values()) {
      if (record.awards.length < minWins) continue;
      result.push({
        entry: record.entry,
        winCount: record.awards.length,
        years: [...record.yearsSet],
        awards: record.awards,
      });
    }

    result.sort((a, b) => {
      if (b.winCount !== a.winCount) return b.winCount - a.winCount;
      const latestA = a.years[0] ?? 0;
      const latestB = b.years[0] ?? 0;
      if (latestB !== latestA) return latestB - latestA;
      const scoreA = a.entry.review_score;
      const scoreB = b.entry.review_score;
      if (scoreA != null && scoreB != null && scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      if (scoreA != null && scoreB == null) return -1;
      if (scoreA == null && scoreB != null) return 1;
      return a.entry.name.localeCompare(b.entry.name);
    });

    return result;
  }
};
