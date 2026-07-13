import { dbService, adultExclusionSql, type MediaEntry } from "./db";

export interface Collection {
  id: number;
  name: string;
  description: string | null;
  created_date: string;
  item_count?: number; // Calculated field
  thumbnails?: string[]; // For cover preview
}

export const collectionsLogic = {
  // 1. Get All Collections with stats
  async getAllCollections(): Promise<Collection[]> {
    const db = await dbService.connect();

    // Fetch collections with item counts in one query (avoids per-collection COUNT queries).
    // Join through to entries so item_count reflects only entries that resolve and pass the
    // adult filter — the exclusion goes in the ON clause (not WHERE) so empty collections
    // still count 0. COUNT(m.id) then only tallies rows where the entries join succeeded.
    const cols = await db.select<(Collection & { item_count: number })[]>(
      `SELECT c.id, c.name, c.description, c.created_date, COUNT(m.id) as item_count
       FROM collections c
       LEFT JOIN collection_items ci ON ci.collection_id = c.id
       LEFT JOIN entries m ON ci.media_id = m.id${adultExclusionSql()}
       GROUP BY c.id, c.name, c.description, c.created_date
       ORDER BY c.name ASC`
    );

    // Fetch only the first 4 visible thumbnails per collection. A window
    // function ranks each collection's candidates in the DB so we transfer at
    // most 4 rows per collection instead of every item. Adult entries are
    // excluded here when the Adult Media setting is off (m.entry_type resolves
    // unambiguously — collection_items has no entry_type column).
    const thumbnailRows = await db.select<{ collection_id: number; image_url: string }[]>(
      `SELECT collection_id, image_url
       FROM (
         SELECT ci.collection_id AS collection_id, m.image_url AS image_url,
                ROW_NUMBER() OVER (
                  PARTITION BY ci.collection_id
                  ORDER BY ci.sort_order ASC, ci.id ASC
                ) AS rn
         FROM collection_items ci
         JOIN entries m ON ci.media_id = m.id
         WHERE m.image_url IS NOT NULL AND m.image_url <> ''${adultExclusionSql()}
       )
       WHERE rn <= 4
       ORDER BY collection_id ASC, rn ASC`
    );

    const thumbnailsByCollection = new Map<number, string[]>();
    for (const row of thumbnailRows) {
      const existing = thumbnailsByCollection.get(row.collection_id) || [];
      existing.push(row.image_url);
      thumbnailsByCollection.set(row.collection_id, existing);
    }

    for (const col of cols) {
      col.thumbnails = thumbnailsByCollection.get(col.id) || [];
    }

    return cols;
  },

  // 2. Get Items in a Collection
  async getCollectionItems(collectionId: number): Promise<MediaEntry[]> {
    const db = await dbService.connect();
    return await db.select<MediaEntry[]>(
        `SELECT m.* 
         FROM collection_items ci 
         JOIN entries m ON ci.media_id = m.id 
         WHERE ci.collection_id = $1 
         ORDER BY ci.sort_order ASC`,
        [collectionId]
    );
  },

  // 3. Create Collection
  async createCollection(name: string, description: string) {
    const db = await dbService.connect();
    await db.execute(
        "INSERT INTO collections (name, description, created_date) VALUES ($1, $2, datetime('now'))",
        [name, description]
    );
  },

  // 4. Update Collection
  async updateCollection(id: number, name: string, description: string) {
    const db = await dbService.connect();
    await db.execute(
      "UPDATE collections SET name = $1, description = $2 WHERE id = $3",
      [name, description, id]
    );
  },

  // 5. Delete Collection
  async deleteCollection(id: number) {
    const db = await dbService.connect();
    await db.execute("DELETE FROM collection_items WHERE collection_id = $1", [id]);
    await db.execute("DELETE FROM collections WHERE id = $1", [id]);
  },

  // 5. Add Items to Collection
  async addItems(collectionId: number, mediaIds: number[]) {
    const db = await dbService.connect();
    if (mediaIds.length === 0) return;
    
    // Get current max sort order
    const maxSort = await db.select<{m: number}[]>("SELECT MAX(sort_order) as m FROM collection_items WHERE collection_id = $1", [collectionId]);
    let currentSort = (maxSort[0].m || 0) + 1;

    const placeholders = mediaIds.map((_, index) => `$${index + 2}`).join(", ");
    const existingRows = await db.select<{ media_id: number }[]>(
      `SELECT media_id
       FROM collection_items
       WHERE collection_id = $1 AND media_id IN (${placeholders})`,
      [collectionId, ...mediaIds]
    );
    const existingIds = new Set(existingRows.map((row) => row.media_id));

    for (const mid of mediaIds) {
      if (!existingIds.has(mid)) {
        await db.execute(
          "INSERT INTO collection_items (collection_id, media_id, sort_order) VALUES ($1, $2, $3)",
          [collectionId, mid, currentSort++]
        );
      }
    }
  },

  // 6. Remove Item
  async removeItem(collectionId: number, mediaId: number) {
    const db = await dbService.connect();
    await db.execute("DELETE FROM collection_items WHERE collection_id = $1 AND media_id = $2", [collectionId, mediaId]);
  },

  // 7. Update Item Order
  async updateItemOrder(collectionId: number, mediaIds: number[]) {
    const db = await dbService.connect();
    
    // We update them sequentially. 
    // Since this is local SQLite, doing a loop of updates is fast enough for <100 items.
    // If you had thousands, we'd use a transaction, but this is fine here.
    for (let i = 0; i < mediaIds.length; i++) {
        await db.execute(
            "UPDATE collection_items SET sort_order = $1 WHERE collection_id = $2 AND media_id = $3",
            [i, collectionId, mediaIds[i]]
        );
    }
  }
};
