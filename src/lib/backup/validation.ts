import { convertLegacyBackup, isLegacyBackup } from './legacy-v1';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_TABLE_NAMES,
  type BackupEnvelopeV2,
  type BackupTables,
} from './types';

type UnknownRecord = Record<string, unknown>;

function asObject(value: unknown, context: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as UnknownRecord;
}

function asRows(value: unknown, table: string): UnknownRecord[] {
  if (!Array.isArray(value)) throw new Error(`${table} must be an array`);
  return value.map((row, index) => asObject(row, `${table}[${index}]`));
}

function requireString(row: UnknownRecord, key: string, context: string, allowEmpty = false): string {
  const value = row[key];
  if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
    throw new Error(`${context}.${key} must be ${allowEmpty ? 'a string' : 'a non-empty string'}`);
  }
  return value;
}

function requireNullableString(row: UnknownRecord, key: string, context: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${context}.${key} must be a string or null`);
  return value;
}

function requireNumber(
  row: UnknownRecord,
  key: string,
  context: string,
  options: { integer?: boolean; positive?: boolean; nullable?: boolean } = {},
): number | null {
  const value = row[key];
  if (value === null && options.nullable) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${context}.${key} must be a finite number${options.nullable ? ' or null' : ''}`);
  }
  if (options.integer && !Number.isInteger(value)) {
    throw new Error(`${context}.${key} must be an integer`);
  }
  if (options.integer && !Number.isSafeInteger(value)) {
    throw new Error(`${context}.${key} must be a safe integer`);
  }
  if (options.positive && value <= 0) {
    throw new Error(`${context}.${key} must be greater than zero`);
  }
  return value;
}

function requireBooleanInteger(row: UnknownRecord, key: string, context: string): void {
  const value = requireNumber(row, key, context, { integer: true });
  if (value !== 0 && value !== 1) throw new Error(`${context}.${key} must be 0 or 1`);
}

function ensureUniqueId(rows: UnknownRecord[], table: string, key = 'id'): Set<number> {
  const ids = new Set<number>();
  rows.forEach((row, index) => {
    const id = requireNumber(row, key, `${table}[${index}]`, { integer: true, positive: true }) as number;
    if (ids.has(id)) throw new Error(`${table} contains duplicate ${key} ${id}`);
    ids.add(id);
  });
  return ids;
}

function ensureUniqueKey(keys: Iterable<string>, table: string): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) throw new Error(`${table} contains duplicate key ${key}`);
    seen.add(key);
  }
}

function validateEntry(row: UnknownRecord, index: number): void {
  const context = `entries[${index}]`;
  requireString(row, 'name', context);
  for (const key of [
    'genre', 'completion_date', 'description', 'notes', 'early_access_version', 'image_url',
    'entry_type', 'platform', 'author', 'artist', 'director', 'actress', 'update_version',
    'franchise', 'series',
  ]) {
    requireNullableString(row, key, context);
  }
  requireNumber(row, 'review_score', context, { nullable: true });
  requireNumber(row, 'year_completed', context, { integer: true, nullable: true });
  for (const key of [
    'is_rewatch', 'own_local_copy', 'has_subtitles', 'is_platinum', 'is_completed', 'is_early_access',
  ]) {
    requireBooleanInteger(row, key, context);
  }
}

