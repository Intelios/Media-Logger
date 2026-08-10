import type { MediaEntry } from '../db';
import type {
  AwardCategoryBackupRow,
  AwardTemplateBackupRow,
  AwardWinnerBackupRow,
  AwardYearBackupRow,
  BacklogBackupRow,
  BackupTables,
  CollectionBackupRow,
  HiddenProfileBackupRow,
  ProfileAvgHistoryBackupRow,
  ProfileBackupRow,
} from './types';

type CsvRecord = Record<string, unknown>;

interface LegacyBackup {
  version?: unknown;
  export_date?: unknown;
  media_entries?: unknown;
  collections?: unknown;
  collection_items?: unknown;
  award_years?: unknown;
  award_templates?: unknown;
  award_categories?: unknown;
  award_winners?: unknown;
  profiles?: unknown;
  hidden_profiles?: unknown;
  profile_avg_history?: unknown;
  backlog_items?: unknown;
}

const NUMERIC_COLUMNS: Record<string, ReadonlySet<string>> = {
  media_entries: new Set([
    'id', 'review_score', 'year_completed', 'is_rewatch', 'own_local_copy',
    'has_subtitles', 'is_platinum', 'is_completed', 'is_early_access',
  ]),
  collections: new Set(['id']),
  collection_items: new Set(['collection_id', 'media_id', 'sort_order']),
  award_years: new Set(['year']),
  award_templates: new Set(['id']),
  award_categories: new Set(['id', 'year', 'sort_order', 'template_id']),
  award_winners: new Set(['category_id', 'media_id']),
  profiles: new Set(['track_avg_history']),
  hidden_profiles: new Set(),
  profile_avg_history: new Set(['average_score', 'rated_count', 'total_count']),
  backlog_items: new Set(['id', 'sort_order']),
};

function parseCsvRows(content: string, section: string): string[][] {
  const input = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let justClosedQuote = false;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          inQuotes = false;
          justClosedQuote = true;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (justClosedQuote && char !== ',' && char !== '\n') {
      throw new Error(`${section}: unexpected character after a closing quote`);
    }
    if (char === '"') {
      if (cell.length > 0) {
        throw new Error(`${section}: quote appeared inside an unquoted field`);
      }
      inQuotes = true;
      justClosedQuote = false;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
      justClosedQuote = false;
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      justClosedQuote = false;
    } else {
      cell += char;
    }
  }

  if (inQuotes) throw new Error(`${section}: CSV contains an unclosed quote`);
  if (cell.length > 0 || row.length > 0 || justClosedQuote) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function parseCsv(content: unknown, section: string): CsvRecord[] {
  if (content === undefined || content === null) return [];
  if (typeof content !== 'string') throw new Error(`${section}: expected a CSV string`);
  const rows = parseCsvRows(content, section);
  if (rows.length === 0) return [];
  const headers = rows[0];
  if (headers.some((header) => header.trim() === '')) {
    throw new Error(`${section}: CSV contains an empty header`);
  }
  if (new Set(headers).size !== headers.length) {
    throw new Error(`${section}: CSV contains duplicate headers`);
  }
  const numericColumns = NUMERIC_COLUMNS[section];
  const result: CsvRecord[] = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const values = rows[rowIndex];
    if (values.every((value) => value.trim() === '')) continue;
    if (values.length !== headers.length) {
      throw new Error(`${section}: row ${rowIndex + 1} has ${values.length} fields; expected ${headers.length}`);
    }
    const record: CsvRecord = {};
    headers.forEach((header, columnIndex) => {
      const raw = values[columnIndex];
      if (raw.trim() === '') {
        record[header] = null;
      } else if (numericColumns.has(header)) {
        if (!/^-?\d+(?:\.\d+)?$/.test(raw.trim())) {
          throw new Error(`${section}: ${header} on row ${rowIndex + 1} is not numeric`);
        }
        const number = Number(raw.trim());
        if (!Number.isFinite(number)) {
          throw new Error(`${section}: ${header} on row ${rowIndex + 1} is not finite`);
        }
        record[header] = number;
      } else {
        record[header] = raw;
      }
    });
    result.push(record);
  }
  return result;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value);
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : numberValue(value);
}

export function isLegacyBackup(value: unknown): value is LegacyBackup {
  if (!value || typeof value !== 'object') return false;
  const version = (value as LegacyBackup).version;
  return typeof version === 'string' && /^1\.[0-6]$/.test(version);
}

