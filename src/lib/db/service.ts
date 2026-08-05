import { connect, reconnect } from './connection';
import {
  getAllEntries,
  getAllReferencedImagePaths,
  countAdultEntries,
  searchEntries,
  getEntriesByYear,
  addEntry,
  updateEntry,
  deleteEntry,
  notifyExternalMutation,
  getEntriesByName,
} from './entries';
import {
  getSearchFilterOptions,
  getAutocompleteOptions,
  invalidateAutocompleteCache,
} from './distinct-values';
import {
  getAllBacklogItems,
  addBacklogItem,
  getNextBacklogSortOrder,
  updateBacklogItem,
  updateBacklogStatus,
  updateBacklogItemOrder,
  deleteBacklogItem,
} from './backlog';
import {
  getRandomPickFilterOptions,
  getRandomPickCount,
  getRandomEntry,
} from './random-pick';
import {
  isAvgHistoryEnabled,
  setAvgHistoryEnabled,
  getAvgHistory,
  appendAvgHistoryPoint,
  backfillAvgHistory,
} from './avg-history';

/**
 * Facade over the db/ modules, preserving the public API of the original
 * DBService class. Each method lives in the module owning its table/feature;
 * shared connection state lives in connection.ts.
 */
export const dbService = {
  connect,
  reconnect,
  getAllEntries,
  getAllReferencedImagePaths,
  countAdultEntries,
  searchEntries,
  getEntriesByYear,
  addEntry,
  updateEntry,
  deleteEntry,
  notifyExternalMutation,
  getEntriesByName,
  getSearchFilterOptions,
  getAutocompleteOptions,
  invalidateAutocompleteCache,
  getAllBacklogItems,
  addBacklogItem,
  getNextBacklogSortOrder,
  updateBacklogItem,
  updateBacklogStatus,
  updateBacklogItemOrder,
  deleteBacklogItem,
  getRandomPickFilterOptions,
  getRandomPickCount,
  getRandomEntry,
  isAvgHistoryEnabled,
  setAvgHistoryEnabled,
  getAvgHistory,
  appendAvgHistoryPoint,
  backfillAvgHistory,
};
