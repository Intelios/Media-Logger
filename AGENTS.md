# Media Logger — Agent Guide

Tauri v2 + React 19 + TypeScript + Tailwind CSS desktop app.

## Important To Know

- No mobile/web plans at all for the app. Desktop only.
- All development for the app takes place on a macOS device.
- Performance is a first-class concern in 4.0: a TanStack Query cache, a Stats web worker, virtualized grids, a native Rust image service with derivative cache, an isolated Performance Lab build, and an animation energy-saver are all part of the core architecture. Do not regress them (see sections below).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite only, port 1420 browser preview. **No Tauri runtime** — DB, image service, glass, and MCP commands all fail here. |
| `npm run tauri dev` | Full Tauri desktop app. Must use this to exercise DB, FS, and native window APIs. |
| `npm run build` | `tsc && vite build` — `tsc` is the only static check; unused locals/parameters fail it. |
| `npm run tauri build` | Production desktop bundle. |
| `npm run tauri` | Tauri CLI passthrough. |
| `npm run dev:perf` | Vite only, `performance` mode (profiling React renderer + sourcemaps). |
| `npm run build:perf` | `tsc && vite build --mode performance`. |
| `npm run tauri:perf:dev` | Performance Lab desktop app (`src-tauri/tauri.perf.conf.json`, identifier `com.medialogger.perf`, **synthetic data only**). |
| `npm run tauri:perf:build` | Performance Lab production bundle. |
| `npm run changelog:sync` | Syncs `src/data/changelog.json` with GitHub Releases. **User-only** — requires `gh` CLI auth. |

- No tests, lint, or formatter exist and none should be added. Sole CI: manual-dispatch Windows build (`.github/workflows/build-windows.yml`).
- TypeScript is strict with `noUnusedLocals`/`noUnusedParameters`.

## Architecture

