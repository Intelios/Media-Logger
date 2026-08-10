import type { BacklogItem, MediaEntry } from '../db';

export const BACKUP_FORMAT = 'media-logger-backup' as const;
export const BACKUP_FORMAT_VERSION = 2 as const;

export interface CollectionBackupRow {
  id: number;
  name: string;
  description: string | null;
  created_date: string;
}

export interface CollectionEraBackupRow {
  id: number;
  collection_id: number;
  name: string;
  color: string;
  sort_order: number;
  created_date: string;
}

export interface CollectionItemBackupRow {
  id: number;
  collection_id: number;
  media_id: number;
  sort_order: number;
  era_id: number | null;
}

export interface AwardYearBackupRow {
  year: number;
  created_date: string;
}

export interface AwardTemplateBackupRow {
  id: number;
  name: string;
  created_date: string;
}

export interface AwardCategoryBackupRow {
  id: number;
  year: number;
  name: string;
  created_date: string;
  sort_order: number;
  template_id: number | null;
}

export interface AwardWinnerBackupRow {
  category_id: number;
  media_id: number;
  selected_date: string | null;
}

export interface ProfileBackupRow {
  type: string;
  name: string;
  image_url: string;
  crop_data: string | null;
  track_avg_history: number;
}

export interface HiddenProfileBackupRow {
  type: string;
  name: string;
  hidden_date: string;
}

export interface ProfileAvgHistoryBackupRow {
  type: string;
  name: string;
  captured_at: string;
  average_score: number;
  rated_count: number;
  total_count: number;
  source: string;
}

export type BacklogBackupRow = BacklogItem;

export interface BackupTables {
  entries: MediaEntry[];
  collections: CollectionBackupRow[];
  collection_eras: CollectionEraBackupRow[];
  collection_items: CollectionItemBackupRow[];
  award_years: AwardYearBackupRow[];
  award_templates: AwardTemplateBackupRow[];
  award_categories: AwardCategoryBackupRow[];
  award_winners: AwardWinnerBackupRow[];
  profiles: ProfileBackupRow[];
  hidden_profiles: HiddenProfileBackupRow[];
  profile_avg_history: ProfileAvgHistoryBackupRow[];
  backlog_items: BacklogBackupRow[];
}

export interface BackupEnvelopeV2 {
  format: typeof BACKUP_FORMAT;
  format_version: typeof BACKUP_FORMAT_VERSION;
  exported_at: string;
  tables: BackupTables;
}

export const BACKUP_TABLE_NAMES = [
  'entries',
  'collections',
  'collection_eras',
  'collection_items',
  'award_years',
  'award_templates',
  'award_categories',
  'award_winners',
  'profiles',
  'hidden_profiles',
  'profile_avg_history',
  'backlog_items',
] as const;

export type BackupTableName = (typeof BACKUP_TABLE_NAMES)[number];

export interface TableImportCount {
  inserted: number;
  reused: number;
  updated: number;
}

export type ImportTableCounts = Record<BackupTableName, TableImportCount>;

export interface ImportResult {
  success: boolean;
  tableCounts: ImportTableCounts;
  assetsRestored: number;
  warnings: string[];
  errors: string[];
}

export function createEmptyTableCounts(): ImportTableCounts {
  return Object.fromEntries(
    BACKUP_TABLE_NAMES.map((name) => [name, { inserted: 0, reused: 0, updated: 0 }]),
  ) as ImportTableCounts;
}

export function createFailedImportResult(error: unknown): ImportResult {
  return {
    success: false,
    tableCounts: createEmptyTableCounts(),
    assetsRestored: 0,
    warnings: [],
    errors: [String(error)],
  };
}
