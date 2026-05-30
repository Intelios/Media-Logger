# Media Logger 3.0 — Bug, Glitch & Optimization Report

_Review date: 2026-05-30 · Branch: `3.0` · Scope: full codebase (frontend `src/`, Rust backend `src-tauri/src/lib.rs`)_

This is a **findings-only** report — nothing has been changed. Items are grouped by severity. Each entry lists the location (`file:line`, clickable), what's wrong, why it matters, and a suggested direction. Line numbers are from the current working tree.

---

## 🔴 High severity (data loss / broken behavior)

### H1. Backup export silently drops Early Access fields
**`src/lib/csv-logic.ts:146`** (`MEDIA_COLUMNS`)

`MEDIA_COLUMNS` lists every entry column **except `is_early_access` and `early_access_version`**, even though both exist in the schema (`db.ts:78`), are edited in the form, and shown on cards.

Consequence: any JSON/ZIP backup → restore round-trip **permanently loses** a game's Early Access flag and version string. The data is in the DB but never written to the export, and on import the missing columns fall back to the `0`/NULL defaults.

Fix direction: add `"is_early_access"` and `"early_access_version"` to `MEDIA_COLUMNS`.

### H2. Re-importing a backup duplicates every entry that has no completion date
**`src/lib/csv-logic.ts:463`**

Duplicate detection is:
```sql
SELECT id FROM entries WHERE name = $1 AND completion_date = $2
```
When `completion_date` is `NULL`, `completion_date = NULL` is never true in SQL, so the row is **never** recognized as a duplicate. Importing the same backup twice (or importing into a DB that already holds those entries) re-inserts every date-less entry each time.

Fix direction: use `(completion_date IS $2 OR completion_date = $2)` style matching, or `IS NOT DISTINCT FROM` semantics (SQLite: `completion_date IS $2`).

## 🟠 Medium severity

### M1. Duplicated `ref` on the same hook in card menus
**`src/components/MediaCard.tsx:286` & `:364`** and **`src/pages/Profiles.tsx:492` & `:506`**

`menuRef` is attached to **two** elements at once — the button wrapper and the portalled dropdown. React only keeps one ref target, so the "click-outside to close" containment check (`menuRef.current.contains(...)`) tests against only one of them. This makes the open/close toggle and outside-click dismissal unreliable (the dropdown can flicker or fail to close when re-clicking the trigger). Use two separate refs (one for the button, one for the portal) and check both.

### M2. A rating of `0` is treated as "no score" in JS-side averages
**`src/lib/profiles-logic.ts:63`**, **`src/lib/review-logic.ts:95`**, **`src/lib/review-logic.ts:136`**

`if (entry.review_score)` is falsy for `0`, so a legitimately 0-rated entry is excluded from profile and annual-review averages. Meanwhile the SQL averages (`dashboard-stats.ts:21`) and `stats-logic`'s `hasReviewScore` (`:125`) correctly include `0` (they check `IS NOT NULL` / `Number.isFinite`). The form lets users pick `0` (`EntryForm.tsx:266`), so the two averaging paths can disagree. Use an explicit `!= null` / `Number.isFinite()` check everywhere.

### M3. `ensureTablesExist` recreates `entries` with a stale, incomplete schema
**`src/lib/csv-logic.ts:286`**

The import-time `CREATE TABLE IF NOT EXISTS entries (...)` omits `series`, `is_early_access`, and `early_access_version`. Today this is masked because `ensureTablesExist` first calls `dbService.connect()`, whose migrations create the full table — so the incomplete `CREATE` is a no-op. But it's a latent landmine: if import order ever changes, importing into a fresh DB would create a table missing `series` and then fail every `INSERT` that includes a `series` value. This whole function is a near-duplicate of `db.ts`'s `createTables()` and should be removed in favor of it.

### M4. Import is non-transactional and chatty
**`src/lib/csv-logic.ts:419`** onward

Every row is inserted with its own awaited `db.execute`, inside several sequential per-row duplicate-check queries. For a large library this is slow (O(N) round-trips per table) and **non-atomic** — a failure midway leaves a half-imported database with no rollback. Wrap the import in a single transaction (`BEGIN`/`COMMIT`) and/or batch inserts.