**Frontend (`src/`)**:
- Entry: `src/main.tsx` → `App.tsx` → `QueryClientProvider` + `<ThemeProvider>` + `<HoverTooltipProvider>` + `<Profiler>` + `<BrowserRouter>` + `<Layout>` + lazy routes. `AppBootstrap` initializes the image service, starts background derivative prewarm, and installs the query-invalidation bridge. Route chunks are preloadable (`createPreloadableRoute`); `Layout` triggers prefetch on navigation intent.
- Pages: `Dashboard`, `YearView`, `Search`, `Stats`, `Profiles`, `Awards`, `Collections`, `Backlog`, `Review`, `Settings`. `Profiles.tsx` is now a ~90-line shell over `src/components/profiles/` (`ProfileIndexView`, `ProfileDetailView`, `ProfileCards`, `useProfilesPageData`) + `src/lib/profiles/domain.ts`; `src/lib/profiles-logic.ts` computes the aggregations. `Stats.tsx` is the Plate controller (see **Stats Screen**).
- `src/lib/query-client.ts` — the TanStack Query layer. One app-wide `queryClient` with `staleTime: Infinity` (local SQLite never goes stale by time); all invalidation is explicit. `mediaQueryKeys` is the shared cache namespace (entries, dashboard, backlog, stats, profiles, awards, collections, navigation years, scoped by data-directory hash + adult toggle). Pages use `queryClient.fetchQuery` with those keys; imperative DB code calls `invalidateMediaQueries()` or `requestMediaQueryInvalidation()` (window event bridge). `connectQueryInvalidationBridge()` also auto-invalidates entries/stats/profiles/navigation-years on every entry mutation.
- `src/lib/db/` — data layer. `service.ts` exports the `dbService` singleton facade (every method is performance-timed); `connection.ts` owns `connect()` + legacy-file migration; `migrations.ts` is now a thin invoke wrapper around Rust; `shared.ts` owns adult filtering; `index.ts` is the public barrel; feature modules `entries.ts`, `backlog.ts`, `random-pick.ts`, `distinct-values.ts`, `avg-history.ts`, `events.ts`, `types.ts`. **Submodules must import siblings directly, never the barrel or `service.ts`** — keeps the module graph acyclic.
- `src/lib/stats-logic.ts` — stats computed in-memory from fetched rows, not SQL aggregations. `createStatsDataset()` + `buildFullStatsFromDataset()` are pure and exported; the Stats page relies on that to re-derive everything client-side (see **Stats Screen**). `statsLogic.getFilteredEntries` remains as a thin alias for `dbService.getStatsEntries`.
- `src/components/stats/plate/` — the entire Stats screen. See **Stats Screen** below before changing it.
- `src/components/VirtualizedCardGrid.tsx` — windowing over a shared scroll container via `@tanstack/react-virtual` (row-based; falls back to plain rendering under 80 items). Used by `YearView`, `Search`, `Collections`, and `CleanupImagesModal`. `src/lib/scroll-container.tsx` exposes the shared main-scroll element (`useMainScrollContainer`).
- `src/components/CoverImage.tsx` — the one image component; renders wrapper + `<img>` with `srcSet`/`sizes` variants, eager/lazy priority, delayed skeleton, decode-timing instrumentation. Props are `path`/`variant`/`priority`/`containerClassName`/`imageClassName` — a plain `className` is deliberately rejected. Always go through this (or the plate's wrapper in `plate-ui.tsx`), never a raw `<img>`.
- `src/components/HoverTooltip.tsx` — app-level tooltip provider + `useHoverTooltip()` + `TooltipTitle`/`TooltipDetail`. **This is the only sanctioned tooltip system in the app** (see **Stats Screen**). `MediaCard.tsx` uses it for its hover card and lazy-loads `MediaCardDialogs.tsx` for detail/delete/image dialogs.
- `src/lib/useAnimationPause.ts` — energy saver: freezes CSS animations (`animations-paused` class) while the window is unfocused/hidden and throttles them while scrolling (`animations-scrolling`), driven by `document.hasFocus()` + window focus events. Measured ~30% WindowServer CPU + ~27% GPU when idle; do not add long-running CSS animations without considering it.
- `src/lib/performance-diagnostics.ts` — in-app instrumentation: `recordPerformanceSample`, `beginPerformanceSpan` (used by every `dbService` method), React `Profiler` commits, frame/long-task/paint/heap counters, plus rolling frame-interval/JS-heap series and a frame histogram for live charts. The Performance page (`src/pages/Performance.tsx`) renders the report and lives in the System sidebar section; it is gated by `IS_DEV_OR_PERFORMANCE_BUILD` (`src/lib/performance-mode.ts`) so it exists only in debug and Performance Lab builds, never release. The image-cache disk limit stays in Settings → Data; a sanitized copy can be exported from the Performance page. Do not remove timing hooks from db methods.
- `src/lib/image-service.ts` — frontend of the native image pipeline: `initializeImageService()`, `createMediaUrl`/`createMediaSources`, `prewarmImageCache`, `stageCoverImport`/`commitCoverImport`/`cancelCoverImport`, cache-limit setting (1/3/5 GiB), `useImageServiceStatus`. See **Image Service** below.
- `src/lib/themes.ts` + `src/lib/ThemeContext.tsx` — CSS-variable theming persisted to `localStorage`.
- `src/lib/settings.ts` — `localStorage`-based settings (data dir, display name, nav years, adult-media toggle, etc.). In performance mode `getDataDirectory()` returns the lab's app-local dir instead of the real library.
- `src/lib/utils.ts` — **not the old blob-URL image loader.** It is a small compatibility shim: `saveImage()` stages/commits a cover through the native service and returns the relative DB path. Profile-image callers go through it.
- `src/lib/media-config.tsx` — canonical entry types and adult filtering helpers.
- `src/lib/backup/` — backup domain: `types.ts` (v2 envelope), `validation.ts` (parse + validate before any write), `service.ts` (`exportAllData`/`importFromFile`), `legacy-v1.ts` (CSV reader for old v1 files). `src/lib/csv-logic.ts` is now just a re-export for compatibility. Backup import writes run in Rust (`database_import_backup`).
- `src/workers/stats-worker.ts` + `stats-worker-protocol.ts` — the Stats derivation worker (see **Stats Screen**).

**Backend (`src-tauri/`)**:
- `main.rs` → calls `media_logger_lib::run()`.
- `lib.rs` — Tauri builder: plugins (sql, fs, dialog, opener), native macOS menu bar, **custom `media://` URI scheme protocol** for the image service, window opacity handling, backup zip/unzip commands, and setup wiring for image service + MCP config.
- `glass.rs` — in-app macOS Liquid Glass integration using `objc2`/`objc2-app-kit`; probes the private variant selector for the Sidebar appearance and uses Tauri's main-thread dispatcher.
- `database.rs` (~2100 lines) — **native SQLite schema/migration and bulk work**: `database_run_migrations` (v2 + v3, see **DB / Data Quirks**), `database_import_backup`, `database_export_snapshot`, `database_add_collection_items`, `database_reorder_*` (collection items, award categories, backlog items).
- `image_service.rs` (~2000 lines) — the native image service (see **Image Service** below).
- `perf_fixture.rs` — synthetic corpus generation for the Performance Lab only (rejects every bundle identifier except `com.medialogger.perf`).
- `mcp.rs` (~2300 lines) — local read-only MCP server (axum + rmcp). Owns its own read-only sqlx SQLite connection and uses a fixed SELECT allowlist: `notes`, image paths, and ownership/private flags are never selected. Enabled only from Settings → AI Access (`mcp_set_enabled`), binds 127.0.0.1 only, bearer-token credentials with an audit log. Tools: `search_media`, `get_media_details`, `summarize_library`, `list_backlog`. Adult data is included only when both the app-wide Adult Media setting and the MCP adult-data opt-in are on.
- Native commands: `apply_glass_style`, `configure_image_service`, `image_service_status`, `clear_image_service_cache`, `prewarm_image_cache`, `stage_cover_import`, `commit_cover_import`, `cancel_cover_import`, `create_backup_zip`, `read_backup_zip`, `extract_backup_assets`, `list_asset_images`, `move_images_to_trash`, `database_run_migrations`, `database_add_collection_items`, `database_reorder_collection_items`, `database_reorder_award_categories`, `database_reorder_backlog_items`, `database_export_snapshot`, `database_import_backup`, `generate_performance_fixture`, and the `mcp_*` commands.
- Backup ZIP bundles `backup.json` plus the `assets/` directory. Rust uses the `zip` crate; no external `zip`/`unzip` dependency.
- Window is transparent for macOS glass/vibrancy; on macOS the native window intentionally toggles opaque↔transparent on focus change (WindowServer recomposites transparent windows at full rate even when idle).
- There is no updater: `@tauri-apps/plugin-updater` is not in `package.json` and no updater plugin is registered in Rust. Do not reference auto-update.

**Routing** (`react-router` v8 — import from `react-router`, **not** `react-router-dom`): `/`, `/year/:year`, `/search`, `/stats`, `/profiles`, `/awards`, `/collections`, `/backlog`, `/review`, `/settings`.

## Image Service

4.0 replaced the plugin-fs blob-URL pipeline with a **native Rust image service**. Image bytes never enter JavaScript.

- Serving: a custom `media://` URI scheme protocol registered in `lib.rs` (`register_asynchronous_uri_scheme_protocol("media", ...)`) serves `media://localhost/v1/<generation>/<variant>/<base64url-path>` URLs with ETags, HEAD support, and a generation check that returns 410 GONE when the data directory changes. The CSP in `index.html` allows `media:`.
- Variants: `small` (384×576), `card` (768×1152), `hero` (1600×2400), plus `original`. Derivatives are generated with `fast_image_resize` into an on-disk cache (3 GiB default, 1/3/5 GiB in Settings) plus an in-memory encoded cache (128 MiB); decode limits cap memory. Old `cover-thumbnails` caches are cleaned once.
- Import flow: `stageCoverImport` (validates + copies to staging) → `commitCoverImport` (atomic move into `assets/`, returns the relative DB path). Forms (`EntryForm`, `BacklogForm`, profile editing) use this; a failed commit cancels the stage. Never write image bytes to the DB — only the relative path.
- Prewarm: `prewarmImageCache` generates `small`+`card` derivatives in batches (200) in the background after launch (`AppBootstrap`, 3s delay, marker `media-logger-image-prewarm:<scope>:v<recipe>` in localStorage) and after fixture generation. Keep batches small — generation is concurrency-limited (2 slots) and must never starve visible covers.
- Frontend: `createMediaSources()` builds `srcSet`/`sizes`; `CoverImage` handles skeleton/decode/errors and reports `image:` performance samples. `CoverImage`'s `className` prop is intentionally absent — use `containerClassName`/`imageClassName`.
- `saveImage()` in `src/lib/utils.ts` is a compat shim over stage/commit; the old blob-URL `releaseImageUrl` ref-count cache is gone. Do not reintroduce it, and do not use `convertFileSrc()`/asset-protocol URLs — the `media://` protocol is the only serving path for local files.

## Stats Screen (Plate UI)

A **single screen that never scrolls**. The old widget dashboard (`StatsDashboard`, `StatsSectionGrid`, `StatsWidgetGrid`, `StatsSummaryRibbon`, `StatsWidgetShell`, `stats-registry.tsx`, `stats-layout.ts`, `src/components/stats/widgets/`) is deleted — do not reintroduce that structure. Everything lives in `src/components/stats/plate/`.

The design of this stats page is under the codename 'Plate'.

Layout is toolbar → figure strip → timeline hero → a fixed 4-panel grid, all inside one `h-full` column.

**Data flow — brushing costs nothing.** `Stats.tsx` fetches **thin `StatsEntry` rows once per year with no type filter** (`dbService.getStatsEntries(year)`; `StatsEntry` omits `description`/`notes`/`early_access_version`/`update_version` on purpose), then hands them to a dedicated web worker (`src/workers/stats-worker.ts`). The worker retains the dataset (one transfer per version) and runs `derivePlateSelection()` in `plate-data.ts` on every brush/type/compare change; requests are coalesced to the most recent via a 0ms task boundary. A synchronous fallback (`derivePlateSelection` on the main thread) kicks in if the worker fails to load — both paths share the same function so results stay identical. Version numbers on datasets and request IDs guard against stale results.
- Types are filtered in JS so the toolbar can show a live count on chips that are switched **off**; adult exclusion still happens in SQL.
- Brushing a range must never trigger a query or re-transfer the dataset. If you find yourself adding SQL for it, you have taken a wrong turn.
- `selectTimelineSeries()` in `stats-logic.ts` returns one bucket row carrying completions, average score, rewatches and platinums, so the four former time widgets share one axis.
- Comparison: `compareEnabled`/`compareYear` load a second dataset into a comparison slot; `deriveComparison()` projects the active range onto the comparison year (same months, not same dates). All Time offers no comparison.
- Modals (Perfect 10s, This Month, genre, date) fetch full detail rows via `getEntriesByIds` only when opened — prose fields are never loaded for a brush/type change.

**Panels.** Six are defined in `plate-config.ts` (`genres`, `scores`, `catalogue`, `standouts`, `content-types`, `multi-log-days`), four occupy slots (default `["genres","scores","catalogue","standouts"]`). Each renders a `compact` and an `expanded` variant via `renderPlatePanel()`; expanded opens in `PanelExpandOverlay`. Preferences (slots, figures, layers, compare) persist to `localStorage` under `media-logger-stats-plate` and are sanitized on load.

**Conventions that are easy to break:**
- **Never use the native `title` attribute for tooltips anywhere in the app.** Use `useHoverTooltip()` from `src/components/HoverTooltip.tsx`; the app-level provider renders one shared `glass-tooltip` portal. Native titles have a ~1s delay and cannot be styled.
- **No fixed height floors on panels.** `PanelFrame` is `h-full` and fills its grid cell; hard `min-h` values are what made the old dashboard leave dead space.
- `BarRow` is `w-full` on purpose — a bare `<button>` sizes to its content and silently collapses the flex-1 bar track.
- Cover art goes through `CoverImage` in `plate-ui.tsx`. `MostReplayedItem` and `MultiLogDayEntry` carry no `image_url`, so covers are matched back by name/id against the selection's rows (the plate's main-thread copy keeps full rows for exactly this).
- `selectGenres()` caps its list at 25 for display — use `countDistinctGenres()` for any headline count, or it silently plateaus.
- The entrance animation is **mount-only**. Do not key it to the range, or the plate re-animates on every frame of a brush drag.
- The brush strip is weekly cells for a specific year and yearly cells on All Time, so its granularity always matches the chart above it. Amber marks a week containing a `BUSY_DAY_THRESHOLD`+ log day (peak day count, not total week count).
- Keep worker/main derivation identical: any change to `derivePlateSelection` or its helpers must keep the synchronous fallback producing the same output.

