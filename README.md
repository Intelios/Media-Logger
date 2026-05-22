<div align="center">
  <img
    width="220"
    alt="Media Logger logo"
    src="https://github.com/user-attachments/assets/4e542ada-8e0a-473d-abd3-83e985d505bb"
  />

  <h1>Media Logger 2</h1>

  <p><strong>A desktop-first media journal for people who want more than a watchlist.</strong></p>

  <p>
    Track what you finish, rate it, save artwork locally, organize it into curated collections,
    crown yearly winners, plan what's next with a backlog, and explore your library through
    filters, profiles, deep stats, and animated year-in-review slideshows.
  </p>

  <p>
    <code>Year View</code>
    <code>Search</code>
    <code>Stats</code>
    <code>Profiles</code>
    <code>Awards</code>
    <code>Collections</code>
    <code>Backlog</code>
    <code>Review</code>
  </p>
</div>

## Overview

Media Logger is the Tauri + React + TypeScript rebuild of the original Python/Flet app. It keeps the long-term collection mindset intact, adds a much richer interface, and stays forward-compatible with existing data and assets.

This app is built around completed media rather than a passive backlog. Every entry becomes part of a personal archive you can browse by year, search by metadata, group into collections, and revisit through analytics and awards. A guided onboarding flow gets new users set up on first launch.

## What You Can Track

Media Logger supports:

- `Movie`
- `Show`
- `Anime`
- `Book`
- `Album`
- `K-Drama`
- `Game`
- `Adult Visual Novel`
- `JAV`
- `Hentai`
- `Other`

Entries can include completion date, score, description, notes, local artwork, genre, and type-specific metadata like platform, franchise, series, author, artist, director/studio, or actress.

## Highlights

- A polished dashboard with a featured entry, recent completions, an "On This Day" section surfacing entries from previous years, quick navigation, and collection-wide summary cards.
- Year-based browsing with fast filtering for entry types, local copies, rewatches, and quick presets for gaming, general media, or adult content.
- Full-library search with advanced filters for type, platform, actress, director, author, franchise, and series.
- A customizable statistics dashboard built on a widget system with 20 drag-and-drop widgets across two view modes (Overview and Dashboard), including a completion heatmap, score trends, multi-log days, most replayed entries, and average score by type.
- Profile pages that turn repeated metadata into browsable hubs for studios, actresses, artists, authors, platforms, and franchises.
- Custom collections for building ranked lists, themed shelves, favorites, or any other hand-picked grouping with drag-and-drop reordering.
- A yearly awards system with reusable templates and winner history across years.
- A backlog for tracking what you plan to watch, play, or read next, with in-progress and planning statuses, type filtering, and one-click promotion to a completed entry.
- An animated year-in-review slideshow that generates themed slides for any year or month, covering top genres, perfect tens, biggest months, hidden gems, award winners, genre clouds, and more.
- Appearance controls with 12 color themes, light/dark mode, glass styling, rating display modes (pill or thermometer), and a personalized dashboard greeting.
- Keyboard shortcuts for fast navigation across all major areas.
- Local-first storage with SQLite, copied artwork assets, custom data directory support, and backup import/export in JSON or ZIP format.
- Built-in auto-updater for seamless version upgrades.

## Main Areas

| Area | What it does |
| --- | --- |
| Dashboard | Gives you a fast read on the library with totals, average rating, top content type, peak year, a featured pick, recent completions, and an "On This Day" section. |
| Year View | Lets you browse a single year as a focused shelf with quick presets and status filters. |
| Search | Searches the full collection and narrows results with stacked metadata filters. |
| Stats | A customizable widget dashboard with charts, heatmaps, genre drill-downs, scoring trends, monthly activity, and more. Widgets can be shown, hidden, and rearranged. |
| Profiles | Builds dedicated pages from recurring metadata so creators, performers, platforms, and franchises become navigable archives. |
| Awards | Lets you create yearly award categories, pick winners, and reuse award templates over time. |
| Collections | Creates custom shelves with drag-and-drop ordering for favorites, rankings, series rewatches, or themed picks. |
| Backlog | Tracks upcoming media in planning and in-progress lanes, with type filters and quick completion into the main library. |
| Review | Generates an animated year-in-review slideshow with themed slides, backdrop artwork, and preset filters for gaming, media, or adult content. |
| Settings | Manages color themes, display mode, display name, navigation years, backup import/export, and storage location. |

## Data and Compatibility

- Uses a local SQLite database named `jav_log.db`.
- Stores selected artwork inside an `assets/images` folder under the app data directory.
- Supports a custom data directory if you want to keep the database somewhere specific.
- Includes schema migrations for older installs, including legacy table compatibility and newer awards, profiles, collections, backlog, and series features.
- Supports full-library backup export and import through JSON or ZIP files (ZIP bundles artwork assets alongside data).
- Designed as a forward-compatible rebuild of the previous Python/Flet Media Logger.

## Tech Stack

- Tauri 2
- React 19
- TypeScript
- Vite
- Tailwind CSS
- SQLite via `@tauri-apps/plugin-sql`
- Recharts and D3 for analytics and visualizations
- dnd-kit for drag-and-drop
- Lucide for icons

## Development

### Requirements

- Node.js
- Rust
- Tauri system prerequisites for your operating system

### Run locally

```bash
npm install
npm run tauri dev
```

### Build

```bash
npm run build
npm run tauri build
```

If you treat finished media like a long-running personal archive instead of a disposable queue, Media Logger is built for that workflow.
