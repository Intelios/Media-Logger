# Media Logger — Agent Guide

Tauri v2 + React 19 + TypeScript + Tailwind v3 desktop app. Desktop-only, developed on macOS — no mobile/web plans. Performance is core architecture (query cache, stats worker, virtualized grids, native image service, isolated Performance Lab, animation energy-saver); don't regress it.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite only, port 1420 browser preview. No Tauri runtime — DB/image invokes throw; glass and MCP calls silently no-op. |
| `npm run tauri:dev` | `tauri dev --config src-tauri/tauri.dev.conf.json` → `Media Logger Development` (`com.medialogger.dev`). **The only command agents may use to exercise DB, FS, image, and native window APIs.** Red DEV icon + persistent in-app "Development · Test Data Only" badge; production `src-tauri/icons/` untouched. |
| `npm run tauri dev` | **Do not use.** Native startup guard (`lib.rs`) rejects a debug build carrying the production identifier. |
| `npm run build` | `tsc && vite build` — `tsc` is the only static check; strict + `noUnusedLocals`/`noUnusedParameters`. |
| `npm run tauri build` | Production desktop bundle (`com.medialogger.data`). |
| `npm run tauri:perf:dev` | Performance Lab (`tauri.perf.conf.json`, `com.medialogger.perf`, synthetic data only). |
| `npm run tauri:perf:build` / `dev:perf` / `build:perf` | Performance-mode variants (profiling renderer alias + sourcemaps). |
| `npm run changelog:sync` | Syncs `src/data/changelog.json` with GitHub Releases. **User-only** — needs `gh` auth. |

- No tests, lint, or formatter exist — do not add any. CI: `.github/workflows/build.yml` (release-published **opt-in via `<!-- build -->` in release notes**, or manual dispatch; macOS+Windows) and `site-rebuild.yml` (on release publish).
- **Never launch, focus, or automate the production `Media Logger` app or its data directory.** Develop and verify only in the `Media Logger Development` window.

## Dependency traps

- `@tauri-apps/*` npm packages and their `Cargo.toml` crates must move in lockstep (api↔tauri/tauri-build, plugin-sql/fs/dialog/opener↔tauri-plugin-*). Mismatched major/minor → `tauri dev` hard-errors on startup.
- `framer-motion` is pinned to its `motion-dom`/`motion-utils` internals via `package.json` `overrides` — bump the overrides together with framer-motion or npm installs mismatched internals.

## Architecture map

**Frontend (`src/`)** — pointer map; read the file before editing its area.

- `main.tsx` → `App.tsx`: `QueryClientProvider` → `ThemeProvider` → `HoverTooltipProvider` → `Profiler` → `BrowserRouter` → `Layout` → lazy routes (`createPreloadableRoute`, prefetch on nav intent). `AppBootstrap` initializes the image service, delayed derivative prewarm, and the query-invalidation bridge.
- Routes (react-router **v8** — import from `react-router`, never `react-router-dom`): `/`, `/year/:year`, `/search`, `/stats`, `/profiles`, `/awards`, `/collections`, `/backlog`, `/review`, `/settings`; `/performance` exists only in dev/perf builds.
- `lib/query-client.ts` — one `queryClient`, `staleTime: Infinity`; all invalidation is explicit through `mediaQueryKeys` (scoped by data-directory hash + adult toggle) via `invalidateMediaQueries()` / `requestMediaQueryInvalidation()` / `connectQueryInvalidationBridge()` (auto-invalidates on entry mutations). Bypassing these keys = stale screens.
- `lib/db/` — data layer: `dbService` facade (`service.ts`, methods timed via `beginPerformanceSpan` — do not remove timing hooks), `connection.ts` (`connect()` dedupe/reuse + legacy migration), `migrations.ts` (invoke wrapper), `shared.ts` (adult SQL + LIKE escaping), `index.ts` barrel, feature modules `entries.ts`, `backlog.ts`, `random-pick.ts`, `distinct-values.ts`, `avg-history.ts`, `events.ts`, `types.ts`. **Inside `lib/db/`, import siblings directly — never the barrel or `service.ts`** (keeps the graph acyclic); consumers outside use the barrel.
- `lib/stats-logic.ts` — pure in-memory stats (`createStatsDataset`/`buildFullStatsFromDataset`), shared between main thread and `workers/stats-worker.ts` + `stats-worker-protocol.ts`. No SQL aggregations.
- `components/VirtualizedCardGrid.tsx` — `@tanstack/react-virtual` row windowing over the shared scroll container (`lib/scroll-container.tsx`), plain render under 80 items. All card grids go through it.
- `components/CoverImage.tsx` — the one image component (`path`/`variant`/`priority`/`containerClassName`/`imageClassName`; no `className` prop). Remote `https://` URLs pass through.
- `components/HoverTooltip.tsx` — **the only tooltip system** (`useHoverTooltip`, `TooltipTitle`/`TooltipDetail`). Native `title` is banned app-wide.
- `lib/image-service.ts` — frontend of the native pipeline (see below); `lib/utils.ts` `saveImage()` is a stage/commit shim for profile images.
- `lib/cover-palette.ts` — batched (256), deduped, process-cached palette fetching; misses are remembered, cache drops on data-directory change. Always render a non-palette fallback.
- `lib/performance-diagnostics.ts` + `useAnimationPause.ts` — instrumentation (samples, spans, Profiler commits, frame/heap series) and the animation energy-saver (`animations-paused`/`animations-scrolling`). The Performance page is gated to dev/perf builds (`lib/performance-mode.ts`).
- `lib/settings.ts` + `lib/themes.ts`/`ThemeContext.tsx` — localStorage settings (`media-logger-*` keys) and CSS-variable themes. `prepareIsolatedBuildEnvironment()` runs before providers mount: dev/perf builds ignore the custom data-directory setting entirely.
- `lib/backup/` — v2 envelope, `validation.ts` (validate before any write), `service.ts` export/import, `legacy-v1.ts` CSV reader; `lib/csv-logic.ts` re-exports it. Imports execute in Rust.
- Feature slices: `lib/media-config.tsx` (canonical entry types + adult helpers); `components/profiles/` + `lib/profiles/` + `lib/profiles-logic.ts`; `lib/collections/sorting.ts` + `components/collections/`; `lib/review/`; `lib/backlog/density.ts` + `components/backlog/`; `components/stats/plate/`; `lib/cover-search.ts` + `lib/web-search.ts`.