## Vite / Build Quirks

- Dev server is hardcoded to port **1420** (`strictPort: true`).
- `src-tauri/` is excluded from the Vite watcher (`watch.ignored`) to avoid recompile loops.
- CSP lives in `index.html`, not `tauri.conf.json` (which sets `"csp": null`). Image sources include `media:`, `blob:`, `data:`, `https:`.
- `tsconfig.json` has `noEmit: true` and `moduleResolution: bundler`.
- Tailwind config maps colors to CSS vars (e.g., `colors.primary: var(--color-primary, #5E35B1)`).
- The `performance` Vite mode (Perf Lab) aliases `react-dom/client` → `react-dom/profiling` for Profiler timings and enables sourcemaps; the production build does not alias. Bare `react-dom` must never be aliased (circular self-import).
- `preparePerformanceBuildEnvironment()` runs before providers mount in performance mode: it clears the custom data-directory key, forces the sunset theme, and marks the document so the lab is visually unmistakable.

## DB / Data Quirks

- SQLite canonical filename is `media_logger.db` (`DB_FILENAME` in `src/lib/db/connection.ts`).
- Default data dir: `~/Library/Application Support/com.medialogger.data/` (bundle id `com.medialogger.data`), or a user-configured custom path (`getDataDirectory`). **Dev and production builds share the same real DB** — back it up before seeding or destructive testing. End-to-end verification workflow: `.claude/skills/verify/SKILL.md`. The Performance Lab is the exception: it uses its own app-local dir (`com.medialogger.perf`) with synthetic data only.
- Legacy installs used `jav_log.db`; `connect()` migrates once by copying the file plus `-wal`/`-shm` sidecars, leaving the original untouched as a backup. **Do not delete or reopen it.**
- `connect()` dedupes concurrent callers and reuses the live connection per path; `reconnect()` closes and reopens when Settings changes the data directory. Schema migrations now run natively (`database_run_migrations`) once per connection, one transaction per migration, advancing `PRAGMA user_version` 0 → 3. Schema evolves forward, never reset; a DB newer than the app is refused.
- Schema v2: legacy `javs` → `entries` rename, current tables, missing-column backfill (`franchise`, `series`, `has_subtitles`, `is_platinum`, `is_completed`, `notes`, `is_early_access`, `early_access_version`, `crop_data`, `track_avg_history`, `release_date`, ...), and normalization of `collection_items`/`award_winners`.
- Schema v3: 17 performance indexes (`idx_entries_year_completion_id`, `idx_entries_completion_id`, ...) plus **`entries_fts` — an external-content FTS5 table with the trigram tokenizer** over name/author/artist/genre/director/actress/platform/series, kept in sync by INSERT/DELETE/UPDATE triggers.
- Boolean-like fields (`is_rewatch`, `is_platinum`, `is_completed`, `own_local_copy`, `has_subtitles`, `is_early_access`) are stored as SQLite integers (0/1), not booleans.
- `actress` is a comma-delimited string, not a normalized column. **Search is FTS-driven now**: queries of 3+ characters use `entries_fts MATCH` (trigram substring match); 1–2 character queries fall back to literal `LIKE` (`buildSearchQuery` in `entries.ts`). `searchEntriesPaged` returns 100-row pages of `EntryCardSummary` (no `description`/`notes`).
- Read paths prefer summary projections: `getEntrySummariesByYear`, `getStatsEntries`, `getAllEntrySummaries`, `searchEntriesPaged`. Full rows (`getEntryById`, `getEntriesByIds` batched at 900) are fetched only for detail views and explicit modal actions. List/search surfaces should keep this shape — do not `SELECT *` into card grids.
- Stats fetch all matching rows then compute in JS — be mindful of large datasets. The Stats screen leans on this deliberately: one thin fetch per year, everything else derived in the worker.
- Adult entry types (`JAV`, `Hentai`, `Adult Visual Novel`) are hidden via `adultExclusionSql()` / `filterHiddenEntries()` when the Adult Media setting is off; data is never deleted, only filtered from queries. `hasEntries()` and `getAllReferencedCoverPaths()` intentionally ignore the setting (cleanup and prewarm must see everything).

