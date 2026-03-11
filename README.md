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
    crown yearly winners, and explore your library through filters, profiles, and deep stats.
  </p>

  <p>
    <code>Year View</code>
    <code>Search</code>
    <code>Stats</code>
    <code>Profiles</code>
    <code>Awards</code>
    <code>Collections</code>
  </p>
</div>

## Overview

Media Logger is the Tauri + React + TypeScript rebuild of the original Python/Flet app. It keeps the long-term collection mindset intact, adds a much richer interface, and stays forward-compatible with existing data and assets.

This app is built around completed media rather than a passive backlog. Every entry becomes part of a personal archive you can browse by year, search by metadata, group into collections, and revisit through analytics and awards.

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

Entries can include completion date, score, description, notes, local artwork, genre, and type-specific metadata like platform, franchise, author, artist, director/studio, or actress.

## Highlights

- A polished dashboard with a featured entry, recent completions, quick navigation, and collection-wide summary cards.
- Year-based browsing with fast filtering for entry types, local copies, rewatches, and quick presets for gaming, general media, or adult content.
- Full-library search with advanced filters for type, platform, actress, director, author, and franchise.
- A statistics view with charts, genre drill-downs, perfect-score lists, monthly activity, and year-aware analytics.
- Profile pages that turn repeated metadata into browsable hubs for studios, actresses, artists, authors, platforms, and franchises.
- Custom collections for building ranked lists, themed shelves, favorites, or any other hand-picked grouping.
- A yearly awards system with reusable templates and winner history across years.
- Appearance controls for light/dark mode, color themes, glass styling, and a personalized dashboard greeting.
- Local-first storage with SQLite, copied artwork assets, custom data directory support, and backup import/export.

## Main Areas

| Area | What it does |
| --- | --- |
| Dashboard | Gives you a fast read on the library with totals, average rating, top content type, peak year, a featured pick, and recent completions. |
| Year View | Lets you browse a single year as a focused shelf with quick presets and status filters. |
| Search | Searches the full collection and narrows results with stacked metadata filters. |
| Stats | Turns the library into charts and drill-downs for genres, scoring trends, monthly activity, and more. |
| Profiles | Builds dedicated pages from recurring metadata so creators, performers, platforms, and franchises become navigable archives. |
| Awards | Lets you create yearly award categories, pick winners, and reuse award templates over time. |
| Collections | Creates custom shelves with manual ordering for favorites, rankings, series rewatches, or themed picks. |
| Settings | Manages themes, display name, navigation years, backup import/export, and storage location. |

## Data and Compatibility

- Uses a local SQLite database named `jav_log.db`.
- Stores selected artwork inside an `assets/images` folder under the app data directory.
- Supports a custom data directory if you want to keep the database somewhere specific.
- Includes schema migrations for older installs, including legacy table compatibility and newer awards, profiles, and collections features.
- Supports full-library backup export and import through JSON files.
- Designed as a forward-compatible rebuild of the previous Python/Flet Media Logger.

## Tech Stack

- Tauri 2
- React 19
- TypeScript
- Vite
- Tailwind CSS
- SQLite via `@tauri-apps/plugin-sql`
- Recharts for analytics

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
