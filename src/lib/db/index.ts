// Public surface of the db module. Consumers import from '../lib/db' /
// './db' exactly as they did when this was a single db.ts file.
// Submodules must never import this barrel (or service.ts) — siblings are
// imported directly to keep the graph acyclic.
export { dbService } from './service';
export type {
  MediaEntry,
  BacklogItem,
  AvgHistoryPoint,
  EntrySearchFilters,
  SearchFilterOptions,
  RandomPickFilters,
  RandomPickFilterOptions,
  AutocompleteOptions,
} from './types';
export { adultExclusionSql, filterHiddenEntries } from './shared';
export { onEntriesMutated } from './events';
export { DB_FILENAME, LEGACY_DB_FILENAME, DB_MIGRATED_FLAG_KEY } from './connection';
