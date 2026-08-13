<div align="center">
  <img
    width="220"
    alt="Media Logger logo"
    src="https://github.com/user-attachments/assets/4e542ada-8e0a-473d-abd3-83e985d505bb"
  />

  <h1>Media Logger 4</h1>

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

---

## Why Media Logger

Watchlists end the moment you hit *finish*. Media Logger is built the other way around: it treats
finished media as a personal archive that grows more interesting the longer you keep it.

Every entry becomes part of a library you can browse by year, search by metadata, group into
collections, and revisit through analytics and awards — all stored **locally on your machine** in
a SQLite database, artwork included. No account, no cloud, no ads.

## What You Can Track

`Movie` · `Show` · `Anime` · `Book` · `Album` · `K-Drama` · `Game` · `Other` — plus adult categories
(JAV, Hentai, Adult Visual Novel) that hide completely behind a single setting.

Entries can carry a completion date, score, description, notes, local artwork, genres, and
type-specific metadata like platform, franchise, series, author, artist, or director/studio.

## Highlights

- **Dashboard** — a fast read on your library: totals, average rating, a featured pick, recent
  completions, and an "On This Day" section that resurfaces what you finished in years past.
- **Year View** — browse any year as a focused shelf, with quick presets for Gaming, Media, and
  Adult content, plus filters for local copies and rewatches.
- **Search** — the whole collection, filtered by type, platform, actress, director, author,
  franchise, and series at once.
- **Stats** — a customizable widget dashboard with charts, a completion heatmap, score trends,
  multi-log days, most-replayed timelines, top genres, and average score by type. Show, hide,
  and rearrange widgets to fit how you think.
- **Profiles** — recurring metadata becomes navigable hubs for studios, actresses, artists,
  authors, platforms, and franchises.
- **Collections** — hand-picked shelves with drag-and-drop ordering, plus named *Eras* to
  visually group items within a collection.
- **Awards** — yearly award categories with reusable templates and a winner history across years.
- **Backlog** — planning and in-progress lanes for what's next, with type filters, drag-and-drop
  reordering, and one-click promotion to a completed entry.
- **Review** — an animated year-in-review slideshow with themed slides for any year or month:
  top genres, perfect tens, hidden gems, award winners, and more.
- **Appearance** — multiple color themes, glass styling, and rating displays that read as pills
  or thermometers. ⌘1–⌘9 jump straight to any area.

## Local-First, Always

- SQLite database + locally copied artwork — your archive lives on your disk, not a server.
- Automatic migration from the legacy 2.x database (`jav_log.db`), original kept as a backup.
- Full backup export/import as JSON or ZIP (ZIP bundles the artwork too).
- Optional custom data directory.

## AI Access (Local MCP)

Media Logger can expose a small, read-only [MCP](https://modelcontextprotocol.io/) server to AI
clients on the same computer — Codex, VS Code, OpenCode. Disabled by default; enabled from
**Settings → AI Access**.

- Binds to `127.0.0.1` only, with a per-client bearer token. No outbound network requests.
- Personal notes, image paths, and ownership flags are never queried or returned.
- Tools can search, inspect, summarize, and list your backlog — never add, edit, or delete.
- Adult entries require both the app-wide Adult Media setting and a separate MCP opt-in.

For OpenCode, merge the generated `mcp` object into `~/.config/opencode/opencode.json`, restart
OpenCode, and verify with `opencode mcp list`. The client will report the app unavailable while
Media Logger is closed or AI Access is off — there is no background service.

## Tech Stack

Tauri 2 · React 19 · TypeScript · Vite · Tailwind CSS · SQLite · Recharts · d3-force · dnd-kit · Framer Motion · Lucide

## Development

Built on macOS, targeting desktop only.

**Requirements:** Node.js, Rust, and [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri:dev     # isolated development app and test data
npm run tauri build   # production bundle
```

---

If you treat finished media like a long-running personal archive instead of a disposable queue,
Media Logger is built for that workflow.
