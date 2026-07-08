import { dbService, type BacklogItem, type MediaEntry } from "./db";

export interface BacklogItemsByStatus {
  inProgress: BacklogItem[];
  planning: BacklogItem[];
  unreleased: BacklogItem[];
}

// Soonest release first; undated items last, falling back to manual sort_order.
// ISO YYYY-MM-DD strings compare chronologically as plain strings.
const byReleaseDate = (a: BacklogItem, b: BacklogItem): number => {
  if (a.release_date && b.release_date) return a.release_date.localeCompare(b.release_date);
  if (a.release_date) return -1;
  if (b.release_date) return 1;
  return a.sort_order - b.sort_order;
};

export const backlogLogic = {
  async getAllItems(): Promise<BacklogItemsByStatus> {
    const items = await dbService.getAllBacklogItems();
    return {
      inProgress: items.filter(i => i.status === 'in_progress'),
      planning: items.filter(i => i.status === 'planning'),
      unreleased: items.filter(i => i.status === 'unreleased').sort(byReleaseDate),
    };
  },

  async addItem(
    name: string,
    entryType: string,
    genre?: string | null,
    imageUrl?: string | null,
    status: BacklogItem['status'] = 'planning',
    releaseDate?: string | null
  ): Promise<number> {
    const sortOrder = await dbService.getNextBacklogSortOrder(status);

    return await dbService.addBacklogItem({
      name,
      entry_type: entryType,
      genre: genre ?? null,
      image_url: imageUrl ?? null,
      status,
      added_date: new Date().toISOString().split('T')[0],
      sort_order: sortOrder,
      release_date: releaseDate ?? null,
    });
  },

  async moveToInProgress(id: number): Promise<void> {
    await dbService.updateBacklogStatus(id, 'in_progress');
  },

  async moveToPlanning(id: number): Promise<void> {
    await dbService.updateBacklogStatus(id, 'planning');
  },

  async moveToUnreleased(id: number): Promise<void> {
    await dbService.updateBacklogStatus(id, 'unreleased');
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

  async updateItemOrder(status: BacklogItem['status'], ids: number[]): Promise<void> {
    await dbService.updateBacklogItemOrder(status, ids);
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
