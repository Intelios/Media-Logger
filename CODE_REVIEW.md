# Media Logger — Page Review Findings

Dashboard page has been completed review wise.

## Page Under Review: Year View (`/year/:year`)

Reviewed: `src/pages/YearView.tsx`, supporting `getEntriesByYear`/`filterHiddenEntries` (`src/lib/db/entries.ts`, `shared.ts`), `useAdultMediaEnabled`/presets (`src/lib/media-config.tsx`), `getProfileKeys` cache (`src/lib/profiles-logic.ts`), `getAwardsForMediaBatch` (`src/lib/awards-logic.ts`), `MultiSelectFilter.tsx`, `MediaCard.tsx`, the `entry-added` event flow (`Layout.tsx`, `Backlog.tsx`, `Settings.tsx`, `navigation-years.ts`), and the `.cv-auto` content-visibility CSS (`index.css:40-55`).

---

## Bugs & Glitches

### 1. Sidebar year list goes stale after edits/deletes made in Year View
**Location:** `YearView.tsx:336-350`, `Layout.tsx:89-103`

`handleSave`/`handleDelete` call `loadData()` (refreshes this page only) but never dispatch `entry-added` or `NAVIGATION_YEARS_UPDATED_EVENT`. Layout's sidebar year list only refreshes on `entry-added` / `NAVIGATION_YEARS_UPDATED_EVENT` (or mount). Consequence: editing an entry in Year View and moving it to a brand-new year (new `completion_date`), or deleting the last entry of a year, leaves the sidebar showing the old year set until the app is reloaded. Inconsistent with Backlog (`Backlog.tsx:232`), which does dispatch the event. `getAvailableNavigationYears` would pick up the change — nothing just ever triggers it from this page.

### 2. Import while Year View is open shows stale data
**Location:** `YearView.tsx:284-295`, `Settings.tsx:866-868`

The `entry-added` refresh listener only fires when `String(customEvent.detail?.year) === year`. Settings' post-import dispatch (`Settings.tsx:867`) sends no `detail`, so an open Year View ignores it entirely — imported entries (or years) don't appear until the page remounts. `dbService.notifyExternalMutation()` → `onEntriesMutated` is also not subscribed to here. The Backup page restore has the same gap (`Settings.tsx` import modal covers both paths).

### 3. Count and grid briefly disagree on every filter change
**Location:** `YearView.tsx:256-260, 406, 578`

`{filteredEntries.length} of {entries.length}` uses the synchronous memo, but the grid renders `deferredEntries` (`useDeferredValue`). On a filter toggle with many cards, the count updates instantly while the grid lags a frame or two — "12 of 20 items" shown above a grid still displaying the previous set (and vice-versa during the lag). Cosmetic but noticeable; the empty state is also deferred (`deferredEntries.length > 0` at line 578), so "No entries match your filter" appears a beat after the count hits 0.

### 4. Highlight feature fails silently when the entry can't be shown
**Location:** `YearView.tsx:297-334`

If the highlighted entry isn't in the filtered set after the auto-added type filter (e.g. the entry's type is adult and the Adult Media setting is off — the `typeParam` is rejected at line 307), or the 100ms scroll timeout fires before `deferredEntries` renders the card (which can be pushed out further because the wrapper uses `content-visibility: auto`), `highlightRef.current` is null, `scrollIntoView` silently no-ops, and the URL params are already wiped (`setSearchParams({}, {replace:true})` at line 322). The user gets zero feedback — no scroll, no ring. Also: the guard ref `hasProcessedHighlight` is set to `true` *before* the entry is actually visible, so a second `?highlight=` navigation while the same instance is mounted (e.g. back-forward within the year) is ignored. The hardcoded 100ms + 3s timeouts are also never cleaned up on unmount.

### 5. "Reset Filters" empty-state button doesn't reset status filters
**Location:** `YearView.tsx:607-616`

When the empty state is caused by the Local Copy / Rewatch / Subtitles status filters (types all selected), the "Reset Filters" button only calls `setSelectedTypes(getVisibleEntryTypes())` — the status filters stay active, so the user clicks it and nothing changes. The header's "Clear All" (line 550-572) resets everything, but the two affordances are inconsistent and the empty-state one is misleading.

### 6. DB error renders as "No entries match your filter"
**Location:** `YearView.tsx:249-253, 607-617`

`loadData`'s catch only `console.error`s; `entries` stays `[]`, which is indistinguishable from a legitimately empty/filtered year. A failed `getEntriesByYear` (e.g. DB lock after backup restore) shows the empty-state with a "Reset Filters" button that does nothing. No error state is surfaced.