**Backend (`src-tauri/`)**

- `main.rs` → `media_logger_lib::run()` in `lib.rs`: plugins sql/fs/dialog/opener only; `media://` async URI scheme; macOS menu emitting `menu-navigate` (⌘1–9, ⌘,) and `menu-new-entry` (⌘N) — `Layout.tsx` listens; dev-identifier startup guard; window opaque↔transparent on focus (perf: WindowServer recomposites transparent windows even when idle — don't remove). macOS hides its title bar (`titleBarStyle: Overlay` + `hiddenTitle`): the native traffic lights are inset into the sidebar's 46px band (`ensure_traffic_light_inset`, re-asserted on resize/focus, hidden while fullscreen) and that band is the window's drag region (`data-tauri-drag-region`); Windows keeps native decorations and no band.
- `database.rs` — migrations `user_version` 0→7, backup export/import, collection/award/backlog reorders.
- `image_service.rs` — derivative pipeline + palette extraction (see below).
- `cover_search.rs` — **all** outbound HTTP (reqwest/rustls, no OpenSSL); no JS `fetch`.
- `mcp.rs` — opt-in local MCP server (see below). `perf_fixture.rs` — synthetic corpus, perf identifier only.
- `glass.rs` — objc2 Liquid Glass (macOS 26+) → window-vibrancy fallback; Windows Mica/blur.
- Configs: `tauri.conf.json` (prod base; named configs override it partially), `tauri.dev.conf.json`, `tauri.perf.conf.json`.

## Image pipeline — the contract

- Local images are served **only** via `media://localhost/v1/<generation>/<variant>/<base64url-path>` (ETag, HEAD, 410 on generation change). Variants: `small`/`card`/`hero`/`original`. Never `convertFileSrc()`, asset-protocol, blob URLs, or raw `<img>` for local files — use `CoverImage`/`createMediaSources`.
- Derivative cache: 3 GiB default (1/3/5 in Settings), 128 MiB memory; decode limits cap memory.
- Import = `stageCoverImport` → `commitCoverImport` (atomic move into `assets/`, returns the relative path) → `cancelCoverImport` on failure. All forms use this. **Only relative paths go in the DB — never image bytes.**
- `prewarmImageCache` runs in 200-item batches from `AppBootstrap`; generation is concurrency-limited (2 slots) and must never starve visible covers.
- `cover_palettes` reduces a cover to `shadow`/`base`/`accent` hex colours for shelf tinting. **Lightness is fixed by the recipe, never sampled** — that's what keeps white type legible on every palette. Bump `PALETTE_VERSION` when the recipe changes.

## Database

- SQLite `media_logger.db` + `entries` table (`DB_FILENAME`) — don't rename either. Three identities with isolated data dirs: prod `com.medialogger.data` (app-local or user custom path — never assume it), dev `com.medialogger.dev`, perf `com.medialogger.perf` (synthetic only — never point it at real data).
- Legacy `jav_log.db` is copied once (+ `-wal`/`-shm`) by `connect()` and left as a backup — never delete or reopen it.
- Migrations run natively, one transaction per version, `user_version` 0→7, forward only; newer-than-app DBs are refused. Landmarks: v2 `javs`→`entries` rename + backfills; v3 17 indexes + `entries_fts` (external-content FTS5, trigram, triggers); v4 `collections.sort_order`; v5 `backlog_items.in_progress_since`; v6 `is_expansion`/`parent_entry_id` (`ON DELETE SET NULL`); v7 `award_templates.entry_type`.
- Booleans are INTEGER 0/1. `actress` is a comma-delimited string.
- Search: ≥3 chars → `entries_fts` trigram MATCH; 1–2 chars → LIKE (`buildSearchQuery`). `searchEntriesPaged`: 100-row `EntryCardSummary` pages, keyset `(completion_date DESC, id DESC)`, COUNT on first page only, `hasMore` by over-fetch, NULL dates as a separate trailing block (OR-ing it in collapses the index SEARCH into a SCAN). **No OFFSET, no per-page COUNT.**
- Read paths use summary projections; full rows via `getEntryById`/`getEntriesByIds` (batched 900) only for detail views/modals. No `SELECT *` into grids.
- Adult types (`JAV`, `Hentai`, `Adult Visual Novel`) are filtered out by `adultExclusionSql()`/`filterHiddenEntries()` when the setting is off — never deleted. `hasEntries()`/`getAllReferencedCoverPaths()` deliberately ignore the setting (cleanup/prewarm see everything).
- Expansions: games-only, enforced one level deep **in the UI only** (form picker excludes expansions as parents); parent delete nulls children via FK; backup import remaps `parent_entry_id` through `media_id_map` in a second pass.

## Stats screen (`components/stats/plate/`, codename "Plate")

One `h-full` screen that never scrolls: toolbar → figure strip → timeline hero → 4-panel grid.

- `Stats.tsx` fetches thin `StatsEntry` rows once per year with no type filter (`StatsEntry` omits `description`/`notes`/`early_access_version`/`update_version`), transfers the dataset to the worker once per version, and runs `derivePlateSelection()` (plate-data.ts) per brush/type/compare change; requests coalesce to the latest; a synchronous main-thread fallback shares the same function — **keep both paths identical**.
- **Brushing must never trigger a query or dataset re-transfer.** Type filtering happens in JS so off-chips keep live counts; adult exclusion stays in SQL.
- Comparison loads a second dataset (months-aligned projection; none on All Time). Modals fetch full rows via `getEntriesByIds` only when opened.
- Panels: six defined in `plate-config.ts`, four slots (default genres/scores/catalogue/standouts), `compact`+`expanded` variants via `renderPlatePanel`; prefs persist under `media-logger-stats-plate`.
- Conventions: `PanelFrame` stays `h-full` (no fixed min-height floors on panel frames); `BarRow` must be `w-full`; covers go through the `plate-ui.tsx` `CoverImage` wrapper (some row types carry no `image_url` and are matched back by name/id); entrance animation is mount-only — never keyed to the range; `selectGenres()` caps at 25 — headline counts use `countDistinctGenres()`; brush-strip granularity matches the chart (weekly cells per year, yearly on All Time).

## Feature contracts

- Backlog shelves: three densities (`spines`/`strips`/`covers`; `media-logger-backlog-density`, default `strips`), one `BacklogSpine` component (the In-Progress shelf is always face-out and unaffected), measurement in `components/backlog/backlog-visuals.ts`. `strips` layers artwork above the palette tint with `mix-blend-mode: luminosity` (blurred at rest, sharp on hover); `.backlog-spine` keeps `isolation: isolate`; the `.backlog-spine-tint` layer fades in so late-arriving palettes don't flash a whole shelf.
- Collections index sort (`lib/collections/sorting.ts`): `custom` = stored `collections.sort_order` edited by drag; every other mode is derived in memory — switching costs no query and never rewrites stored order (`media-logger-collections-sort`, default alphabetical).
- Cover art search: opt-in, defaults **off** (`isCoverArtEnabled`); one provider per type (Movie/Show/K-Drama→TMDB, Anime→AniList, Book→Open Library, Album→iTunes, Game→IGDB or RAWG by `media-logger-game-cover-provider`; adult types + Other stay manual). Picked art flows through `cover_stage_from_url` → the normal stage/commit pipeline (https only, 32 MiB cap). Errors are sanitized — no upstream URLs/bodies/credentials; TMDB attribution is required. Synopsis (`media_synopsis`) is session-cached only. Web-search opens are scoped to `google.com/search*` in capabilities — keep it that narrow.
- MCP server (`mcp.rs`): opt-in from Settings, read-only (own `query_only` sqlx pool + SELECT allowlist — notes, image paths, ownership/private flags are never selected), 127.0.0.1 only, bearer token hashed + audit log. Adult data requires both the app-wide setting and the MCP opt-in.
- Backup: ZIP of `backup.json` + `assets/` via the `zip` crate (no external tools); validate v2 envelope before any write; legacy v1 CSV converts on import.
- Theming: CSS variables (`--color-*`) everywhere, dark only (`data-theme-mode="dark"`); keys `media-logger-color-theme`/`media-logger-glass-style`; native glass via `apply_glass_style`.

## Build quirks

- `vite.config.ts`: `strictPort` 1420; `src-tauri/` excluded from the watcher; `performance` mode aliases `react-dom/client`→`react-dom/profiling` + sourcemaps (never alias bare `react-dom` — circular self-import).
- CSP lives in `index.html` (`tauri.conf.json` sets `"csp": null`); `img-src` covers `media:`, `blob:`, `data:`, `https:`.
- `tsconfig`: strict + `noUnused*` + `noEmit` + `moduleResolution: bundler`. Tailwind v3 maps colors to CSS vars (`colors.primary: var(--color-primary, #5E35B1)`).
- No updater plugin exists anywhere — never reference auto-update.