export function convertLegacyBackup(data: LegacyBackup): BackupTables {
  if (!isLegacyBackup(data)) {
    throw new Error('Unsupported legacy backup version; expected version 1.0 through 1.6');
  }
  const fallbackDate = typeof data.export_date === 'string' && data.export_date
    ? data.export_date
    : new Date().toISOString();

  const entries = parseCsv(data.media_entries, 'media_entries').map((row): MediaEntry => ({
    id: numberValue(row.id),
    name: text(row.name),
    genre: nullableText(row.genre),
    completion_date: nullableText(row.completion_date),
    review_score: nullableNumber(row.review_score),
    description: nullableText(row.description),
    notes: nullableText(row.notes),
    year_completed: nullableNumber(row.year_completed),
    is_rewatch: numberValue(row.is_rewatch),
    own_local_copy: numberValue(row.own_local_copy),
    has_subtitles: numberValue(row.has_subtitles),
    is_platinum: numberValue(row.is_platinum),
    is_completed: numberValue(row.is_completed),
    is_early_access: numberValue(row.is_early_access),
    early_access_version: nullableText(row.early_access_version),
    image_url: nullableText(row.image_url),
    entry_type: nullableText(row.entry_type),
    platform: nullableText(row.platform),
    author: nullableText(row.author),
    artist: nullableText(row.artist),
    director: nullableText(row.director),
    actress: nullableText(row.actress),
    update_version: nullableText(row.update_version),
    franchise: nullableText(row.franchise),
    series: nullableText(row.series),
  }));

  const collections = parseCsv(data.collections, 'collections').map((row): CollectionBackupRow => ({
    id: numberValue(row.id),
    name: text(row.name),
    description: nullableText(row.description),
    created_date: text(row.created_date) || fallbackDate,
  }));

  const collectionItems = parseCsv(data.collection_items, 'collection_items').map((row, index) => ({
    id: index + 1,
    collection_id: numberValue(row.collection_id),
    media_id: numberValue(row.media_id),
    sort_order: numberValue(row.sort_order),
    era_id: null,
  }));

  const awardTemplates = parseCsv(data.award_templates, 'award_templates').map((row): AwardTemplateBackupRow => ({
    id: numberValue(row.id),
    name: text(row.name),
    created_date: text(row.created_date) || fallbackDate,
  }));
  const awardCategories = parseCsv(data.award_categories, 'award_categories').map((row): AwardCategoryBackupRow => ({
    id: numberValue(row.id),
    year: numberValue(row.year),
    name: text(row.name),
    created_date: fallbackDate,
    sort_order: numberValue(row.sort_order),
    template_id: nullableNumber(row.template_id),
  }));
  const parsedYears = parseCsv(data.award_years, 'award_years').map((row): AwardYearBackupRow => ({
    year: numberValue(row.year),
    created_date: text(row.created_date) || fallbackDate,
  }));
  const yearsByValue = new Map(parsedYears.map((row) => [row.year, row]));
  for (const category of awardCategories) {
    if (!yearsByValue.has(category.year)) {
      yearsByValue.set(category.year, { year: category.year, created_date: fallbackDate });
    }
  }

  return {
    entries,
    collections,
    collection_eras: [],
    collection_items: collectionItems,
    award_years: [...yearsByValue.values()],
    award_templates: awardTemplates,
    award_categories: awardCategories,
    award_winners: parseCsv(data.award_winners, 'award_winners').map((row): AwardWinnerBackupRow => ({
      category_id: numberValue(row.category_id),
      media_id: numberValue(row.media_id),
      selected_date: nullableText(row.selected_date),
    })),
    profiles: parseCsv(data.profiles, 'profiles').map((row): ProfileBackupRow => ({
      type: text(row.type),
      name: text(row.name),
      image_url: text(row.image_url),
      crop_data: nullableText(row.crop_data),
      track_avg_history: numberValue(row.track_avg_history),
    })),
    hidden_profiles: parseCsv(data.hidden_profiles, 'hidden_profiles').map((row): HiddenProfileBackupRow => ({
      type: text(row.type),
      name: text(row.name),
      hidden_date: text(row.hidden_date) || fallbackDate,
    })),
    profile_avg_history: parseCsv(data.profile_avg_history, 'profile_avg_history').map((row): ProfileAvgHistoryBackupRow => ({
      type: text(row.type),
      name: text(row.name),
      captured_at: text(row.captured_at),
      average_score: numberValue(row.average_score),
      rated_count: numberValue(row.rated_count),
      total_count: numberValue(row.total_count),
      source: text(row.source) || 'backfill',
    })),
    backlog_items: parseCsv(data.backlog_items, 'backlog_items').map((row): BacklogBackupRow => ({
      id: numberValue(row.id),
      name: text(row.name),
      entry_type: text(row.entry_type),
      genre: nullableText(row.genre),
      image_url: nullableText(row.image_url),
      status: (text(row.status) || 'planning') as BacklogBackupRow['status'],
      added_date: text(row.added_date) || fallbackDate.slice(0, 10),
      sort_order: numberValue(row.sort_order),
      release_date: nullableText(row.release_date),
    })),
  };
}
