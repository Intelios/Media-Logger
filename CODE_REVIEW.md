# Media Logger — Page Review Findings

## Page Under Review: Dashboard (`/`)

Reviewed: `src/pages/Dashboard.tsx`, `src/lib/dashboard-stats.ts`, `src/components/MediaListCard.tsx`, `src/components/AnimatedNumber.tsx`, `src/components/DashboardStatCard.tsx` (suspected dead code), supporting CSS in `src/index.css`, plus the supporting modules they depend on (`utils.ts`, `dates.ts`, `settings.ts`, `navigation-years.ts`, `db/*`).

---

## Bugs & Glitches

### 1. Featured card can link to a broken route `/year/null`
**Location:** `Dashboard.tsx:191`, `dashboard-stats.ts:45-78`

`getFeaturedEntry()` picks from *all* visible entries, including rows with `year_completed IS NULL` (e.g. a newly created entry with no completion date — `EntryForm.tsx:187-195` leaves `year_completed` undefined → null). The featured hero card links unconditionally:

```tsx
to={`/year/${featured.entry.year_completed}?...`}
```

If such an entry is featured, the link becomes `/year/null`, which matches the `year/:year` route with `year="null"` and lands the user on an empty year page. There is no guard or filter for this. (`handleCardClick` at line 132 does guard with `if (entry.year_completed)` — the featured link doesn't.)

**Fix suggestion:** Filter `year_completed IS NOT NULL` from the featured pool, or guard the link the same way `handleCardClick` does.

### 2. Recent Completions can show "Recent" entries the user hasn't seen in the lists
**Location:** `Dashboard.tsx:325-330` — minor. `recent.slice(0, 6)` is applied after fetch, but the query already fetches 15 (`LIMIT 15` in `dashboard-stats.ts:83`). Not a bug per se, just wasted rows (see optimisation below).

### 3. On This Day relies on `completion_date` being a strict `YYYY-MM-DD` string
**Location:** `dashboard-stats.ts:87-97`

`substr(completion_date, 6, 5) = 'MM-DD'` is a positional string match. All app writes (`EntryForm.tsx:127`, `backlog-logic.ts:93`) use `toISOString().split('T')[0]` so this holds for app-created data. However:
- Imported data (CSV/backup restore) is stored verbatim as strings (`csv-logic.ts` `parseCSV` doesn't normalise dates). Non-`YYYY-MM-DD` formats would silently never match "On This Day".
- Any leading/trailing whitespace, or a full timestamp (`YYYY-MM-DDTHH:mm...`), breaks the match.

This is a latent robustness bug rather than a live one, but the whole app elsewhere uses `strftime()` (`review-logic.ts:181,413`) which is more forgiving; the dashboard is the odd one out.

### 4. `useReducedMotion` + manual `prefersReducedMotion()` are inconsistent
**Location:** `Dashboard.tsx:35-36, 40, 77, 201-216`

The component reads reduce-motion twice: once via framer-motion's `useReducedMotion()` (used for the featured image/content animations) and once via a hand-rolled `prefersReducedMotion()` for the reroll spin. They're the same query so results usually agree, but:
- The `whileHover={{ y: -2 }}` lift in `MediaListCard.tsx:70` and the `dashboard-featured-wrap` hover transform are **not** disabled under reduced motion (framer-motion `whileHover` ignores the `reduceMotion` prop; CSS `.dashboard-featured-wrap:hover` transform is not in the `animations-paused` block at `index.css:17-38` either).
- The greeting stagger (`greetingContainerVariants`) also ignores reduced motion.

Inconsistent — some animations respect the setting, some don't.

### 5. Greeting/display-name don't react to settings changes while mounted
**Location:** `Dashboard.tsx:83-130`

Greeting and display name are computed once in the mount effect. If the user changes their display name in Settings and navigates back to the Dashboard, the page unmounts/remounts (lazy route) so it refreshes — fine in practice. However the effect is keyed on `[loadFeatured]`, and `getDisplayName()` reads `localStorage` directly; if the Dashboard were ever kept alive (e.g. react-router in-memory, or a future state-keepalive), the name would be stale. Low severity; worth a re-read on `storage`/custom event like the adult-visibility pattern.

### 6. Reroll button can be spam-fired before state settles
**Location:** `Dashboard.tsx:75-81`

`isRerolling` guards re-entry, but the state update is asynchronous; two rapid clicks within one frame (or keyboard + mouse) can both pass the `isRerolling` check because `handleReroll` closes over the stale value. `loadFeatured`'s `loadIdRef` guard makes the *result* safe (last-write-wins), so the visible effect is just two DB round-trips and an unnecessary double `setIsRerolling`. Not user-visible, but the guard could be a ref instead of state.

### 7. Loading spinner shows even when stats are ready but the featured card is still loading
**Location:** `Dashboard.tsx:140-147` — cosmetic only. The whole page waits on `stats`, but the featured image (a large file read from disk) loads independently afterwards; the hero card renders only when both are ready, so on slow disks there's a "Loading..." full-page state followed by a pop-in. The `useImageSource`-based cards fade in gracefully, but the hero doesn't show a skeleton — it appears abruptly with the Ken Burns animation starting immediately.

---

## Areas for Optimisation

### 1. Dead code: `DashboardStatCard.tsx` (entire component)
**Location:** `src/components/DashboardStatCard.tsx`

No file imports it (verified via `rg`). It also depends on `utils_ui.ts` (`cn` from `clsx`/`tailwind-merge`) — the only consumer in the Dashboard area. The CSS it maps to — `.stat-gradient-*` (`index.css:382-421`) and `.progress-glow-*` (`index.css:423-437`) — is used *only* by this dead component. The live dashboard uses entirely different classes (`.dashboard-stat*`). **Safe to delete:** the component, its CSS blocks, and the `cn` utility if nothing else uses it (check `Collections.tsx` which uses `card-shine` but not `cn`).

### 2. Dead CSS: `.dashboard-section-icon` sizing
**Location:** `index.css:2498-2500` — sets `font-size: 1.25rem` on a container that holds a lucide `<Clock>`/`<Hourglass>` SVG (size fixed by `size={20}` attribute). The `font-size` has no effect. Minor cleanup.

### 3. Over-fetching in `getRecentEntries()` / `getOnThisDayEntries()`
**Location:** `dashboard-stats.ts:80-97`

Both queries `SELECT *` full rows. Recent fetches 15 rows but the UI shows 6 (`slice(0, 6)`); On This Day fetches 12 and shows 6. For a media logger with thousands of rows this is cheap, but each row carries heavy columns (`description`, `notes`) that the dashboard never renders. Options:
- Reduce `LIMIT` to the number actually shown.
- Select only the columns `MediaListCard` needs (it uses `name`, `image_url`, `entry_type`, `genre`, `review_score`, `completion_date`, `is_platinum`, `is_early_access`, `is_rewatch`, `has_subtitles`, `early_access_version`, `id`, `year_completed`).

Note `MediaListCard` is typed against the full `MediaEntry`, so a partial projection would need a type adjustment.

### 4. Redundant `stats.most_productive_year` string formatting
**Location:** `dashboard-stats.ts:31-42` — `most_productive_year` is rendered as `"2024 (37)"`, a pre-formatted display string. The UI only renders it as-is (`Dashboard.tsx:308`). Fine, but the same data is computed independently by `review-logic.ts` (`getEntriesCountByYear`) and `stats-logic.ts` — four dashboard queries could be consolidated into a single SQL pass or reuse `review-logic`. Also, `average_rating` is formatted in the data layer (`avg.toFixed(1)`) *and* re-parsed in the UI (`Number.parseFloat(stats.average_rating)` at `Dashboard.tsx:149` for `AnimatedNumber`), which is a wasteful round-trip of string→float→string. Passing the number through would be cleaner.

### 5. `DashboardStats` computed as 4 sequential DB round-trips
**Location:** `dashboard-stats.ts:13-43`

`getStats()` runs 4 separate queries (total count, avg rating, top type, peak year), each with `adultExclusionSql()`. These could be batched into one `SELECT` with subqueries or run via `Promise.all` — `dbService.connect()` dedupes so the connection is shared. Also note the queries are not parameterised where `adultExclusionSql()` is spliced in — that's fine because it only interpolates a hard-coded constant list, but a single parameterised query would be both faster and cleaner.

### 6. Missing DB index for the dashboard's hot queries
**Location:** `migrations.ts` — only index in the schema is `idx_award_categories_year_template` (`migrations.ts:530`).

Dashboard queries filter/order on `completion_date` (recent + on-this-day) and `year_completed` + `entry_type` (stats). With large libraries, `ORDER BY completion_date DESC` and `GROUP BY year_completed` are full-table scans every mount. An index on `completion_date` (and/or `year_completed`) would make the dashboard and the On-This-Day `substr` scan materially faster. Worth considering in a future migration.

### 7. Double `window.matchMedia` pattern could be a shared hook
**Location:** `Dashboard.tsx:35-36`

The manual `prefersReducedMotion()` helper duplicates what framer-motion already provides via `useReducedMotion()`. Using the hook for the spin toggle too would remove the duplicate implementation (and make the reroll spin respect the setting consistently — see Bug #4).

### 8. `AnimatedNumber` restarts from 0 on every value change / remount
**Location:** `AnimatedNumber.tsx:14-32`

It always animates `from = 0`. On the dashboard this runs once on mount (nice), but if `stats` ever reloads (e.g. future entry-added listener) the number re-rolls from 0, which looks like a flicker. Also it uses `requestAnimationFrame` state updates without cleanup on `value` change mid-animation (the effect cleanup cancels the *previous* frame, which is correct, but a fast-changing value restarts from 0 each time). Minor, but animating from the previous displayed value would be strictly better.

### 9. `recentYear` fallback logic is convoluted
**Location:** `Dashboard.tsx:104-110`

```tsx
const fallbackYear = availableYears[availableYears.length - 1] || getCurrentYearString();
const recentWithYear = recentEntries.find(entry => entry.year_completed);
```

The "View All" link jumps to the *most recent entry's* year (or the last available year). This is a reasonable heuristic but it means: if the user's most recent completion was 2022, "View All" silently goes to 2022 even though the subtitle says "Your latest completions". The query already orders by `completion_date DESC`, so `recentEntries[0]?.year_completed` is equivalent to the `find()` — the extra scan is redundant. Also, if the most recent entry has a `completion_date` but a *null* `year_completed` (possible via imports), the fallback kicks in — fine, but worth noting the link target may surprise.

### 10. Featured-entry reroll does 2-3 DB queries each click
**Location:** `dashboard-stats.ts:45-78`

Each reroll does: count query → (maybe) fallback count → offset select. The `excludeId` fallback is a nice touch (never repeat the current entry) but for large pools the second count is rarely needed and the two-step is only to avoid `ORDER BY RANDOM()` (which was removed for performance per changelog — good call). This is acceptable; just noting the count-then-offset could be a single `SELECT ... LIMIT 1 OFFSET (abs(random()) % count)` trick, at the cost of correctness for near-empty pools. Current approach is the right trade-off; no change needed.

### 11. `releaseImageUrl(null)` called unconditionally on featured cleanup
**Location:** `Dashboard.tsx:70, 126` — `releaseImageUrl` already guards `!dbPath` (`utils.ts:78`), so the `featuredImagePathRef.current` null-checks on the *callers* are redundant defensive code. Harmless; could be simplified.

---

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
