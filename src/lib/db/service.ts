import { connect, reconnect } from './connection';
import {
  getAllEntries,
  getAllEntrySummaries,
  getEntryById,
  getEntriesByIds,
  hasEntries,
  getAllReferencedImagePaths,
  getAllReferencedCoverPaths,
  countAdultEntries,
  searchEntriesPaged,
  searchEntries,
  getEntriesByYear,
  getEntrySummariesByYear,
  getStatsEntries,
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
  getRandomPickCandidates,
} from './random-pick';
import {
  isAvgHistoryEnabled,
  setAvgHistoryEnabled,
  getAvgHistory,
  appendAvgHistoryPoint,
  backfillAvgHistory,
} from './avg-history';
import { beginPerformanceSpan, type PerformanceCategory } from '../performance-diagnostics';

function timed<TArgs extends unknown[], TResult>(
  category: Extract<PerformanceCategory, 'query' | 'mutation'>,
  name: string,
  operation: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    const finish = beginPerformanceSpan(category, name);
    try {
      return await operation(...args);
    } finally {
      finish();
    }
  };
}

/**
 * Facade over the db/ modules, preserving the public API of the original
 * DBService class. Each method lives in the module owning its table/feature;
 * shared connection state lives in connection.ts.
 */
export const dbService = {
  connect,
  reconnect: timed('mutation', 'database:reconnect', reconnect),
  getAllEntries: timed('query', 'entries:all-detail', getAllEntries),
  getAllEntrySummaries: timed('query', 'entries:all-summary', getAllEntrySummaries),
  getEntryById: timed('query', 'entries:detail-by-id', getEntryById),
  getEntriesByIds: timed('query', 'entries:detail-by-ids', getEntriesByIds),
  hasEntries: timed('query', 'entries:exists', hasEntries),
  getAllReferencedImagePaths: timed('query', 'entries:image-paths', getAllReferencedImagePaths),
  getAllReferencedCoverPaths: timed('query', 'entries:cover-paths', getAllReferencedCoverPaths),
  countAdultEntries: timed('query', 'entries:adult-count', countAdultEntries),
  searchEntriesPaged: timed('query', 'entries:search-page', searchEntriesPaged),
  searchEntries: timed('query', 'entries:search-legacy', searchEntries),
  getEntriesByYear: timed('query', 'entries:year-detail', getEntriesByYear),
  getEntrySummariesByYear: timed('query', 'entries:year-summary', getEntrySummariesByYear),
  getStatsEntries: timed('query', 'entries:stats-thin', getStatsEntries),
  addEntry: timed('mutation', 'entries:add', addEntry),
  updateEntry: timed('mutation', 'entries:update', updateEntry),
  deleteEntry: timed('mutation', 'entries:delete', deleteEntry),
  notifyExternalMutation,
  getEntriesByName: timed('query', 'entries:duplicates', getEntriesByName),
  getSearchFilterOptions: timed('query', 'search:filter-options', getSearchFilterOptions),
  getAutocompleteOptions: timed('query', 'entries:autocomplete', getAutocompleteOptions),
  invalidateAutocompleteCache,
  getAllBacklogItems: timed('query', 'backlog:all', getAllBacklogItems),
  addBacklogItem: timed('mutation', 'backlog:add', addBacklogItem),
  getNextBacklogSortOrder: timed('query', 'backlog:next-order', getNextBacklogSortOrder),
  updateBacklogItem: timed('mutation', 'backlog:update', updateBacklogItem),
  updateBacklogStatus: timed('mutation', 'backlog:status', updateBacklogStatus),
  updateBacklogItemOrder: timed('mutation', 'backlog:reorder', updateBacklogItemOrder),
  deleteBacklogItem: timed('mutation', 'backlog:delete', deleteBacklogItem),
  getRandomPickFilterOptions: timed('query', 'random:filter-options', getRandomPickFilterOptions),
  getRandomPickCount: timed('query', 'random:count', getRandomPickCount),
  getRandomPickCandidates: timed('query', 'random:candidates', getRandomPickCandidates),
  isAvgHistoryEnabled: timed('query', 'average-history:enabled', isAvgHistoryEnabled),
  setAvgHistoryEnabled: timed('mutation', 'average-history:set-enabled', setAvgHistoryEnabled),
  getAvgHistory: timed('query', 'average-history:points', getAvgHistory),
  appendAvgHistoryPoint: timed('mutation', 'average-history:append', appendAvgHistoryPoint),
  backfillAvgHistory: timed('mutation', 'average-history:backfill', backfillAvgHistory),
};
