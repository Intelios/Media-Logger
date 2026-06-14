# Media Logger — Agent Guide

**Tauri v2 + React 19 + TypeScript + Tailwind CSS** desktop app. No mobile/website plans.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server only (browser preview, **no Tauri**) |
| `npm run tauri dev` | Full Tauri desktop app |
| `npm run build` | `tsc && vite build` (type-check then frontend build) |
| `npm run tauri build` | Production desktop app bundle |
| `npm run tauri` | Tauri CLI passthrough |
| `npm run changelog:sync` | Syncs `src/data/changelog.json` with GitHub Releases. **User-only** — requires `gh` CLI auth. |

No tests, lint, formatter, or CI configs exist and none should be added.

## Architecture

**Frontend (`src/`)**:
- Entry: `src/main.tsx` → `App.tsx` → `<ThemeProvider>` + `<BrowserRouter>` + `<Layout>` + lazy-loaded pages.
- Pages: Dashboard, YearView, Search, Stats, Profiles, Awards, Collections, Backlog, Review, Settings.
- `src/lib/db.ts` — singleton `dbService` wrapping `@tauri-apps/plugin-sql`; migrations run on every `connect()`.
- `src/lib/stats-logic.ts` — stats computed in-memory from fetched rows, not SQL aggregations.
- `src/lib/themes.ts` + `ThemeContext.tsx` — CSS-variable theming persisted to `localStorage`.
- `src/lib/settings.ts` — `localStorage`-based settings (data dir, display name, nav years, adult-media toggle).
- `src/lib/utils.ts` — image loading via Tauri FS plugin (reads local files → blob URLs).

**Backend (`src-tauri/`)**:
- `main.rs` → calls `media_logger_lib::run()`.
- `lib.rs` — Tauri builder with plugins (sql, fs, dialog, opener, updater, liquid-glass), native macOS menu bar, backup zip/unzip commands.
- Backup relies on system `/usr/bin/zip` and `/usr/bin/unzip` (macOS) or `zip`/`unzip` (other platforms).
- Window is transparent (for macOS glass/vibrancy effects).

**Routing** (`react-router-dom`):
- `/` Dashboard, `/year/:year` Year View, `/search` Search, `/stats` Stats, `/profiles` Profiles, `/awards` Awards, `/collections` Collections, `/backlog` Backlog, `/review` Review, `/settings` Settings.

## DB / Data Quirks

- SQLite canonical filename is `media_logger.db` (`DB_FILENAME` in `src/lib/db.ts`).
- Legacy installs used `jav_log.db`; `dbService.connect()` migrates once by copying the file plus `-wal`/`-shm` sidecars, leaving the original untouched as a backup. **Do not delete or reopen it.**
- DB path is `{appLocalDataDir}/media_logger.db` or a user-configured custom path (`getDataDirectory`).
- Migrations run automatically on every `connect()` — schema evolves forward, never reset.
- Legacy table renamed: `javs` → `entries`.
- Boolean-like fields (`is_rewatch`, `is_platinum`, `is_completed`, `own_local_copy`, `has_subtitles`, `is_early_access`) are stored as SQLite integers (0/1), not booleans.
- `actress` is a comma-delimited string, not a normalized column. Search uses comma-aware `INSTR` matching.
- Stats fetch all matching rows then compute in JS — be mindful of large datasets.
- Adult entry types are hidden via `adultExclusionSql()` / `filterHiddenEntries()` when the Adult Media setting is off; data is never deleted, only filtered from queries.

## Theming

- Theme keys in `localStorage`: `media-logger-color-theme`, `media-logger-glass-style`.
- CSS variables (`--color-primary`, `--color-surface`, etc.) drive all styling.
- Only dark modes are supported.
- macOS native glass/vibrancy applied via Tauri command `apply_glass_style` in Rust.
- `tauri-plugin-liquid-glass` requires macOS 26+; older macOS falls back to `window-vibrancy`. Windows uses Mica/blur.

## Vite Config Quirks

- Dev server hardcoded to port **1420** (`strictPort: true`).
- `src-tauri/` excluded from Vite watcher to avoid endless recompiles.
- CSP in `index.html` allows `blob:`, `data:`, `https:` for images; `tauri.conf.json` sets `csp: null` and lets `index.html` own it.

## Native macOS Menu Bar

Defined in Rust (`lib.rs`). Sends Tauri events to the frontend:
- `menu-navigate` for ⌘1–⌘7 (Dashboard, Year View, Search, Stats, Profiles, Awards, Collections)
- `menu-new-entry` for ⌘N
- ⌘, opens Settings

## What NOT to Do

- Do not add test/lint/formatter infrastructure.
- Do not rename `media_logger.db` or the `entries` table — use `DB_FILENAME` and the `entries` table name.
- Do not change the DB connection flow — migrations must run on every `connect()`.
- Do not assume booleans in SQLite — check for the 0/1 integer pattern.
- Do not assume `npm run dev` gives you a desktop app — use `npm run tauri dev`.
- Do not delete the legacy `jav_log.db` backup.
