# Media Logger — Agent Guide

Tauri v2 + React 19 + TypeScript + Tailwind CSS desktop app. No mobile/web plans.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite only, port 1420 browser preview. **No Tauri runtime.** |
| `npm run tauri dev` | Full Tauri desktop app. Must use this to exercise DB, FS, and native window APIs. |
| `npm run build` | `tsc && vite build` (frontend type-check + build). |
| `npm run tauri build` | Production desktop bundle. |
| `npm run tauri` | Tauri CLI passthrough. |
| `npm run changelog:sync` | Syncs `src/data/changelog.json` with GitHub Releases. **User-only** — requires `gh` CLI auth. |

- No tests, lint, formatter, or CI configs exist and none should be added.
- TypeScript is strict with `noUnusedLocals`/`noUnusedParameters`: unused variables fail `tsc`.

## Architecture

**Frontend (`src/`)**:
- Entry: `src/main.tsx` → `App.tsx` → `<ThemeProvider>` + `<BrowserRouter>` + `<Layout>` + lazy-loaded pages.
- Pages: `Dashboard`, `YearView`, `Search`, `Stats`, `Profiles`, `Awards`, `Collections`, `Backlog`, `Review`, `Settings`.
- `src/lib/db.ts` — singleton `dbService` wrapping `@tauri-apps/plugin-sql`; migrations run on every `connect()`.
- `src/lib/stats-logic.ts` — stats computed in-memory from fetched rows, not SQL aggregations.
- `src/lib/themes.ts` + `src/lib/ThemeContext.tsx` — CSS-variable theming persisted to `localStorage`.
- `src/lib/settings.ts` — `localStorage`-based settings (data dir, display name, nav years, adult-media toggle).
- `src/lib/utils.ts` — image loading via `@tauri-apps/plugin-fs` (reads local files → blob URLs), ref-counted cache.
- `src/lib/media-config.tsx` — canonical entry types and adult filtering helpers.

**Backend (`src-tauri/`)**:
- `main.rs` → calls `media_logger_lib::run()`.
- `lib.rs` — Tauri builder with plugins (sql, fs, dialog, opener, updater, liquid-glass), native macOS menu bar, and backup zip/unzip commands.
- Native commands: `apply_glass_style`, `create_backup_zip`, `read_backup_zip`, `extract_backup_assets`.
- Backup ZIP bundles `backup.json` plus the `assets/` directory. Rust uses `zip` crate; no external `zip`/`unzip` dependency.
- Window is transparent for macOS glass/vibrancy effects.

**Routing** (`react-router-dom`): `/`, `/year/:year`, `/search`, `/stats`, `/profiles`, `/awards`, `/collections`, `/backlog`, `/review`, `/settings`.

## Vite / Build Quirks

- Dev server is hardcoded to port **1420** (`strictPort: true`).
- `src-tauri/` is excluded from the Vite watcher (`watch.ignored`) to avoid recompile loops.
- CSP lives in `index.html`, not `tauri.conf.json` (which sets `"csp": null`). Image sources include `blob:`, `data:`, `https:`.
- `tsconfig.json` has `noEmit: true` and `moduleResolution: bundler`.
- Tailwind config maps colors to CSS vars (e.g., `colors.primary: var(--color-primary, #5E35B1)`).

## DB / Data Quirks

- SQLite canonical filename is `media_logger.db` (`DB_FILENAME` in `src/lib/db.ts`).
- Legacy installs used `jav_log.db`; `dbService.connect()` migrates once by copying the file plus `-wal`/`-shm` sidecars, leaving the original untouched as a backup. **Do not delete or reopen it.**
- DB path is `{appLocalDataDir}/media_logger.db` or a user-configured custom path (`getDataDirectory`).
- Migrations run automatically on every `connect()` — schema evolves forward, never reset.
- Legacy table renamed: `javs` → `entries`.
- Boolean-like fields (`is_rewatch`, `is_platinum`, `is_completed`, `own_local_copy`, `has_subtitles`, `is_early_access`) are stored as SQLite integers (0/1), not booleans.
- `actress` is a comma-delimited string, not a normalized column. Search uses comma-aware `INSTR` matching.
- Stats fetch all matching rows then compute in JS — be mindful of large datasets.
- Adult entry types (`JAV`, `Hentai`, `Adult Visual Novel`) are hidden via `adultExclusionSql()` / `filterHiddenEntries()` when the Adult Media setting is off; data is never deleted, only filtered from queries.

## Theming

- Theme keys in `localStorage`: `media-logger-color-theme`, `media-logger-glass-style`.
- CSS variables (`--color-primary`, `--color-surface`, etc.) drive all styling.
- Only dark modes are supported. `data-theme-mode="dark"` is always applied.
- macOS native glass/vibrancy is applied via Tauri command `apply_glass_style` in Rust.
- `tauri-plugin-liquid-glass` requires macOS 26+; older macOS falls back to `window-vibrancy`. Windows uses Mica/blur.

## Native macOS Menu Bar

Defined in Rust (`lib.rs`). Sends Tauri events to the frontend:
- `menu-navigate` for ⌘1–⌘9 (Dashboard, Year View, Search, Stats, Profiles, Awards, Collections, Backlog, Review).
- `menu-new-entry` for ⌘N.
- ⌘, opens Settings.

## What NOT to Do

- Do not add test/lint/formatter infrastructure.
- Do not rename `media_logger.db` or the `entries` table — use `DB_FILENAME` and the `entries` table name.
- Do not change the DB connection flow — migrations must run on every `connect()`.
- Do not assume booleans in SQLite — check for the 0/1 integer pattern.
- Do not assume `npm run dev` gives you a desktop app — use `npm run tauri dev`.
- Do not delete the legacy `jav_log.db` backup.
