import { dbService, type MediaEntry } from "./db";

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
    
    // Get basic info
    const cols = await db.select<Collection[]>("SELECT * FROM collections ORDER BY name ASC");
    
    // Enrich with counts and thumbnails
    for (const col of cols) {
        // Count items
        const countRes = await db.select<{c: number}[]>(
            "SELECT COUNT(*) as c FROM collection_items WHERE collection_id = $1", 
            [col.id]
        );
        col.item_count = countRes[0].c;

        // Get first 4 images for thumbnail grid
        const thumbs = await db.select<{image_url: string}[]>(
            `SELECT m.image_url 
             FROM collection_items ci 
             JOIN javs m ON ci.media_id = m.id 
             WHERE ci.collection_id = $1 
             ORDER BY ci.sort_order ASC LIMIT 4`,
            [col.id]
        );
        col.thumbnails = thumbs.map(t => t.image_url);
    }
    
    return cols;
  },

  // 2. Get Items in a Collection
  async getCollectionItems(collectionId: number): Promise<MediaEntry[]> {
    const db = await dbService.connect();
    return await db.select<MediaEntry[]>(
        `SELECT m.* 
         FROM collection_items ci 
         JOIN javs m ON ci.media_id = m.id 
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
    
    // Get current max sort order
    const maxSort = await db.select<{m: number}[]>("SELECT MAX(sort_order) as m FROM collection_items WHERE collection_id = $1", [collectionId]);
    let currentSort = (maxSort[0].m || 0) + 1;

    for (const mid of mediaIds) {
        // Check if exists first to avoid duplicates (optional, based on your schema)
        const exists = await db.select<{c: number}[]>(
            "SELECT COUNT(*) as c FROM collection_items WHERE collection_id = $1 AND media_id = $2",
            [collectionId, mid]
        );
        
        if (exists[0].c === 0) {
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