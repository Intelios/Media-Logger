import { dbService, adultExclusionSql, type MediaEntry } from "./db";
import { invoke } from "@tauri-apps/api/core";

export interface Collection {
  id: number;
  name: string;
  description: string | null;
  created_date: string;
  sort_order: number; // Position under the Custom sort on the Collections screen
  item_count?: number; // Calculated field
  thumbnails?: string[]; // For cover preview
}

// A named, colored sub-grouping within a collection. Eras are a pure overlay:
// they never reorder items, they only let the UI draw a bracket around the
// items that share an era. Items keep their sort_order.
export interface Era {
  id: number;
  collection_id: number;
  name: string;
  color: string; // hex, e.g. '#0EA5E9'
  sort_order: number;
  created_date: string;
}

// A MediaEntry as rendered inside a collection detail view, augmented with the
// era it belongs to (null when the item is ungrouped).
export interface CollectionItemView extends MediaEntry {
  era_id: number | null;
  era_name: string | null;
  era_color: string | null;
}

export const collectionsLogic = {
  // 1. Get All Collections with stats
  async getAllCollections(): Promise<Collection[]> {
    const db = await dbService.connect();

    // Fetch collections with item counts in one query (avoids per-collection COUNT queries).
    // Join through to entries so item_count reflects only entries that resolve and pass the
    // adult filter — the exclusion goes in the ON clause (not WHERE) so empty collections
    // still count 0. COUNT(m.id) then only tallies rows where the entries join succeeded.
    // Returned in the Custom order; the Collections screen re-sorts in memory
    // when another sort mode is active (see `src/lib/collections/sorting.ts`).
    const cols = await db.select<(Collection & { item_count: number })[]>(
      `SELECT c.id, c.name, c.description, c.created_date, c.sort_order, COUNT(m.id) as item_count
       FROM collections c
       LEFT JOIN collection_items ci ON ci.collection_id = c.id
       LEFT JOIN entries m ON ci.media_id = m.id${adultExclusionSql()}
       GROUP BY c.id, c.name, c.description, c.created_date, c.sort_order
       ORDER BY c.sort_order ASC, c.name ASC`
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
  async getCollectionItems(collectionId: number): Promise<CollectionItemView[]> {
    const db = await dbService.connect();
    return await db.select<CollectionItemView[]>(
        `SELECT m.*, ce.id AS era_id, ce.name AS era_name, ce.color AS era_color
         FROM collection_items ci 
         JOIN entries m ON ci.media_id = m.id 
         LEFT JOIN collection_eras ce ON ce.id = ci.era_id
         WHERE ci.collection_id = $1 
         ORDER BY ci.sort_order ASC`,
        [collectionId]
    );
  },

  // 2b. Get all eras for a collection, ordered by their sort_order
  async getEras(collectionId: number): Promise<Era[]> {
    const db = await dbService.connect();
    return await db.select<Era[]>(
      `SELECT * FROM collection_eras
       WHERE collection_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [collectionId]
    );
  },

  // 2c. Persist a full era list for a collection (create/update/delete/reorder
  // reconciled in one pass — the modal edits a local copy and commits on save).
  async saveEras(collectionId: number, eras: Era[]) {
    const db = await dbService.connect();
    const existing = await this.getEras(collectionId);
    const existingById = new Map(existing.map(e => [e.id, e]));
    const incomingIds = new Set(eras.filter(e => e.id > 0).map(e => e.id));

    for (const era of existing) {
      if (!incomingIds.has(era.id)) {
        // Items referencing a removed era become ungrouped (no FK enforcement).
        await db.execute("UPDATE collection_items SET era_id = NULL WHERE era_id = $1", [era.id]);
        await db.execute("DELETE FROM collection_eras WHERE id = $1", [era.id]);
      }
    }

    for (let i = 0; i < eras.length; i++) {
      const era = eras[i];
      if (era.id > 0 && existingById.has(era.id)) {
        await db.execute(
          "UPDATE collection_eras SET name = $1, color = $2, sort_order = $3 WHERE id = $4",
          [era.name, era.color, i, era.id]
        );
      } else if (era.id <= 0) {
        await db.execute(
          "INSERT INTO collection_eras (collection_id, name, color, sort_order, created_date) VALUES ($1, $2, $3, $4, datetime('now'))",
          [collectionId, era.name, era.color, i]
        );
      }
    }
  },

  // 2d. Assign (or clear) an item's era. Eras never move the item — only the
  // era_id reference changes, so the item stays exactly where it was sorted.
  async setItemEra(collectionId: number, mediaId: number, eraId: number | null) {
    const db = await dbService.connect();
    await db.execute(
      "UPDATE collection_items SET era_id = $1 WHERE collection_id = $2 AND media_id = $3",
      [eraId, collectionId, mediaId]
    );
  },

  // 3. Create Collection. A new collection lands at the end of the Custom
  // order rather than sharing position 0 with whatever is already first.
  async createCollection(name: string, description: string) {
    const db = await dbService.connect();
    await db.execute(
        `INSERT INTO collections (name, description, created_date, sort_order)
         VALUES ($1, $2, datetime('now'), (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM collections))`,
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
    await db.execute("DELETE FROM collection_eras WHERE collection_id = $1", [id]);
    await db.execute("DELETE FROM collections WHERE id = $1", [id]);
  },

  // 5. Add Items to Collection
  async addItems(collectionId: number, mediaIds: number[]) {
    if (mediaIds.length === 0) return;
    const db = await dbService.connect();
    await invoke('database_add_collection_items', {
      databaseUrl: db.path,
      collectionId,
      mediaIds,
    });
  },

  // 6. Remove Item
  async removeItem(collectionId: number, mediaId: number) {
    const db = await dbService.connect();
    await db.execute("DELETE FROM collection_items WHERE collection_id = $1 AND media_id = $2", [collectionId, mediaId]);
  },

  // 7. Update Item Order
  async updateItemOrder(collectionId: number, mediaIds: number[]) {
    const db = await dbService.connect();
    await invoke('database_reorder_collection_items', {
      databaseUrl: db.path,
      collectionId,
      mediaIds,
    });
  },

  // 8. Update the Custom order of the collections themselves. Takes the full
  // list in its new order — positions are rewritten from the array index.
  async updateCollectionOrder(collectionIds: number[]) {
    const db = await dbService.connect();
    await invoke('database_reorder_collections', {
      databaseUrl: db.path,
      collectionIds,
    });
  }
};
