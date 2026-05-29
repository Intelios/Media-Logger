# Year View Open — Eliminate the Open/Filter Freeze

## Context

Opening a Year View (`/year/:year`) with many entries freezes the UI for **0.5–2s**, and the
stutter persists *even after filtering down*. This is a flagship target for the 3.0 upgrade.

Investigation pinned the freeze to **three stacked costs**, two of which are independent of how
filtered-down the year is (explaining the "still freezes when filtered" symptom):

1. **Whole-DB profile scan on every open.** `loadData` → `profilesLogic.getProfileKeys()` →
   `aggregateAllProfiles()` runs `SELECT * FROM entries` over the **entire** database and
   string-splits every row. Paid on every year open, every `loadData`, every mutation — regardless
   of year/filter. (`src/lib/profiles-logic.ts:14-85,152-155`)
2. **Sequential load waterfall.** `loadData` awaits entries → awards JOIN → the full profile scan
   before anything useful renders. (`src/pages/YearView.tsx:178-196`)
3. **Heavy render of 150–400 un-memoized cards.** Each `MediaCard` is a `motion.div` with a
   **permanent `will-change-transform`** (one compositor layer *per card*), no `React.memo`,
   unstable handler props, plus a `filteredEntries` state→`useEffect` round-trip that double-renders
   on load. (`src/pages/YearView.tsx:543-567`, `src/components/MediaCard.tsx:237-247`)

**Chosen approach (confirmed with user):** balanced, **no new dependency / no virtualization**
(big years are ~150–400 entries). Animations may be tuned. **Scope: YearView only.** Outcome: first
grid paint right after the year query, offscreen cards skipped, filter toggles interruptible, and the
profile scan cached away.

Note: `getEntriesByYear()` is already the right narrow query, but the current schema does not appear
to create an index on `entries.year_completed`. Do not claim/measure this as an indexed-query win
unless an explicit index migration is added separately.

Note: the 5 per-card modals are already conditionally rendered (`{open && createPortal(...)}`), so
they are **not** a hidden cost — leave them alone.

---

## Workstream A — Data layer

### A1. Cache `getProfileKeys()` (the single biggest win)
In `src/lib/profiles-logic.ts`:
- Add module-level `let profileKeysCache: Set<string> | null` and an in-flight
  `let profileKeysPromise: Promise<Set<string>> | null` (dedupe so the parallel `loadData` can't
  trigger two cold scans).
- The cache must respect the current Adult Media visibility setting because `aggregateAllProfiles()`
  uses `filterHiddenEntries()`. Either key/cache the result by `isAdultMediaEnabled()` or invalidate
  the profile-key cache when the existing adult visibility event fires; do not reuse a cache warmed
  under the opposite setting.
- Rewrite `getProfileKeys()` to return the cache for the current Adult Media visibility state if
  present, else the in-flight promise for that state, else run `profilesLogic.getAllProfiles()` once
  (reference `profilesLogic.` explicitly, not `this`, inside the async IIFE), store the Set, and
  clear the promise in `.finally`.
- Export `invalidateProfilesCache()` that nulls both.

**Invalidation — must avoid a circular import.** `db.ts` imports only Tauri/settings/media-config
(verified); `profiles-logic.ts` imports `db.ts`. Do **not** import `profiles-logic` into `db.ts`.
Instead:
- Add a tiny listener seam in `src/lib/db.ts`: `const mutationListeners: Array<() => void> = [];`
  + `export function onEntriesMutated(fn){ mutationListeners.push(fn); }`, and invoke all listeners
  at the end of `addEntry` (876), `updateEntry` (890), `deleteEntry` (906).
- In `profiles-logic.ts` (already importing `db.ts`), register `onEntriesMutated(invalidateProfilesCache)`
  at module load. Keeps imports one-directional.
- Also call `invalidateProfilesCache()` in-file at the end of `hideProfile`/`unhideProfile` (they
  change which keys `getAllProfiles` filters out).

### A2. Parallelize + progressively render `loadData` (`src/pages/YearView.tsx:178-196`)
- Add `const loadIdRef = useRef(0)`; at the top of `loadData` do `const myLoadId = ++loadIdRef.current`
  and guard **every** later `setState` with `if (loadIdRef.current !== myLoadId) return;` (kills stale
  writes on rapid A→B→A year switches / `adultEnabled` toggles).
- Kick off `getEntriesByYear(year)` and the (now cached) `getProfileKeys()` concurrently.
- `await` entries first → `setEntries(data)` → **grid paints now** (filtering becomes derived in B2,
  so no `applyFilter` call here anymore).
- Fire `getAwardsForMediaBatch(ids).then(setAwardsMap)` and `keysPromise.then(setProfileKeys)`
  **without blocking** — badges/profile links fill in a beat later (one extra memoized re-render each).
- `getAwardsForMediaBatch` (`src/lib/awards-logic.ts:178-199`) is already a single fast JOIN — just
  move it off the critical path.

---

## Workstream B — Rendering

### B1. `React.memo(MediaCard)` + stable handler props
- Wrap the named export: `export const MediaCard = React.memo(function MediaCard(...) {...})`.
- In `YearView`, wrap the three card handlers in `useCallback` (currently new refs each render →
  memo would be a no-op):
  - `handleEditFromCard` deps `[]`; `handleDuplicate` deps `[]`; `handleDelete` deps `[loadData]`.
- Prop stability is otherwise fine: `entry` refs are stable (filtering only *selects* existing
  objects), `awardsMap`/`profileKeys` each replace once → one all-card re-render (acceptable). The
  `awards = []` default param is safe — memo compares the incoming `undefined`, not the post-default.
- No custom `areEqual` comparator.

