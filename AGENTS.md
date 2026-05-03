# Media Logger — Agent Guide

**Tauri v2 + React 19 + TypeScript + Tailwind CSS** desktop app for tracking completed media.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server only (browser preview, no Tauri) |
| `npm run tauri dev` | Full Tauri desktop app (launches Vite + Rust backend) |
| `npm run build` | `tsc && vite build` (type-check then frontend build) |
| `npm run tauri build` | Production desktop app bundle |
| `npm run tauri` | Tauri CLI passthrough |

There are no test, lint, formatter, or CI configs. Do not look for them.

## Architecture

**Frontend** (`src/`):
- Entry: `src/main.tsx` → `App.tsx` → `<ThemeProvider>` + `<BrowserRouter>` + `<Layout>` + lazy-loaded pages
- Pages (all lazy): Dashboard, YearView, Search, Stats, Profiles, Awards, Collections, Review, Settings
- `src/lib/db.ts` — singleton `dbService` class wrapping `@tauri-apps/plugin-sql`. Database migrations run automatically on every `connect()`.
- `src/lib/stats-logic.ts` — stats computed in-memory from fetched entries (eventually consistent; see DB quirks).
- `src/lib/themes.ts` + `ThemeContext.tsx` — CSS variable-based theming persisted to `localStorage`.
- `src/lib/settings.ts` — `localStorage`-based app settings (data dir, display name, nav years).
- `src/lib/utils.ts` — image loading via Tauri FS plugin (reads local files → blob URLs).

**Backend** (`src-tauri/`):
- `main.rs` → calls `media_logger_lib::run()`
- `lib.rs` — Tauri builder: plugins (sql, fs, dialog, opener, liquid-glass), native macOS menu bar, backup zip/unzip commands
- Backup relies on system `/usr/bin/zip` and `/usr/bin/unzip` (macOS) or `zip`/`unzip` (other platforms)
- Window is transparent (for macOS vibrangy/glass effect)

**Routing** — all client-side via `react-router-dom`:
- `/` — Dashboard
- `/year/:year` — Year View
- `/search` — Search
- `/stats` — Stats
- `/profiles` — Profiles
- `/awards` — Awards
- `/collections` — Collections
- `/review` — Review
- `/settings` — Settings

## DB / Data Quirks

- SQLite file is named `jav_log.db` (legacy name, do not rename).
- Database path: `{appLocalDataDir}/jav_log.db` or user-configured custom path.
- Migrations run automatically in `dbService.connect()` — schema evolves forward, no reset.
- Legacy table renamed: `javs` → `entries`.
- `is_rewatch`, `is_platinum`, `is_completed`, `own_local_copy` are stored as SQLite integers (0/1), not booleans.
- `actress` is a comma-delimited string, not a normalized column. Search uses comma-aware `INSTR` matching.
- Stats queries fetch all matching rows then compute in JS (not SQL aggregations). Be careful with large datasets.
- Entry form uses `@dnd-kit` for drag-and-drop (only in `EntryForm` and `ReorderModal`).

## Theming

- Theme info stored in `localStorage` keys: `media-logger-color-theme`, `media-logger-theme-mode`, `media-logger-glass-style`
- CSS variables (`--color-primary`, `--color-surface`, etc.) drive all styling
- Light mode uses `.light-mode` class overrides on dark-biased utility classes (see `src/index.css`)
- macOS native glass/vibrancy applied via Tauri command `apply_glass_style` (Rust backend)
- `tauri-plugin-liquid-glass` requires macOS 26+; older macOS falls back to `window-vibrancy`

## Vite Config Quirks

- Dev server hardcoded to port **1420** (`strictPort: true`).
- `src-tauri/` excluded from Vite watcher (avoid endless recompiles).
- CSP in `index.html` allows `blob:`, `data:`, `https:` for images.

## Native macOS Menu Bar

Defined in Rust (`lib.rs` setup hook). Sends Tauri events (`menu-navigate`, `menu-new-entry`) to frontend. Keyboard shortcuts:
- `⌘1` Dashboard, `⌘2` Year View, `⌘3` Search, `⌘4` Stats
- `⌘5` Profiles, `⌘6` Awards, `⌘7` Collections
- `⌘,` Settings, `⌘N` New Entry

## What NOT to Do

- Do not add test/lint/formatter infrastructure — none exists and is intentionally absent.
- Do not rename `jav_log.db` or the `entries` table.
- Do not change the DB connection flow — migrations must run on every connect.
- Do not assume booleans in SQLite — check for 0/1 integer pattern.
- Do not assume `npm run dev` gives you a desktop app — use `npm run tauri dev` for that.

## What NOT to Suggest

- If asked for new features do not suggest the following:
  - Backlog Feature
  - Web Browser version
  - Mobile version
- All of these are not wanted by the user!