## Theming

- Theme keys in `localStorage`: `media-logger-color-theme`, `media-logger-glass-style`.
- CSS variables (`--color-primary`, `--color-surface`, etc.) drive all styling.
- Only dark modes are supported. `data-theme-mode="dark"` is always applied.
- macOS native glass/vibrancy is applied via Tauri command `apply_glass_style` in Rust.
- The in-app `objc2` Liquid Glass path requires macOS 26+; older macOS falls back to `window-vibrancy`. Windows uses Mica/blur.

## Native macOS Menu Bar

Defined in Rust (`lib.rs`). Sends Tauri events to the frontend:
- `menu-navigate` for ⌘1–⌘9 (Dashboard, Year View, Search, Stats, Profiles, Awards, Collections, Backlog, Review) and ⌘, (Settings).
- `menu-new-entry` for ⌘N.

## What NOT to Do

- Do not add test/lint/formatter infrastructure.
- Do not rename `media_logger.db` or the `entries` table — use `DB_FILENAME` and the `entries` table name.
- Do not change the DB connection flow — `connect()` dedupes and reuses connections; native migrations advance `user_version` forward only.
- Do not assume booleans in SQLite — check for the 0/1 integer pattern.
- Do not assume `npm run dev` gives you a desktop app — use `npm run tauri dev`.
- Do not delete the legacy `jav_log.db` backup.
- Do not bypass the native image service: no `convertFileSrc()`/asset-protocol URLs, no blob-URL loading, no raw `<img src=...>` for local covers, no image bytes in the DB. Go through `CoverImage`/`createMediaSources` and stage/commit imports.
- Do not reintroduce `SELECT *` card grids, per-card detail queries, or ref-counted blob caches — summary projections + `getEntriesByIds` on demand is the 4.0 contract.
- Do not add SQL, queries, refetching, or dataset re-transfers for Stats range brushing, and do not use native `title` tooltips or fixed panel heights on the Stats screen — see **Stats Screen**.
- Do not bypass `mediaQueryKeys` for data you want invalidated — cache misses and stale screens are the result. Invalidate explicitly after mutations.
- Do not run the Performance Lab against the real data directory — it must stay isolated (`com.medialogger.perf`).
