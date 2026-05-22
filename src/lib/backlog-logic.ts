import { dbService, type BacklogItem, type MediaEntry } from "./db";

export interface BacklogItemsByStatus {
  inProgress: BacklogItem[];
  planning: BacklogItem[];
}

export const backlogLogic = {
  async getAllItems(): Promise<BacklogItemsByStatus> {
    const items = await dbService.getAllBacklogItems();
    return {
      inProgress: items.filter(i => i.status === 'in_progress'),
      planning: items.filter(i => i.status === 'planning'),
    };
  },

  async addItem(
    name: string,
    entryType: string,
    genre?: string | null,
    imageUrl?: string | null
  ): Promise<number> {
    return await dbService.addBacklogItem({
      name,
      entry_type: entryType,
      genre: genre ?? null,
      image_url: imageUrl ?? null,
      status: 'planning',
      added_date: new Date().toISOString().split('T')[0],
      sort_order: 0,
    });
  },

  async moveToInProgress(id: number): Promise<void> {
    await dbService.updateBacklogStatus(id, 'in_progress');
  },

  async moveToPlanning(id: number): Promise<void> {
    await dbService.updateBacklogStatus(id, 'planning');
  },

  async removeItem(id: number): Promise<void> {
    await dbService.deleteBacklogItem(id);
  },

  async updateItem(id: number, fields: Partial<Omit<BacklogItem, 'id'>>): Promise<void> {
    const all = await dbService.getAllBacklogItems();
    const existing = all.find(i => i.id === id);
    if (!existing) return;

    await dbService.updateBacklogItem({ ...existing, ...fields });
  },

  async getCountsByType(): Promise<Record<string, number>> {
    const items = await dbService.getAllBacklogItems();
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.entry_type] = (counts[item.entry_type] || 0) + 1;
    }
    return counts;
  },

  prepareForCompletion(item: BacklogItem): Partial<MediaEntry> {
    return {
      name: item.name,
      entry_type: item.entry_type,
      genre: item.genre,
      image_url: item.image_url,
      completion_date: new Date().toISOString().split('T')[0],
      year_completed: new Date().getFullYear(),
      is_rewatch: 0,
      own_local_copy: 0,
      has_subtitles: 0,
      is_platinum: 0,
      is_completed: 0,
      is_early_access: 0,
    };
  },
};