### 7. Stale adult preset persists for one frame on mount
**Location:** `YearView.tsx:56-66, 123, 264-272`

`loadPersistedPreset` only validates against `FILTER_PRESET_KEYS` (which includes `"adult"`), so a persisted `"adult"` preset is loaded even when Adult Media is off and the preset button isn't rendered. The mount effect at line 264 clears it, but the first paint renders with `activePreset === "adult"` — the "Clear All" button shows despite no visible active preset. One-frame inconsistency; harmless but sloppy.

### 8. `cv-auto` wrapper: `content-visibility` can clip the highlight ring on the exact card being scrolled to
**Location:** `YearView.tsx:585-593`, `index.css:40-55`

Normal (non-glow) cards get `content-visibility: auto` with `contain-intrinsic-size: auto 420px`. The highlight ring (`ring-4` + `animate-pulse`) is drawn *outside* the card's border, and the padding hack (+8px/-8px) only pads the top — content-visibility applies paint containment, which can clip the ring's bottom/edges until hover lifts containment (`index.css:53`). In practice the scroll target is mid-viewport so it usually repaints, but a ring on a card near the fold can render clipped. Worth a `content-visibility: visible` when `isHighlighted`.

---

## Areas for Optimisation

### 1. Status-filter handlers are 3 copies of the same logic
**Location:** `YearView.tsx:156-194`

`handleLocalCopyToggle` / `handleRewatchToggle` / `handleSubtitlesToggle` are identical modulo key/setter (cycle `null → true → false → null`, set state, write/remove localStorage). A single generic handler parameterised by `(key, setter, current)` would delete ~30 lines. The preset-clearing trio in `handlePresetClick`, `onChange`, and `onSolo` (lines 197-209, 414-426) is likewise repeated three times — a single `applyTypes` wrapper that clears the preset and storage would centralise it.

### 2. `getEntriesByYear` fetches full rows, then adult-filters in JS
**Location:** `entries.ts:157-164`

`SELECT *` pulls heavy columns (`description`, `notes`) that Year View never renders, and with Adult Media off the adult rows are fetched from disk and then discarded by `filterHiddenEntries`. The other year-scoped queries (`random-pick.ts`) already splice `adultExclusionSql()` into SQL — `getEntriesByYear` could do the same and (optionally) project only the columns `MediaCard` renders. Same pattern flagged for the Dashboard; here it's per-year so the row count is smaller, but the in-memory filter is pure waste.

### 3. Missing index on `year_completed`
**Location:** `migrations.ts:530` (only index), `entries.ts:160`

`WHERE year_completed = $1 ORDER BY completion_date ASC` is a full-table scan on every Year View load, and `getAvailableNavigationYears()` (`navigation-years.ts:19-21`, `SELECT DISTINCT year_completed`) scans too. An index on `year_completed` (ideally `(year_completed, completion_date)`) would cover both the page's query and the sidebar refresh. Same recommendation as the Dashboard review's #6 — this is the shared hot column.

### 4. Awards/profile-keys fetches could be skipped when nothing can render them
**Location:** `YearView.tsx:229-248`

On every load: entries query → awards batch query → profile keys query. The awards batch and keys are fetched even when the active filter will hide every row (e.g. zero entries match), and `getAwardsForMediaBatch` re-runs on every adult-toggle refetch. All three queries do run concurrently where possible (good), but the awards batch could be deferred until after filtering. Minor — the awards query is indexed via `IN` + join, and keys are module-cached, so this is micro.

### 5. `getVisibleEntryTypes()` / `getVisiblePresetKeys()` called repeatedly per render
**Location:** `YearView.tsx:35, 103, 201, 412-421, 446, 554, 611`

Each call re-reads `localStorage` (`isAdultMediaEnabled`). Called ~8 times per render of the page. It's cheap, but the component could memoise the visible lists once per `adultEnabled` value (the reactive hook already tracks it). Micro-optimisation only.

### 6. `loadData`'s empty-ids branch is dead in practice
**Location:** `YearView.tsx:229-243` — the `else` branch (line 241-243) is dead in practice since `deferredEntries.length > 0` gates the grid and empty years render the empty state anyway; the map is reset to a fresh `Map()` only when ids exist (line 235). Harmless defensive code; the branch is fine to keep but unreachable in normal flow.

### 7. Redundant comment + import noise
**Location:** `YearView.tsx:9` (`// Import the component`), `YearView.tsx:19` (documented but used type)

Line 9's trailing comment is leftover scaffolding noise. `StatusFilter` type is well-documented. Trivial cleanup.

---

*This document is intended to be extended page-by-page with findings from other pages of the app.*
