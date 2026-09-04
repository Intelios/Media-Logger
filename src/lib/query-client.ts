import {
  QueryClient,
  type InvalidateQueryFilters,
  type QueryKey,
} from "@tanstack/react-query";
import { onEntriesMutated } from "./db/events";
import { isAdultMediaEnabled } from "./settings";

export const LOCAL_QUERY_GC_TIME_MS = 10 * 60 * 1000;

/**
 * Shared namespace for Media Logger's local-data queries. Feature modules can
 * append their own stable segments without coupling the cache to a page.
 */
export const mediaQueryKeys = {
  all: ["media-logger"] as const,
  entries: ["media-logger", "entries"] as const,
  dashboard: ["media-logger", "dashboard"] as const,
  backlog: ["media-logger", "backlog"] as const,
  stats: ["media-logger", "stats"] as const,
  statsForYear: (year: string) => ["media-logger", "stats", ...mediaQueryKeys.scope(), "year", year] as const,
  profiles: ["media-logger", "profiles"] as const,
  awards: ["media-logger", "awards"] as const,
  collections: ["media-logger", "collections"] as const,
  navigationYears: ["media-logger", "navigation-years"] as const,
  // Review reads its per-year rows through `statsForYear` — the same key the
  // Stats screen uses — so only the cross-year and detail lookups live here.
  review: ["media-logger", "review"] as const,
  reviewAwards: (year: number) => ["media-logger", "review", ...mediaQueryKeys.scope(), "awards", year] as const,
  reviewYearTotals: () => ["media-logger", "review", ...mediaQueryKeys.scope(), "year-totals"] as const,
  reviewYearCovers: () => ["media-logger", "review", ...mediaQueryKeys.scope(), "year-covers"] as const,
  reviewNote: (entryId: number) => ["media-logger", "review", ...mediaQueryKeys.scope(), "note", entryId] as const,
  scope: () => [getDatabaseGenerationKey(), isAdultMediaEnabled() ? "adult:on" : "adult:off"] as const,
  entriesForYear: (year: string) => ["media-logger", "entries", ...mediaQueryKeys.scope(), "year", year] as const,
  search: (filters: object, page: number) => ["media-logger", "entries", ...mediaQueryKeys.scope(), "search", filters, page] as const,
};

function getDatabaseGenerationKey(): string {
  const configured = localStorage.getItem("media-logger-data-directory") ?? "default";
  let hash = 2166136261;
  for (let index = 0; index < configured.length; index += 1) {
    hash ^= configured.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `db:${(hash >>> 0).toString(36)}`;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // SQLite and local files do not become stale by the passage of time.
      // Mutations explicitly invalidate the affected key instead.
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: LOCAL_QUERY_GC_TIME_MS,
      networkMode: "always",
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    },
    mutations: {
      networkMode: "always",
      retry: false,
    },
  },
});

export const QUERY_INVALIDATION_EVENT = "media-logger:query-invalidate";

export interface QueryInvalidationDetail {
  queryKey?: QueryKey;
}

/**
 * Direct bridge for imperative DB mutation code. Active matching queries
 * refresh immediately; inactive queries remain stale and refresh when mounted.
 */
export function invalidateMediaQueries(
  queryKey: QueryKey = mediaQueryKeys.all,
  filters: Omit<InvalidateQueryFilters, "queryKey"> = {},
): Promise<void> {
  return queryClient.invalidateQueries({
    ...filters,
    queryKey,
    refetchType: filters.refetchType ?? "active",
  });
}

/**
 * Event bridge for code that cannot import the query client directly. This is
 * intentionally app-local and carries only a TanStack query key.
 */
export function requestMediaQueryInvalidation(
  queryKey: QueryKey = mediaQueryKeys.all,
): void {
  window.dispatchEvent(
    new CustomEvent<QueryInvalidationDetail>(QUERY_INVALIDATION_EVENT, {
      detail: { queryKey },
    }),
  );
}

/** Install once near QueryClientProvider and remove it during teardown. */
export function connectQueryInvalidationBridge(): () => void {
  const handleInvalidation = (event: Event) => {
    const detail = (event as CustomEvent<QueryInvalidationDetail>).detail;
    void invalidateMediaQueries(detail?.queryKey ?? mediaQueryKeys.all);
  };

  window.addEventListener(QUERY_INVALIDATION_EVENT, handleInvalidation);
  const disconnectEntries = onEntriesMutated(() => {
    void Promise.all([
      invalidateMediaQueries(mediaQueryKeys.entries),
      invalidateMediaQueries(mediaQueryKeys.dashboard),
      invalidateMediaQueries(mediaQueryKeys.stats),
      invalidateMediaQueries(mediaQueryKeys.profiles),
      invalidateMediaQueries(mediaQueryKeys.navigationYears),
      // Review's per-year rows ride on `stats`, but its cross-year totals,
      // year covers and note lookups are not covered by any other namespace.
      invalidateMediaQueries(mediaQueryKeys.review),
    ]);
  });
  return () => {
    window.removeEventListener(QUERY_INVALIDATION_EVENT, handleInvalidation);
    disconnectEntries();
  };
}
