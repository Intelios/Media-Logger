import { Profiler, Suspense, lazy, useEffect, type ComponentType, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { Layout } from "./components/Layout";
import { ThemeProvider } from "./lib/ThemeContext";
import { useAnimationPause } from "./lib/useAnimationPause";
import { useMcpLifecycle } from "./lib/mcp";
import { HoverTooltipProvider } from "./components/HoverTooltip";
import {
  IMAGE_PREWARM_MARKER_PREFIX,
  initializeImageService,
  prewarmImageCache,
} from "./lib/image-service";
import {
  connectQueryInvalidationBridge,
  mediaQueryKeys,
  queryClient,
} from "./lib/query-client";
import { preparePerformanceBuildEnvironment } from "./lib/performance-mode";
import { recordReactCommit } from "./lib/performance-diagnostics";
import { dbService } from "./lib/db";

preparePerformanceBuildEnvironment();

interface LazyRouteModule {
  default: ComponentType;
}

function createPreloadableRoute(loader: () => Promise<LazyRouteModule>) {
  let pending: Promise<LazyRouteModule> | null = null;
  const load = () => {
    pending ??= loader().catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  };

  return {
    Component: lazy(load),
    preload: () => {
      void load().catch(() => {
        // Intent prefetch is opportunistic. lazy() retries on navigation.
      });
    },
  };
}

type RouteChunk = ReturnType<typeof createPreloadableRoute>;

const routeChunks: Record<string, RouteChunk> = {
  dashboard: createPreloadableRoute(() => import("./pages/Dashboard")),
  year: createPreloadableRoute(() => import("./pages/YearView")),
  search: createPreloadableRoute(() => import("./pages/Search")),
  stats: createPreloadableRoute(() => import("./pages/Stats")),
  profiles: createPreloadableRoute(() => import("./pages/Profiles")),
  awards: createPreloadableRoute(() => import("./pages/Awards")),
  collections: createPreloadableRoute(() => import("./pages/Collections")),
  settings: createPreloadableRoute(() => import("./pages/Settings")),
  review: createPreloadableRoute(() => import("./pages/Review")),
  backlog: createPreloadableRoute(() => import("./pages/Backlog")),
};

// Debug & Performance Lab builds only. The literal `import.meta.env.MODE !==
// "production"` must be inlined here (rather than referencing the exported
// constant) so Rollup can fold it to false before it decides which chunks to
// emit — that is what keeps the Performance page chunk out of release bundles.
if (import.meta.env.MODE !== "production") {
  routeChunks.performance = createPreloadableRoute(() => import("./pages/Performance"));
}

const Dashboard = routeChunks.dashboard.Component;
const YearView = routeChunks.year.Component;
const SearchPage = routeChunks.search.Component;
const StatsPage = routeChunks.stats.Component;
const ProfilesPage = routeChunks.profiles.Component;
const AwardsPage = routeChunks.awards.Component;
const CollectionsPage = routeChunks.collections.Component;
const SettingsPage = routeChunks.settings.Component;
const ReviewPage = routeChunks.review.Component;
const BacklogPage = routeChunks.backlog.Component;
const PerformancePage = import.meta.env.MODE !== "production"
  ? routeChunks.performance?.Component
  : undefined;

function prefetchRouteChunk(pathname: string): void {
  if (pathname === "/") routeChunks.dashboard.preload();
  else if (pathname.startsWith("/year/")) routeChunks.year.preload();
  else if (pathname.startsWith("/search")) routeChunks.search.preload();
  else if (pathname.startsWith("/stats")) routeChunks.stats.preload();
  else if (pathname.startsWith("/profiles")) routeChunks.profiles.preload();
  else if (pathname.startsWith("/awards")) routeChunks.awards.preload();
  else if (pathname.startsWith("/collections")) routeChunks.collections.preload();
  else if (pathname.startsWith("/settings")) routeChunks.settings.preload();
  else if (pathname.startsWith("/review")) routeChunks.review.preload();
  else if (pathname.startsWith("/backlog")) routeChunks.backlog.preload();
  else if (import.meta.env.MODE !== "production" && pathname.startsWith("/performance")) {
    routeChunks.performance?.preload();
  }
}

function RouteFallback() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 animate-pulse">
      <div className="h-10 w-48 rounded-2xl bg-white/10" />
      <div className="h-32 rounded-3xl bg-white/5" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-48 rounded-3xl bg-white/5" />
        <div className="h-48 rounded-3xl bg-white/5" />
        <div className="h-48 rounded-3xl bg-white/5" />
      </div>
    </div>
  );
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function AppBootstrap() {
  useEffect(() => {
    let cancelled = false;
    let prewarmTimer: number | null = null;
    const disconnectInvalidationBridge = connectQueryInvalidationBridge();
    void initializeImageService()
      .then((imageStatus) => {
        const databaseScope = mediaQueryKeys.scope()[0];
        const marker = `${IMAGE_PREWARM_MARKER_PREFIX}${databaseScope}:v${imageStatus.recipeVersion}`;
        if (localStorage.getItem(marker) === "complete") return;

        // Legacy migration is intentionally delayed and runs one native job at
        // a time. The service keeps a second generation slot available so a
        // visible cover can make progress while background warming continues.
        prewarmTimer = window.setTimeout(() => {
          void dbService.getAllReferencedCoverPaths()
            .then(async (paths) => {
              const localPaths = paths.filter((path) => path && !/^https?:\/\//iu.test(path));
              const batchSize = 200;
              for (let offset = 0; offset < localPaths.length && !cancelled; offset += batchSize) {
                const batch = localPaths.slice(offset, offset + batchSize);
                await prewarmImageCache(batch.flatMap((imagePath) => [
                  { imagePath, variant: "small" as const },
                  { imagePath, variant: "card" as const },
                ]));
              }
              if (!cancelled) localStorage.setItem(marker, "complete");
            })
            .catch((error: unknown) => {
              console.warn("[Images] Background prewarm did not complete:", error);
            });
        }, 3_000);
      })
      .catch((error: unknown) => {
        console.error("[Images] Service initialization failed:", error);
      });

    return () => {
      cancelled = true;
      if (prewarmTimer != null) window.clearTimeout(prewarmTimer);
      disconnectInvalidationBridge();
    };
  }, []);

  return null;
}

function App() {
  useAnimationPause();
  useMcpLifecycle();

  return (
    <QueryClientProvider client={queryClient}>
      <AppBootstrap />
      <ThemeProvider>
        <HoverTooltipProvider>
          <Profiler id="RoutedApp" onRender={recordReactCommit}>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Layout onPrefetchRoute={prefetchRouteChunk} />}>
                  <Route index element={<LazyRoute><Dashboard /></LazyRoute>} />
                  <Route path="year/:year" element={<LazyRoute><YearView /></LazyRoute>} />
                  <Route path="search" element={<LazyRoute><SearchPage /></LazyRoute>} />
                  <Route path="stats" element={<LazyRoute><StatsPage /></LazyRoute>} />
                  <Route path="profiles" element={<LazyRoute><ProfilesPage /></LazyRoute>} />
                  <Route path="awards" element={<LazyRoute><AwardsPage /></LazyRoute>} />
                  <Route path="collections" element={<LazyRoute><CollectionsPage /></LazyRoute>} />
                  <Route path="backlog" element={<LazyRoute><BacklogPage /></LazyRoute>} />
                  <Route path="review" element={<LazyRoute><ReviewPage /></LazyRoute>} />
                  <Route path="settings" element={<LazyRoute><SettingsPage /></LazyRoute>} />

                  {/* Debug & Performance Lab builds only — absent from release bundles */}
                  {import.meta.env.MODE !== "production" && PerformancePage && (
                    <Route path="performance" element={<LazyRoute><PerformancePage /></LazyRoute>} />
                  )}

                  {/* Fallback */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </Profiler>
        </HoverTooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