export function validateBackupTables(value: unknown): asserts value is BackupTables {
  const tables = asObject(value, 'tables');
  for (const table of BACKUP_TABLE_NAMES) {
    if (!(table in tables)) throw new Error(`Backup is missing tables.${table}`);
  }

  const entries = asRows(tables.entries, 'entries');
  const entryIds = ensureUniqueId(entries, 'entries');
  entries.forEach(validateEntry);

  const collections = asRows(tables.collections, 'collections');
  const collectionIds = ensureUniqueId(collections, 'collections');
  collections.forEach((row, index) => {
    const context = `collections[${index}]`;
    requireString(row, 'name', context);
    requireNullableString(row, 'description', context);
    requireString(row, 'created_date', context);
    // Optional: pre-v4 backups have no collection order to carry.
    if (row.sort_order !== undefined) requireNumber(row, 'sort_order', context, { integer: true });
  });

  const eras = asRows(tables.collection_eras, 'collection_eras');
  const eraIds = ensureUniqueId(eras, 'collection_eras');
  const eraCollections = new Map<number, number>();
  eras.forEach((row, index) => {
    const context = `collection_eras[${index}]`;
    const collectionId = requireNumber(row, 'collection_id', context, { integer: true, positive: true }) as number;
    if (!collectionIds.has(collectionId)) throw new Error(`${context} references missing collection ${collectionId}`);
    eraCollections.set(requireNumber(row, 'id', context, { integer: true, positive: true }) as number, collectionId);
    requireString(row, 'name', context);
    requireString(row, 'color', context);
    requireNumber(row, 'sort_order', context, { integer: true });
    requireString(row, 'created_date', context);
  });

  const collectionItems = asRows(tables.collection_items, 'collection_items');
  ensureUniqueId(collectionItems, 'collection_items');
  collectionItems.forEach((row, index) => {
    const context = `collection_items[${index}]`;
    const collectionId = requireNumber(row, 'collection_id', context, { integer: true, positive: true }) as number;
    const mediaId = requireNumber(row, 'media_id', context, { integer: true, positive: true }) as number;
    const eraId = requireNumber(row, 'era_id', context, { integer: true, positive: true, nullable: true });
    if (!collectionIds.has(collectionId)) throw new Error(`${context} references missing collection ${collectionId}`);
    if (!entryIds.has(mediaId)) throw new Error(`${context} references missing media entry ${mediaId}`);
    if (eraId !== null) {
      if (!eraIds.has(eraId)) throw new Error(`${context} references missing era ${eraId}`);
      if (eraCollections.get(eraId) !== collectionId) {
        throw new Error(`${context} references an era from another collection`);
      }
    }
    requireNumber(row, 'sort_order', context, { integer: true });
  });

  const awardYears = asRows(tables.award_years, 'award_years');
  const yearValues = new Set<number>();
  awardYears.forEach((row, index) => {
    const context = `award_years[${index}]`;
    const year = requireNumber(row, 'year', context, { integer: true }) as number;
    if (yearValues.has(year)) throw new Error(`award_years contains duplicate year ${year}`);
    yearValues.add(year);
    requireString(row, 'created_date', context);
  });

  const templates = asRows(tables.award_templates, 'award_templates');
  const templateIds = ensureUniqueId(templates, 'award_templates');
  ensureUniqueKey(templates.map((row, index) => requireString(row, 'name', `award_templates[${index}]`)), 'award_templates');
  templates.forEach((row, index) => requireString(row, 'created_date', `award_templates[${index}]`));

  const categories = asRows(tables.award_categories, 'award_categories');
  const categoryIds = ensureUniqueId(categories, 'award_categories');
  categories.forEach((row, index) => {
    const context = `award_categories[${index}]`;
    const year = requireNumber(row, 'year', context, { integer: true }) as number;
    const templateId = requireNumber(row, 'template_id', context, { integer: true, positive: true, nullable: true });
    if (!yearValues.has(year)) throw new Error(`${context} references missing award year ${year}`);
    if (templateId !== null && !templateIds.has(templateId)) {
      throw new Error(`${context} references missing award template ${templateId}`);
    }
    requireString(row, 'name', context);
    requireString(row, 'created_date', context);
    requireNumber(row, 'sort_order', context, { integer: true });
  });

  const winners = asRows(tables.award_winners, 'award_winners');
  ensureUniqueKey(winners.map((row, index) => String(requireNumber(row, 'category_id', `award_winners[${index}]`, { integer: true, positive: true }))), 'award_winners');
  winners.forEach((row, index) => {
    const context = `award_winners[${index}]`;
    const categoryId = row.category_id as number;
    const mediaId = requireNumber(row, 'media_id', context, { integer: true, positive: true }) as number;
    if (!categoryIds.has(categoryId)) throw new Error(`${context} references missing category ${categoryId}`);
    if (!entryIds.has(mediaId)) throw new Error(`${context} references missing media entry ${mediaId}`);
    requireNullableString(row, 'selected_date', context);
  });

  const profiles = asRows(tables.profiles, 'profiles');
  ensureUniqueKey(profiles.map((row, index) => `${requireString(row, 'type', `profiles[${index}]`)}\0${requireString(row, 'name', `profiles[${index}]`)}`), 'profiles');
  profiles.forEach((row, index) => {
    const context = `profiles[${index}]`;
    requireString(row, 'image_url', context, true);
    requireNullableString(row, 'crop_data', context);
    requireBooleanInteger(row, 'track_avg_history', context);
  });

  const hiddenProfiles = asRows(tables.hidden_profiles, 'hidden_profiles');
  ensureUniqueKey(hiddenProfiles.map((row, index) => `${requireString(row, 'type', `hidden_profiles[${index}]`)}\0${requireString(row, 'name', `hidden_profiles[${index}]`)}`), 'hidden_profiles');
  hiddenProfiles.forEach((row, index) => requireString(row, 'hidden_date', `hidden_profiles[${index}]`));

  const history = asRows(tables.profile_avg_history, 'profile_avg_history');
  ensureUniqueKey(history.map((row, index) => {
    const context = `profile_avg_history[${index}]`;
    return `${requireString(row, 'type', context)}\0${requireString(row, 'name', context)}\0${requireString(row, 'captured_at', context)}`;
  }), 'profile_avg_history');
  history.forEach((row, index) => {
    const context = `profile_avg_history[${index}]`;
    requireNumber(row, 'average_score', context);
    requireNumber(row, 'rated_count', context, { integer: true });
    requireNumber(row, 'total_count', context, { integer: true });
    requireString(row, 'source', context);
  });

  const backlog = asRows(tables.backlog_items, 'backlog_items');
  ensureUniqueId(backlog, 'backlog_items');
  backlog.forEach((row, index) => {
    const context = `backlog_items[${index}]`;
    requireString(row, 'name', context);
    requireString(row, 'entry_type', context);
    requireNullableString(row, 'genre', context);
    requireNullableString(row, 'image_url', context);
    const status = requireString(row, 'status', context);
    if (!['planning', 'in_progress', 'unreleased'].includes(status)) {
      throw new Error(`${context}.status is not supported`);
    }
    requireString(row, 'added_date', context);
    requireNumber(row, 'sort_order', context, { integer: true });
    requireNullableString(row, 'release_date', context);
  });
}

export function parseAndValidateBackup(fileContent: string): BackupTables {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContent);
  } catch (error) {
    throw new Error(`Backup is not valid JSON: ${String(error)}`);
  }

  if (isLegacyBackup(parsed)) {
    const tables = convertLegacyBackup(parsed);
    validateBackupTables(tables);
    return tables;
  }

  const envelope = asObject(parsed, 'Backup');
  if (envelope.format !== BACKUP_FORMAT) {
    throw new Error(`Unsupported backup format: ${String(envelope.format)}`);
  }
  if (typeof envelope.format_version !== 'number' || !Number.isInteger(envelope.format_version)) {
    throw new Error('Backup format_version must be an integer');
  }
  if (envelope.format_version > BACKUP_FORMAT_VERSION) {
    throw new Error(`Backup format version ${envelope.format_version} is newer than this app supports`);
  }
  if (envelope.format_version !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Unsupported backup format version ${envelope.format_version}`);
  }
  if (typeof envelope.exported_at !== 'string' || envelope.exported_at.trim() === '') {
    throw new Error('Backup exported_at must be a non-empty string');
  }
  validateBackupTables(envelope.tables);
  return (envelope as unknown as BackupEnvelopeV2).tables;
}
