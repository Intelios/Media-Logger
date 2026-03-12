# Modular Stats Roadmap

## Purpose

This document is the working roadmap for turning the current Stats page into a modular, customizable desktop dashboard.

It is meant to stay practical and implementation-focused so we can reference it while building.

## Project Goal

Redesign the current Stats page so it:

- Keeps the existing premium visual style
- Feels intentionally designed as a dashboard, not a page with optional sections
- Supports modular widgets
- Lets the user control what is shown
- Supports reordering and hiding widgets
- Makes it easy to add more stats, charts, and drilldowns over time

## Scope

In scope:

- Desktop-only dashboard redesign
- Widget-based layout system
- Visibility, order, and layout preferences
- Refactoring the current Stats page into reusable parts
- Adding a cleaner data layer for future stats growth

Out of scope for the first pass:

- Mobile layouts
- Full database redesign
- Cross-device sync for widget layout preferences
- Rebuilding unrelated areas of the app

## Current State Summary

Right now the Stats page works, but it is still mostly a single composed screen with hardcoded sections.

That is fine for a curated analytics page, but it will become harder to extend once we start adding many more stat options.

The main opportunities are:

- Break the page into widgets
- Create a consistent widget shell
- Add a real dashboard grid
- Separate page layout from stat calculation
- Make customization a first-class feature

## Success Criteria

The redesign is successful when:

- The Stats page still looks polished by default
- Each stat module can be added, hidden, or reordered intentionally
- The page does not feel like random floating cards
- Adding a new widget is straightforward
- Widget preferences persist
- Existing stats are preserved during migration
- The code is easier to maintain than the current page

## Guiding Principles

- Keep the current visual identity, change the structure underneath
- Build a strong default layout first
- Treat customization as a mode, not constant UI noise
- Prefer incremental refactors over a big-bang rewrite
- Avoid mixing layout refactor and database overhaul in the same step
- Make future widgets cheap to add

## Phase 0 Status

Phase 0 is now decision-complete.

That means the baseline product and implementation rules for the modular dashboard are locked enough for us to begin Phase 1.

## Phase 0 Decisions

### 1. Dashboard Structure

The Stats page will be split into two layout zones:

- `Summary ribbon`: compact top-row stat widgets
- `Main canvas`: chart and list widgets in a structured dashboard grid

This is an intentional design choice.

It keeps the page feeling curated and premium instead of turning everything into one uniform pile of draggable cards.

### 2. Global Controls

The following controls remain fixed at the top of the page and are not treated as widgets:

- Page title and subtitle
- Content type filter
- Preset chips
- Year filter
- Customize mode toggle

These are page controls, not dashboard content.

### 3. Layout Model

The dashboard will use a structured 12-column desktop grid for the main canvas.

Widget sizing for v1:

- `summary`: top ribbon stat tile
- `small`: 4-column widget
- `half`: 6-column widget
- `full`: 12-column widget

Important v1 rule:

- Users can reorder and hide widgets in v1
- Users cannot freely resize widgets in v1
- Widget sizes are defined by the registry in v1

This keeps the first modular version focused, polished, and much easier to ship safely.

### 4. Customization Model

Customization will be a dedicated mode, not always-on chrome.

Normal mode:

- Clean dashboard view
- No visible drag handles
- Widget menus stay subtle
- Drilldowns and chart interactions work normally

Customize mode:

- Drag handles become visible
- Hide and restore controls become visible
- Reordering becomes active
- Widget interactions that conflict with layout editing should be suppressed
- A widget library panel or picker is available for hidden widgets
- Reset-to-default is available

### 5. Widget Empty State Rule

Visible widgets should not disappear just because the current filters return no data.

Instead, they should render a graceful empty state.

This keeps the dashboard layout stable and prevents the page from jumping around when filters change.

### 6. Persistence Model

V1 persistence decisions:

- Keep the existing stats filter persistence behavior
- Store modular dashboard layout preferences in `localStorage`
- Use a versioned dashboard layout payload so we can migrate later if needed

Proposed storage shape for v1:

```json
{
  "version": 1,
  "summaryOrder": [
    "total-entries",
    "average-score",
    "rewatches",
    "perfect-tens",
    "this-month",
    "genres-count"
  ],
  "mainOrder": [
    "monthly-activity",
    "rating-distribution",
    "top-genres",
    "content-type-breakdown",
    "platforms",
    "franchises",
    "studios",
    "authors",
    "actresses"
  ],
  "hidden": []
}
```

Suggested key:

- `stats-dashboard-layout-v1`

### 7. Registry Model

The modular page will be driven by a widget registry.

Each widget definition should include:

- `id`
- `zone`
- `title`
- `description`
- `defaultSize`
- `defaultVisible`
- `defaultOrder`
- `component`
- `supportsEmptyState`

For v1, we will keep the registry simple and deterministic.

We are not doing freeform x/y placement in the first version.

### 8. V1 Scope Boundary

The first modular release will support:

- Strong default dashboard layout
- Widget-based architecture
- Hide/show widgets
- Reorder widgets
- Persisted layout preferences
- Existing stats migrated into the new system

The first modular release will not support:

- Arbitrary widget resizing
- Freeform drag placement
- Per-widget filter controls
- Database-backed layout sync

## Phase 0 Widget Inventory

### Summary Ribbon Widgets

- `total-entries`
- `average-score`
- `rewatches`
- `perfect-tens`
- `this-month`
- `genres-count`

### Main Canvas Widgets

- `monthly-activity`
- `rating-distribution`
- `top-genres`
- `content-type-breakdown`
- `platforms`
- `franchises`
- `studios`
- `authors`
- `actresses`

## Phase 0 Default Layout

### Summary Ribbon Default Order

1. `total-entries`
2. `average-score`
3. `rewatches`
4. `perfect-tens`
5. `this-month`
6. `genres-count`

### Main Canvas Default Order

1. `monthly-activity` as `full`
2. `rating-distribution` as `half`
3. `top-genres` as `half`
4. `content-type-breakdown` as `full`
5. `platforms` as `half`
6. `franchises` as `half`
7. `studios` as `half`
8. `authors` as `half`
9. `actresses` as `half`

## Phase 0 Delivery Checklist

- [x] Chosen a desktop-only dashboard structure
- [x] Chosen fixed page controls
- [x] Chosen widget zones
- [x] Chosen the v1 layout model
- [x] Chosen the v1 customization model
- [x] Chosen the persistence model
- [x] Chosen the widget inventory for migration
- [x] Chosen the default widget order
- [x] Chosen the v1 scope boundary

## Implementation Phases

### Phase 0: Baseline and Design Rules

Goal: lock the system before touching too much code.

Tasks:

- Audit the current Stats page and list every existing stat section
- Define widget sizes for the dashboard system
- Define a shared widget shell pattern
- Define view mode vs customize mode behavior
- Decide which preferences live in `localStorage` for v1
- Decide the default layout for the first modular version

Deliverables:

- Widget inventory
- Layout rules
- Dashboard interaction rules

Status:

- Complete

### Phase 1: Extract the Stats UI Foundation

Goal: stop treating the Stats page as one large component.

Tasks:

- Split the current Stats page into smaller presentational components
- Create a dedicated stats widget folder structure
- Move common card chrome into a reusable widget shell component
- Centralize widget titles, descriptions, and identifiers
- Keep the current functionality working while structure changes underneath

Suggested structure:

```text
src/components/stats/
  StatsWidgetShell.tsx
  StatsWidgetGrid.tsx
  StatsCustomizePanel.tsx
  widgets/
    OverviewWidget.tsx
    MonthlyActivityWidget.tsx
    RatingDistributionWidget.tsx
    TopGenresWidget.tsx
    ContentTypesWidget.tsx
    PlatformsWidget.tsx
    FranchisesWidget.tsx
    StudiosWidget.tsx
    AuthorsWidget.tsx
    ActressesWidget.tsx
```

### Phase 2: Introduce a Widget Registry

Goal: make layout driven by configuration, not hardcoded JSX order.

Tasks:

- Create a widget registry with IDs and metadata
- Define widget size, title, default visibility, and placement metadata
- Register every initial widget in one place
- Render the page from registry data rather than manual section composition

Each widget definition should eventually support:

- `id`
- `title`
- `description`
- `size`
- `defaultVisible`
- `defaultOrder`
- `component`
- `supportedFilters`

