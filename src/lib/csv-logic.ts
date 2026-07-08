import { dbService, type MediaEntry, type BacklogItem } from "./db";

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
function parseCSV<T>(csvContent: string, numericColumns?: Set<string>): T[] {
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

            // Empty cells become null. Numeric coercion is applied ONLY to
            // columns known to be numeric; text columns are left as strings so
            // numeric-looking values (titles like "1917", versions like "007")
            // survive the round-trip without losing leading zeros or being
            // mis-compared during duplicate detection.
            if (normalizedValue === "") {
                value = null;
            } else if (numericColumns?.has(header)) {
                if (/^\d+$/.test(normalizedValue)) {
                    value = parseInt(normalizedValue, 10);
                } else if (/^\d+\.\d+$/.test(normalizedValue)) {
                    value = parseFloat(normalizedValue);
                }
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
    award_years?: string;
    award_templates: string;
    award_categories: string;
    award_winners: string;
    profiles?: string;
    hidden_profiles?: string;
    backlog_items?: string;
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
    "notes",
    "year_completed",
    "is_rewatch",
    "own_local_copy",
    "has_subtitles",
    "is_platinum",
    "is_completed",
    "is_early_access",
    "early_access_version",
    "image_url",
    "entry_type",
    "platform",
    "author",
    "artist",
    "director",
    "actress",
    "update_version",
    "franchise",
    "series",
];

const COLLECTION_COLUMNS = ["id", "name", "description", "created_date"];
const COLLECTION_ITEM_COLUMNS = ["collection_id", "media_id", "sort_order"];
const AWARD_YEAR_COLUMNS = ["year", "created_date"];
const AWARD_TEMPLATE_COLUMNS = ["id", "name", "created_date"];
const AWARD_CATEGORY_COLUMNS = ["id", "name", "year", "sort_order", "template_id"];
const AWARD_WINNER_COLUMNS = ["category_id", "media_id", "selected_date"];
const PROFILE_COLUMNS = ["type", "name", "image_url", "crop_data"];
const HIDDEN_PROFILE_COLUMNS = ["type", "name", "hidden_date"];
const BACKLOG_COLUMNS = ["id", "name", "entry_type", "genre", "image_url", "status", "added_date", "sort_order", "release_date"];

// Columns that must be parsed as numbers on import. Everything else stays a
// string (see parseCSV). ID and foreign-key columns MUST be listed here — they
// are used as Map<number, number> keys for cross-table ID remapping during
// import, so they cannot be left as strings.
const MEDIA_NUMERIC_COLUMNS = new Set([
    "id", "review_score", "year_completed", "is_rewatch", "own_local_copy",
    "has_subtitles", "is_platinum", "is_completed", "is_early_access",
]);
const COLLECTION_NUMERIC_COLUMNS = new Set(["id"]);
const COLLECTION_ITEM_NUMERIC_COLUMNS = new Set(["collection_id", "media_id", "sort_order"]);
const AWARD_YEAR_NUMERIC_COLUMNS = new Set(["year"]);
const AWARD_TEMPLATE_NUMERIC_COLUMNS = new Set(["id"]);
const AWARD_CATEGORY_NUMERIC_COLUMNS = new Set(["id", "year", "sort_order", "template_id"]);
const AWARD_WINNER_NUMERIC_COLUMNS = new Set(["category_id", "media_id"]);
const BACKLOG_NUMERIC_COLUMNS = new Set(["id", "sort_order"]);

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
    const awardYears = await db.select<
        { year: number; created_date: string }[]
    >("SELECT * FROM award_years ORDER BY year ASC");

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
        { type: string; name: string; image_url: string; crop_data: string | null }[]
    >("SELECT * FROM profiles ORDER BY type ASC, name ASC");

    // Export hidden profiles
    const hiddenProfiles = await db.select<
        { type: string; name: string; hidden_date: string }[]
    >("SELECT * FROM hidden_profiles ORDER BY type ASC, name ASC");

    // Export backlog items
    const backlogItems = await db.select<BacklogItem[]>(
        "SELECT * FROM backlog_items ORDER BY id ASC"
    );

    return {
        media_entries: toCSV(mediaEntries as unknown as Record<string, unknown>[], MEDIA_COLUMNS),
        collections: toCSV(collections, COLLECTION_COLUMNS),
        collection_items: toCSV(collectionItems, COLLECTION_ITEM_COLUMNS),
        award_years: toCSV(awardYears, AWARD_YEAR_COLUMNS),
        award_templates: toCSV(awardTemplates, AWARD_TEMPLATE_COLUMNS),
        award_categories: toCSV(awardCategories, AWARD_CATEGORY_COLUMNS),
        award_winners: toCSV(awardWinners, AWARD_WINNER_COLUMNS),
        profiles: toCSV(profiles, PROFILE_COLUMNS),
        hidden_profiles: toCSV(hiddenProfiles, HIDDEN_PROFILE_COLUMNS),
        backlog_items: toCSV(backlogItems as unknown as Record<string, unknown>[], BACKLOG_COLUMNS),
        export_date: new Date().toISOString(),
        version: "1.5",
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
    assetsRestored: number;
    errors: string[];
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
        assetsRestored: 0,
        errors: [],
    };

    try {
        const data: ExportData = JSON.parse(fileContent);

        // dbService.connect() runs the canonical migrations / createTables(), so
        // every required table is guaranteed to exist before any insert — even on
        // a fresh database. (Replaces the old, schema-drifting ensureTablesExist.)
        const db = await dbService.connect();

        // Maps for ID remapping (old ID -> new ID)
        const mediaIdMap = new Map<number, number>();
        const collectionIdMap = new Map<number, number>();
        const templateIdMap = new Map<number, number>();
        const categoryIdMap = new Map<number, number>();

        // 1. Import media entries
        if (data.media_entries) {
            const entries = parseCSV<MediaEntry>(data.media_entries, MEDIA_NUMERIC_COLUMNS);
            console.log(`[CSV] Parsed ${entries.length} media entries`);

            // Preload existing (name, completion_date) keys so duplicates are
            // detected with a single query instead of one SELECT per row. Note:
            // tauri-sql runs each execute() on a pooled connection, so a JS-side
            // BEGIN/COMMIT can't atomically wrap the import. Instead the import is
            // idempotent (skip-duplicates), so a run that fails partway can be
            // safely re-run to resume without creating duplicates.
            const existingMediaKeys = new Map<string, number>();
            const existingMediaRows = await db.select<{ id: number; name: string; completion_date: string | null }[]>(
                "SELECT id, name, completion_date FROM entries"
            );
            for (const row of existingMediaRows) {
                existingMediaKeys.set(JSON.stringify([row.name, row.completion_date ?? null]), row.id);
            }

            for (const entry of entries) {
                // Skip entries with missing required fields
                if (!entry.name || entry.name === null) {
                    console.log('[CSV] Skipping entry with missing name');
                    continue;
                }

                const oldId = entry.id;

                // Check for duplicate by name + completion_date against the
                // preloaded key set. The JSON key is null-safe, mirroring the
                // previous `name = ? AND completion_date IS ?` matching semantics.
                const dedupKey = JSON.stringify([entry.name, entry.completion_date ?? null]);
                const existingId = existingMediaKeys.get(dedupKey);

                if (existingId !== undefined) {
                    // Map to existing entry
                    mediaIdMap.set(oldId, existingId);
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
                    // Record the new key so duplicates within the same file are
                    // also skipped (preserving the original per-row behavior).
                    existingMediaKeys.set(dedupKey, insertResult.lastInsertId);
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
            }>(data.collections, COLLECTION_NUMERIC_COLUMNS);

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
            }>(data.collection_items, COLLECTION_ITEM_NUMERIC_COLUMNS);

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

        // 4. Import award years
        if (data.award_years) {
            const awardYears = parseCSV<{
                year: number;
                created_date: string | null;
            }>(data.award_years, AWARD_YEAR_NUMERIC_COLUMNS);

            for (const awardYear of awardYears) {
                if (awardYear.year === null || awardYear.year === undefined) continue;

                await db.execute(
                    "INSERT OR IGNORE INTO award_years (year, created_date) VALUES ($1, $2)",
                    [awardYear.year, awardYear.created_date || new Date().toISOString()]
                );
            }
        }

        // 5. Import award templates
        if (data.award_templates) {
            const templates = parseCSV<{
                id: number;
                name: string;
                created_date: string;
            }>(data.award_templates, AWARD_TEMPLATE_NUMERIC_COLUMNS);

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

        // 6. Import award categories
        if (data.award_categories) {
            const categories = parseCSV<{
                id: number;
                name: string;
                year: number;
                sort_order: number;
                template_id: number | null;
            }>(data.award_categories, AWARD_CATEGORY_NUMERIC_COLUMNS);

            for (const cat of categories) {
                const oldId = cat.id;

                await db.execute(
                    "INSERT OR IGNORE INTO award_years (year, created_date) VALUES ($1, datetime('now'))",
                    [cat.year]
                );

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

        // 7. Import award winners
        if (data.award_winners) {
            const winners = parseCSV<{
                category_id: number;
                media_id: number;
                selected_date: string;
            }>(data.award_winners, AWARD_WINNER_NUMERIC_COLUMNS);

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

        // 8. Import profile image mappings
        if (data.profiles) {
            const profiles = parseCSV<{
                type: string;
                name: string;
                image_url: string;
                crop_data: string | null;
            }>(data.profiles);

            for (const profile of profiles) {
                if (!profile.type || !profile.name || !profile.image_url) continue;

                // Old backups predate the crop_data column; treat missing as null.
                const cropData = profile.crop_data ?? null;

                const existing = await db.select<{ image_url: string; crop_data: string | null }[]>(
                    "SELECT image_url, crop_data FROM profiles WHERE type = $1 AND name = $2",
                    [profile.type, profile.name]
                );

                if (existing.length === 0) {
                    await db.execute(
                        "INSERT INTO profiles (type, name, image_url, crop_data) VALUES ($1, $2, $3, $4)",
                        [profile.type, profile.name, profile.image_url, cropData]
                    );
                    result.profilesImported++;
                    continue;
                }

                if (existing[0].image_url !== profile.image_url || existing[0].crop_data !== cropData) {
                    await db.execute(
                        "UPDATE profiles SET image_url = $1, crop_data = $2 WHERE type = $3 AND name = $4",
                        [profile.image_url, cropData, profile.type, profile.name]
                    );
                    result.profilesImported++;
                }
            }
        }
        // 8.5. Import hidden profiles
        if (data.hidden_profiles) {
            const hiddenProfiles = parseCSV<{
                type: string;
                name: string;
                hidden_date: string;
            }>(data.hidden_profiles);

            for (const hp of hiddenProfiles) {
                if (!hp.type || !hp.name) continue;
                await db.execute(
                    "INSERT OR IGNORE INTO hidden_profiles (type, name, hidden_date) VALUES ($1, $2, $3)",
                    [hp.type, hp.name, hp.hidden_date || new Date().toISOString()]
                );
            }
        }

        // 9. Import backlog items
        if (data.backlog_items) {
            const backlogItems = parseCSV<BacklogItem>(data.backlog_items, BACKLOG_NUMERIC_COLUMNS);

            for (const item of backlogItems) {
                if (!item.name || !item.entry_type) continue;

                const existing = await db.select<{ id: number }[]>(
                    "SELECT id FROM backlog_items WHERE name = $1 AND entry_type = $2",
                    [item.name, item.entry_type]
                );

                if (existing.length > 0) continue;

                await db.execute(
                    "INSERT INTO backlog_items (name, entry_type, genre, image_url, status, added_date, sort_order, release_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                    [item.name, item.entry_type, item.genre, item.image_url, item.status || 'planning', item.added_date || new Date().toISOString().split('T')[0], item.sort_order || 0, item.release_date || null]
                );
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
