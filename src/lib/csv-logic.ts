import { dbService, type MediaEntry } from "./db";

// CSV parsing and generation utilities

/**
 * Escape a value for CSV format
 */
function escapeCSV(value: unknown): string {
    if (value === null || value === undefined) {
        return "";
    }
    const str = String(value);
    // If the value contains comma, newline, or quote, wrap in quotes and escape existing quotes
    if (str.includes(",") || str.includes("\n") || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Parse a CSV string into array of objects
 */
function parseCSV<T>(csvContent: string): T[] {
    const rows = parseCSVRows(csvContent);
    if (rows.length < 2) return [];

    // Parse header row
    const headers = rows[0];
    const results: T[] = [];

    for (let i = 1; i < rows.length; i++) {
        const values = rows[i];
        if (values.every(v => v.trim() === "")) continue;

        const obj: Record<string, unknown> = {};

        headers.forEach((header, idx) => {
            const rawValue = values[idx] ?? "";
            const normalizedValue = rawValue.trim();
            let value: unknown = rawValue;

            // Convert numeric strings to numbers where appropriate
            if (normalizedValue === "") {
                value = null;
            } else if (/^\d+$/.test(normalizedValue)) {
                value = parseInt(normalizedValue, 10);
            } else if (/^\d+\.\d+$/.test(normalizedValue)) {
                value = parseFloat(normalizedValue);
            }
            obj[header] = value;
        });

        results.push(obj as T);
    }

    return results;
}

/**
 * Parse CSV into rows, handling quoted multiline values
 */
function parseCSVRows(csvContent: string): string[][] {
    const normalizedContent = csvContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = "";
    let inQuotes = false;
    let i = 0;

    while (i < normalizedContent.length) {
        const char = normalizedContent[i];

        if (char === '"') {
            if (inQuotes && normalizedContent[i + 1] === '"') {
                currentCell += '"';
                i += 2;
            } else {
                inQuotes = !inQuotes;
                i++;
            }
            continue;
        }

        if (char === "," && !inQuotes) {
            currentRow.push(currentCell);
            currentCell = "";
            i++;
            continue;
        }

        if (char === "\n" && !inQuotes) {
            currentRow.push(currentCell);
            rows.push(currentRow);
            currentRow = [];
            currentCell = "";
            i++;
            continue;
        }

        currentCell += char;
        i++;
    }

    // Handle last row if file doesn't end with newline
    if (currentCell.length > 0 || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
    }

    return rows;
}

/**
 * Convert array of objects to CSV string
 */
function toCSV<T extends Record<string, unknown>>(data: T[], columns: string[]): string {
    if (data.length === 0) {
        return columns.join(",") + "\n";
    }

    const header = columns.join(",");
    const rows = data.map((item) =>
        columns.map((col) => escapeCSV(item[col])).join(",")
    );

    return [header, ...rows].join("\n");
}

// ============ EXPORT FUNCTIONS ============

export interface ExportData {
    media_entries: string;
    collections: string;
    collection_items: string;
    award_templates: string;
    award_categories: string;
    award_winners: string;
    profiles?: string;
    export_date: string;
    version: string;
}

const MEDIA_COLUMNS = [
    "id",
    "name",
    "genre",
    "completion_date",
    "review_score",
    "description",
    "year_completed",
    "is_rewatch",
    "own_local_copy",
    "is_platinum",
    "image_url",
    "entry_type",
    "platform",
    "author",
    "artist",
    "director",
    "actress",
    "update_version",
    "franchise",
];

const COLLECTION_COLUMNS = ["id", "name", "description", "created_date"];
const COLLECTION_ITEM_COLUMNS = ["collection_id", "media_id", "sort_order"];
const AWARD_TEMPLATE_COLUMNS = ["id", "name", "created_date"];
const AWARD_CATEGORY_COLUMNS = ["id", "name", "year", "sort_order", "template_id"];
const AWARD_WINNER_COLUMNS = ["category_id", "media_id", "selected_date"];
const PROFILE_COLUMNS = ["type", "name", "image_url"];

/**
 * Export all data from the database as CSV strings
 */
export async function exportAllData(): Promise<ExportData> {
    const db = await dbService.connect();

    // Export media entries
    const mediaEntries = await db.select<MediaEntry[]>(
        "SELECT * FROM entries ORDER BY id ASC"
    );

    // Export collections
    const collections = await db.select<
        { id: number; name: string; description: string | null; created_date: string }[]
    >("SELECT * FROM collections ORDER BY id ASC");

    // Export collection items
    const collectionItems = await db.select<
        { collection_id: number; media_id: number; sort_order: number }[]
    >("SELECT * FROM collection_items ORDER BY collection_id ASC, sort_order ASC");

    // Export award templates
    const awardTemplates = await db.select<
        { id: number; name: string; created_date: string }[]
    >("SELECT * FROM award_templates ORDER BY id ASC");

    // Export award categories
    const awardCategories = await db.select<
        { id: number; name: string; year: number; sort_order: number; template_id: number | null }[]
    >("SELECT * FROM award_categories ORDER BY id ASC");

    // Export award winners
    const awardWinners = await db.select<
        { category_id: number; media_id: number; selected_date: string }[]
    >("SELECT * FROM award_winners ORDER BY category_id ASC");

    // Export profile image mappings
    const profiles = await db.select<
        { type: string; name: string; image_url: string }[]
    >("SELECT * FROM profiles ORDER BY type ASC, name ASC");

    return {
        media_entries: toCSV(mediaEntries as unknown as Record<string, unknown>[], MEDIA_COLUMNS),
        collections: toCSV(collections, COLLECTION_COLUMNS),
        collection_items: toCSV(collectionItems, COLLECTION_ITEM_COLUMNS),
        award_templates: toCSV(awardTemplates, AWARD_TEMPLATE_COLUMNS),
        award_categories: toCSV(awardCategories, AWARD_CATEGORY_COLUMNS),
        award_winners: toCSV(awardWinners, AWARD_WINNER_COLUMNS),
        profiles: toCSV(profiles, PROFILE_COLUMNS),
        export_date: new Date().toISOString(),
        version: "1.1",
    };
}

/**
 * Create a combined export file (JSON with embedded CSVs)
 */
export async function exportToFile(): Promise<string> {
    const data = await exportAllData();
    return JSON.stringify(data, null, 2);
}

// ============ IMPORT FUNCTIONS ============

export interface ImportResult {
    success: boolean;
    mediaEntriesImported: number;
    mediaEntriesSkipped: number;
    collectionsImported: number;
    collectionsSkipped: number;
    awardTemplatesImported: number;
    awardCategoriesImported: number;
    awardWinnersImported: number;
    profilesImported: number;
    errors: string[];
}

/**
 * Ensure all required tables exist in the database
 * This is needed when importing into a fresh/empty database
 */
async function ensureTablesExist(): Promise<void> {
    const db = await dbService.connect();

    // Create entries (media entries) table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            genre TEXT,
            completion_date TEXT,
            review_score REAL,
            description TEXT,
            year_completed INTEGER,
            is_rewatch INTEGER DEFAULT 0,
            own_local_copy INTEGER DEFAULT 0,
            is_platinum INTEGER DEFAULT 0,
            image_url TEXT,
            entry_type TEXT,
            platform TEXT,
            author TEXT,
            artist TEXT,
            director TEXT,
            actress TEXT,
            update_version TEXT,
            franchise TEXT
        )
    `);

    // Create collections table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            created_date TEXT NOT NULL
        )
    `);

    // Create collection_items table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS collection_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            collection_id INTEGER NOT NULL,
            media_id INTEGER NOT NULL,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (collection_id) REFERENCES collections(id),
            FOREIGN KEY (media_id) REFERENCES entries(id)
        )
    `);

    // Create award_templates table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS award_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_date TEXT NOT NULL
        )
    `);

    // Create award_categories table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS award_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            year INTEGER NOT NULL,
            created_date TEXT,
            sort_order INTEGER DEFAULT 0,
            template_id INTEGER,
            FOREIGN KEY (template_id) REFERENCES award_templates(id)
        )
    `);

    // Create award_winners table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS award_winners (
            category_id INTEGER PRIMARY KEY,
            media_id INTEGER NOT NULL,
            selected_date TEXT,
            FOREIGN KEY (category_id) REFERENCES award_categories(id),
            FOREIGN KEY (media_id) REFERENCES entries(id)
        )
    `);

    // Create profiles table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS profiles (
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            image_url TEXT NOT NULL,
            PRIMARY KEY (type, name)
        )
    `);

    console.log('[CSV] All tables ensured to exist');
}

/**
 * Import data from an export file
 * Uses Option A: Skip duplicates (match by name + completion_date for media)
 */
export async function importFromFile(fileContent: string): Promise<ImportResult> {
    const result: ImportResult = {
        success: true,
        mediaEntriesImported: 0,
        mediaEntriesSkipped: 0,
        collectionsImported: 0,
        collectionsSkipped: 0,
        awardTemplatesImported: 0,
        awardCategoriesImported: 0,
        awardWinnersImported: 0,
        profilesImported: 0,
        errors: [],
    };

    try {
        const data: ExportData = JSON.parse(fileContent);

        // Ensure all required tables exist (for fresh databases)
        await ensureTablesExist();

        const db = await dbService.connect();

        // Maps for ID remapping (old ID -> new ID)
        const mediaIdMap = new Map<number, number>();
        const collectionIdMap = new Map<number, number>();
        const templateIdMap = new Map<number, number>();
        const categoryIdMap = new Map<number, number>();

        // 1. Import media entries
        if (data.media_entries) {
            const entries = parseCSV<MediaEntry>(data.media_entries);
            console.log(`[CSV] Parsed ${entries.length} media entries`);

            for (const entry of entries) {
                // Skip entries with missing required fields
                if (!entry.name || entry.name === null) {
                    console.log('[CSV] Skipping entry with missing name');
                    continue;
                }

                const oldId = entry.id;

                // Check for duplicate by name + completion_date
                const existing = await db.select<{ id: number }[]>(
                    "SELECT id FROM entries WHERE name = $1 AND completion_date = $2",
                    [entry.name, entry.completion_date]
                );

                if (existing.length > 0) {
                    // Map to existing entry
                    mediaIdMap.set(oldId, existing[0].id);
                    result.mediaEntriesSkipped++;
                    continue;
                }

                // Insert new entry (without the old ID)
                const { id: _, ...entryData } = entry;

                // Filter out null/undefined values for optional fields but keep required ones
                const filteredData: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(entryData)) {
                    // Include all fields, even if null (database handles defaults)
                    filteredData[key] = value;
                }

                const keys = Object.keys(filteredData);
                const values = Object.values(filteredData);
                const placeholders = keys.map((_, i) => `$${i + 1}`).join(",");

                try {
                    const insertResult: any = await db.execute(
                        `INSERT INTO entries (${keys.join(",")}) VALUES (${placeholders})`,
                        values
                    );

                    mediaIdMap.set(oldId, insertResult.lastInsertId);
                    result.mediaEntriesImported++;
                } catch (insertError) {
                    console.error('[CSV] Failed to insert entry:', entry.name, insertError);
                    result.errors.push(`Failed to import: ${entry.name}`);
                }
            }
        }

        // 2. Import collections
        if (data.collections) {
            const collections = parseCSV<{
                id: number;
                name: string;
                description: string | null;
                created_date: string;
            }>(data.collections);

            for (const col of collections) {
                const oldId = col.id;

                // Check for duplicate by name
                const existing = await db.select<{ id: number }[]>(
                    "SELECT id FROM collections WHERE name = $1",
                    [col.name]
                );

                if (existing.length > 0) {
                    collectionIdMap.set(oldId, existing[0].id);
                    result.collectionsSkipped++;
                    continue;
                }

                // Insert new collection
                const insertResult: any = await db.execute(
                    "INSERT INTO collections (name, description, created_date) VALUES ($1, $2, $3)",
                    [col.name, col.description, col.created_date]
                );

                collectionIdMap.set(oldId, insertResult.lastInsertId);
                result.collectionsImported++;
            }
        }

        // 3. Import collection items (with ID remapping)
        if (data.collection_items) {
            const items = parseCSV<{
                collection_id: number;
                media_id: number;
                sort_order: number;
            }>(data.collection_items);

            for (const item of items) {
                const newCollectionId = collectionIdMap.get(item.collection_id);
                const newMediaId = mediaIdMap.get(item.media_id);

                if (!newCollectionId || !newMediaId) continue;

                // Check if already exists
                const existing = await db.select<{ collection_id: number }[]>(
                    "SELECT collection_id FROM collection_items WHERE collection_id = $1 AND media_id = $2",
                    [newCollectionId, newMediaId]
                );

                if (existing.length > 0) continue;

                await db.execute(
                    "INSERT INTO collection_items (collection_id, media_id, sort_order) VALUES ($1, $2, $3)",
                    [newCollectionId, newMediaId, item.sort_order]
                );
            }
        }

        // 4. Import award templates
        if (data.award_templates) {
            const templates = parseCSV<{
                id: number;
                name: string;
                created_date: string;
            }>(data.award_templates);

            for (const template of templates) {
                const oldId = template.id;

                // Check for duplicate by name
                const existing = await db.select<{ id: number }[]>(
                    "SELECT id FROM award_templates WHERE name = $1",
                    [template.name]
                );

                if (existing.length > 0) {
                    templateIdMap.set(oldId, existing[0].id);
                    continue;
                }

                const insertResult: any = await db.execute(
                    "INSERT INTO award_templates (name, created_date) VALUES ($1, $2)",
                    [template.name, template.created_date]
                );

                templateIdMap.set(oldId, insertResult.lastInsertId);
                result.awardTemplatesImported++;
            }
        }

        // 5. Import award categories
        if (data.award_categories) {
            const categories = parseCSV<{
                id: number;
                name: string;
                year: number;
                sort_order: number;
                template_id: number | null;
            }>(data.award_categories);

            for (const cat of categories) {
                const oldId = cat.id;

                // Check for duplicate by name + year
                const existing = await db.select<{ id: number }[]>(
                    "SELECT id FROM award_categories WHERE name = $1 AND year = $2",
                    [cat.name, cat.year]
                );

                if (existing.length > 0) {
                    categoryIdMap.set(oldId, existing[0].id);
                    continue;
                }

                const newTemplateId = cat.template_id ? templateIdMap.get(cat.template_id) : null;

                const insertResult: any = await db.execute(
                    "INSERT INTO award_categories (name, year, created_date, sort_order, template_id) VALUES ($1, $2, datetime('now'), $3, $4)",
                    [cat.name, cat.year, cat.sort_order, newTemplateId]
                );

                categoryIdMap.set(oldId, insertResult.lastInsertId);
                result.awardCategoriesImported++;
            }
        }

        // 6. Import award winners
        if (data.award_winners) {
            const winners = parseCSV<{
                category_id: number;
                media_id: number;
                selected_date: string;
            }>(data.award_winners);

            for (const winner of winners) {
                const newCategoryId = categoryIdMap.get(winner.category_id);
                const newMediaId = mediaIdMap.get(winner.media_id);

                if (!newCategoryId || !newMediaId) continue;

                // Check if already exists
                const existing = await db.select<{ category_id: number }[]>(
                    "SELECT category_id FROM award_winners WHERE category_id = $1",
                    [newCategoryId]
                );

                if (existing.length > 0) continue;

                await db.execute(
                    "INSERT OR REPLACE INTO award_winners (category_id, media_id, selected_date) VALUES ($1, $2, $3)",
                    [newCategoryId, newMediaId, winner.selected_date]
                );

                result.awardWinnersImported++;
            }
        }

        // 7. Import profile image mappings
        if (data.profiles) {
            const profiles = parseCSV<{
                type: string;
                name: string;
                image_url: string;
            }>(data.profiles);

            for (const profile of profiles) {
                if (!profile.type || !profile.name || !profile.image_url) continue;

                const existing = await db.select<{ image_url: string }[]>(
                    "SELECT image_url FROM profiles WHERE type = $1 AND name = $2",
                    [profile.type, profile.name]
                );

                if (existing.length === 0) {
                    await db.execute(
                        "INSERT INTO profiles (type, name, image_url) VALUES ($1, $2, $3)",
                        [profile.type, profile.name, profile.image_url]
                    );
                    result.profilesImported++;
                    continue;
                }

                if (existing[0].image_url !== profile.image_url) {
                    await db.execute(
                        "UPDATE profiles SET image_url = $1 WHERE type = $2 AND name = $3",
                        [profile.image_url, profile.type, profile.name]
                    );
                    result.profilesImported++;
                }
            }
        }
    } catch (error) {
        result.success = false;
        result.errors.push(String(error));
    }

    return result;
}

/**
 * Get stats about current database for display
 */
export async function getDataStats(): Promise<{
    mediaCount: number;
    collectionCount: number;
    awardCount: number;
}> {
    const db = await dbService.connect();

    const [mediaResult, collectionResult, awardResult] = await Promise.all([
        db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM entries"),
        db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM collections"),
        db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM award_categories"),
    ]);

    return {
        mediaCount: mediaResult[0].count,
        collectionCount: collectionResult[0].count,
        awardCount: awardResult[0].count,
    };
}