### Phase 3: Build the Dashboard Layout System

Goal: make the page feel like a true dashboard.

Tasks:

- Replace the current fixed section stacking with a dashboard grid
- Support a clear set of widget widths and heights
- Keep spacing, card treatment, and hierarchy consistent
- Preserve a curated default layout
- Make sure the layout still feels intentional before customization is added

Rules for v1:

- Use a structured grid, not a chaotic masonry layout
- Limit widget size options to a small set
- Keep large trend widgets near the top
- Keep summary widgets grouped together

### Phase 4: Migrate Existing Stats into Widgets

Goal: move current functionality into the new system without losing features.

Widgets to migrate first:

- Overview stat cards
- Monthly Activity
- Rating Distribution
- Top Genres
- Content Type Breakdown
- Platforms
- Franchises
- Studios
- Authors
- Actresses

Migration rule:

- Only migrate one widget at a time and verify it matches the old page behavior before moving to the next

### Phase 5: Add Customization Mode

Goal: let the user control the dashboard intentionally.

Tasks:

- Add a `Customize` mode toggle
- Show reorder controls only inside customize mode
- Allow hide/show per widget
- Add a widget picker or side panel for hidden widgets
- Persist widget order and visibility
- Support reset-to-default layout

V1 preference storage:

- Use `localStorage`

Possible future upgrade:

- Move layout preferences into app settings or DB-backed storage if needed

### Phase 6: Refactor the Data Layer

Goal: make the stats backend scale with more widgets.

Tasks:

- Reduce reliance on one large `getStats()` response object
- Split stat generation into focused selectors or widget-oriented data functions
- Reuse shared aggregation helpers where that still makes sense
- Avoid unnecessary recalculation if multiple widgets depend on the same filtered dataset
- Keep drilldown queries separate from summary queries where useful

Important note:

The current schema is fine for this dashboard refactor, but some fields are still text-based and loosely structured. That is acceptable for v1, but deeper analytics may eventually benefit from more normalized data.

### Phase 7: Add New Widgets Carefully

Goal: expand the page without turning it into clutter.

Possible future widgets:

- Completion Calendar
- Score Trend
- Best Month
- Most Rewatched Period
- Average Score by Type
- Top Platforms by Score
- Genre Trend Over Time
- Completion Pace
- Milestones and records
- Personalized highlight widgets

Rule:

- New widgets should only be added if they are clearly useful or visually distinct

### Phase 8: Polish, QA, and Hardening

Goal: make the modular system feel solid.

Tasks:

- Verify empty states for sparse libraries
- Verify hover, loading, and no-data states
- Check scroll behavior and overflow in widget containers
- Check desktop responsiveness for different window widths
- Test persistence and reset flows
- Verify old interactions like drilldowns and modals still work
- Run build verification before closing the feature

## Risks

Main risks:

- The dashboard becomes visually messy if widget sizing rules are too loose
- The page feels bolted on if customization is layered onto the old layout
- The data layer becomes harder to maintain if new widgets keep extending one giant stats object
- Performance can degrade if every widget recalculates heavy stats independently
- The feature can sprawl if we try to redesign layout, add many widgets, and rework the database at the same time

## Guardrails

- No big-bang rewrite
- Keep the existing Stats page working until replacement pieces are ready
- Preserve the default layout quality before enabling heavy customization
- Prefer shipping a smaller polished widget system over a large messy one
- Keep widget controls hidden outside customize mode
- Treat the roadmap as a living document and update it when implementation decisions change

## Build Order

Recommended order of execution:

1. Define widget system rules
2. Extract widget shell and shared layout pieces
3. Migrate existing widgets into the new grid
4. Add customize mode and persistence
5. Refactor the data layer for scale
6. Add new widgets gradually
7. Polish and verify

## Definition of Done for V1

V1 is complete when:

- The Stats page uses a widget-driven layout
- Existing stats are represented as widgets
- The user can reorder and hide widgets
- Widget layout preferences persist
- The page still looks curated by default
- The codebase is in a better state than the original page

## Notes

- This roadmap is for the desktop app only
- We should update this document as decisions become concrete
- We should keep implementation tied to real milestones instead of speculative ideas
