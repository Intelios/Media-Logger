import { connect } from './connection';
import { filterHiddenEntries } from './shared';
import type { BacklogItem } from './types';

export async function getAllBacklogItems(): Promise<BacklogItem[]> {
  const db = await connect();
  const rows = await db.select<BacklogItem[]>(
    "SELECT * FROM backlog_items ORDER BY CASE status WHEN 'in_progress' THEN 0 ELSE 1 END, sort_order ASC, id DESC"
  );
  return filterHiddenEntries(rows);
}

export async function addBacklogItem(item: Omit<BacklogItem, 'id'>): Promise<number> {
  const db = await connect();
  const keys = Object.keys(item);
  const values = Object.values(item);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(",");

  const result: any = await db.execute(
    `INSERT INTO backlog_items (${keys.join(",")}) VALUES (${placeholders})`,
    values
  );
  return result.lastInsertId;
}

export async function getNextBacklogSortOrder(status: BacklogItem['status']): Promise<number> {
  const db = await connect();
  const result = await db.select<{ next_order: number }[]>(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM backlog_items WHERE status = $1",
    [status]
  );
  return result[0]?.next_order ?? 0;
}

export async function updateBacklogItem(item: BacklogItem): Promise<void> {
  const db = await connect();
  const { id, ...rest } = item;
  const keys = Object.keys(rest);
  const values = Object.values(rest);
  const setString = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");

  await db.execute(
    `UPDATE backlog_items SET ${setString} WHERE id = $${values.length + 1}`,
    [...values, id]
  );
}

export async function updateBacklogStatus(id: number, status: BacklogItem['status']): Promise<void> {
  const db = await connect();
  const nextSortOrder = await getNextBacklogSortOrder(status);
  await db.execute(
    "UPDATE backlog_items SET status = $1, sort_order = $2 WHERE id = $3",
    [status, nextSortOrder, id]
  );
}

export async function updateBacklogItemOrder(status: BacklogItem['status'], ids: number[]): Promise<void> {
  const db = await connect();
  for (let i = 0; i < ids.length; i++) {
    await db.execute(
      "UPDATE backlog_items SET sort_order = $1 WHERE id = $2 AND status = $3",
      [i, ids[i], status]
    );
  }
}

export async function deleteBacklogItem(id: number): Promise<void> {
  const db = await connect();
  await db.execute("DELETE FROM backlog_items WHERE id = $1", [id]);
}