### M5. `parseCSV` coerces numeric-looking text into numbers
**`src/lib/csv-logic.ts:45`**

`/^\d+$/` converts any all-digit cell to a number. So a title like `"1917"`, `"2001"`, or `"007"` round-trips as a number — `"007"` becomes `7` (leading zeros lost), and numeric-named entries can mis-compare against the TEXT `name` column during duplicate detection. Only coerce columns you know are numeric, or keep `name`/text fields as strings.

### M6. StrictMode + Tauri `listen()` can double-register menu listeners
**`src/components/Layout.tsx:107`**

`listen()` returns a promise; the cleanup does `unlisten.then(fn => fn())`. Under React 19 StrictMode (enabled in `main.tsx:7`), the effect mounts→unmounts→mounts in dev, and the unlisten promise may not have resolved before the second registration. Result: `menu-navigate` / `menu-new-entry` can fire twice in dev (e.g., double navigation, two entry forms). Production is unaffected, but guard with an `isMounted`/cancel flag to be safe.

---

## 🟡 Low severity / polish

### L1. Dead, adult-unfiltered `dbService.getStats()`
**`src/lib/db.ts:884`** — defined but unused anywhere (the dashboard uses `dashboardLogic.getStats`). It also lacks `adultExclusionSql()`, so it would report wrong totals if ever wired up. Remove it.

### L2. Fragile `setTimeout` write/refresh hacks
**`src/pages/YearView.tsx:344`** (`setTimeout(() => loadData(), 50)` "to ensure DB write commits") and **`src/components/Layout.tsx:206`** (`entry-added` dispatched after `100ms`). The DB writes are already `await`ed, so the delays are unnecessary and racy. Call `loadData()` directly / dispatch synchronously after the awaited write.

### L3. Dashboard featured pick is O(offset) and re-randomizes every visit
**`src/lib/dashboard-stats.ts:62`** uses `ORDER BY id ASC LIMIT 1 OFFSET <random>` (scans `offset` rows). `ORDER BY RANDOM() LIMIT 1` is simpler and equivalent. Separately, the dashboard only loads on mount, so the "Featured" entry rerolls on every navigation back to Home — fine if intended, worth confirming.

### L4. Collapsible sidebar sections clip past ~1000px
**`src/components/Layout.tsx:486`** uses `max-h-[1000px]` for the expanded state. A user with a long Years timeline (≈27+ years) or future-expanded Library section would have content clipped by the transition wrapper. Use `grid-template-rows` 0fr→1fr or a measured height instead of a magic max-height.

### L5. Image blob URL cache never revoked
**`src/lib/utils.ts:7`** `urlCache` keeps every `URL.createObjectURL` blob for the app's lifetime and never calls `URL.revokeObjectURL`. Over a long session browsing large libraries this is a slow memory leak. Also, the cache keys on the relative path, so it's never invalidated if a file at that path is replaced (currently safe only because saved images use fresh UUID filenames).


### L6. `ChipPicker` dynamic Tailwind class can't be generated
**`src/components/RandomPickModal.tsx:154`** builds `grid-cols-${columns}` in a template literal. Tailwind purges classes it can't see statically, so this class would never exist. Currently harmless (the `columns` prop is never passed), but it's dead/misleading code.

### L7. Minor duplications & brittleness
- **`src/components/EntryForm.tsx:178`** & **`:183`** — two identical `if (key === "entry_type" && value !== "Game")` blocks; merge them.
- **`src/pages/Stats.tsx:232`** — `handleModalEntriesChange` re-derives which query to run by string-parsing the modal title (`"Genre: "`, `"Logged on: "`). Brittle; track the active modal kind in state instead.
- **`src/lib/db.ts` migrations** — the many sequential `ALTER TABLE … ADD COLUMN` + `PRAGMA table_info` calls run on every `connect()`. Correct, but consider a single version-gate so a fully-migrated DB skips the per-column probing.