### B2. Derive + defer filtering (replaces state + effect)
In `src/pages/YearView.tsx`:
- **Remove** `filteredEntries` state (85), the `applyFilter` `useEffect` (216-218), and the
  `applyFilter(...)` call inside `loadData` (183).
- Turn `applyFilter` (278-305) into a **pure** `computeFiltered(...)` returning the array, preserving
  semantics exactly: `types.length === 0 ⇒ []` first; skip the type filter when
  `types.length === getVisibleEntryTypes().length`; then the localCopy/rewatch/subtitles passes
  (collapsing into one `.filter` is optional/minor).
- `const filteredEntries = useMemo(() => computeFiltered(entries, selectedTypes, localCopyFilter,
  rewatchFilter, subtitlesFilter), [entries, selectedTypes, localCopyFilter, rewatchFilter, subtitlesFilter])`.
- `const deferredEntries = useDeferredValue(filteredEntries)`; render the **grid from `deferredEntries`**
  (keeps toggles responsive/interruptible) but keep the header count (378) reading
  `filteredEntries.length` so the count updates instantly.
- Base the grid-vs-empty branch on `deferredEntries.length`, since that is the committed list being
  rendered. The header count should still use `filteredEntries.length`.
- Repoint the `scrollIntoView` highlight effect (268-275) to depend on **`deferredEntries`** (the
  highlighted DOM node only exists after the deferred grid commits); keep its 100ms timeout.

### B3. `content-visibility: auto` on grid-item wrappers
- Add a utility to `src/index.css`:
  ```css
  .cv-auto { content-visibility: auto; contain-intrinsic-size: auto 420px; }
  ```
  (~420px ≈ image `h-52` + body; `auto` lets the browser remember the real measured size.)
- Apply `cv-auto` to each `<div key={entry.id}>` wrapper (548-555) — skips layout/paint for offscreen
  cards and **pauses offscreen infinite glow animations** for free.
- **Exclude the highlighted card** from `cv-auto` (give it the ring/pulse class instead) so its real
  geometry exists when `scrollIntoView` runs.
- Do **not** add `overflow-hidden` to the wrapper — would clip the hover lift. On-screen items render
  normally, so the hover lift/glow overflow is unaffected.

---

## Workstream C — Animation tuning

### C1. Drop the permanent `will-change-transform`
- Remove `will-change-transform` from the base card `className` (`src/components/MediaCard.tsx:241`).
  It permanently promotes every card to its own compositor layer (150–400 layers); framer-motion
  already promotes during the hover animation, so hover is unchanged. Keep the `whileHover` spring.
- Glows need no further change (B3 pauses them offscreen; onscreen ones are few/cheap). If a rare
  first-hover hitch appears, add a hover-scoped `will-change` only — do not restore the permanent one.

---

## Ordered implementation sequence (each independently revertible & measurable)
1. **A1** profile-key cache + invalidation seam.
2. **A2** parallel/progressive `loadData` + `loadIdRef` stale guard.
3. **B1** `React.memo` + `useCallback` handlers.
4. **B2** derived `useMemo` + `useDeferredValue`, pure `computeFiltered`, scroll effect → `deferredEntries`.
5. **B3** `.cv-auto` utility + apply (exclude highlighted card).
6. **C1** remove permanent `will-change-transform`.

## Critical files
- `src/pages/YearView.tsx` — loadData, filtering, grid, handlers (A2, B1-callers, B2, B3)
- `src/lib/profiles-logic.ts` — cache + invalidation (A1)
- `src/lib/db.ts` — `onEntriesMutated` seam in add/update/deleteEntry (A1)
- `src/components/MediaCard.tsx` — React.memo, remove will-change (B1, C1)
- `src/index.css` — `.cv-auto` utility (B3)

## Risks / gotchas
- **No circular import:** invalidate via the `db.ts` listener seam + in-file hide/unhide calls — never import `profiles-logic` into `db.ts`.
- **Adult Media cache correctness:** `getProfileKeys()` cannot reuse a cache across Adult Media
  on/off states because hidden adult entries change the profile key set.
- **Stale setState** on fast year/adult switches → guard with `loadIdRef`.
- **memo is a no-op** unless the three handlers are `useCallback`.
- **Preserve filter semantics:** empty-selection ⇒ nothing; all-visible-selected ⇒ skip type filter.
- **Deferred empty state:** render the grid/empty branch from `deferredEntries`, not the eager
  `filteredEntries`, while keeping the visible count eager.
- **scrollIntoView vs content-visibility:** exclude highlighted card from `cv-auto`; scroll effect keys off `deferredEntries`.
- **In-flight dedupe** on `getProfileKeys` so the parallel load can't double-scan on the cold path.

## Verification (test with a real ~300-entry year incl. perfect-10/platinum cards)
- **DevTools Performance:** record navigation into the year. Confirm the long task drops from
  0.5–2s to sub-~100ms blocking; first grid paint right after `getEntriesByYear`; the
  `aggregateAllProfiles`/`SELECT * FROM entries` block disappears on the 2nd visit (cache hit) and
  reappears exactly once after add/edit/delete or hide/unhide. Layers panel: layer count ∝ visible
  cards, not total cards (validates C1).
- **React DevTools Profiler:** filter toggles re-render only cards whose membership changed (not all
  300); no double-commit on load (validates B2); awards/keys arrival = one all-card re-render each.
- **Functional regressions:** filter chips/presets/status filters/empty/all-selected match prior
  results; featured-entry highlight (`?highlight=<id>&type=<t>`) shows ring+pulse and scrolls to
  center; hover lift/glow visually unchanged; fast scroll fills cards in immediately (no persistent
  blanks); rapid A→B→A year switching shows no wrong-year awards/keys.
- **Build check:** `npm run build` (tsc) passes.
