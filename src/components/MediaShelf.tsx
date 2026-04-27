import type { MediaEntry } from "../lib/db";
import { ShelfItem } from "./ShelfItem";

interface MediaShelfProps {
  entries: MediaEntry[];
  onItemClick?: (entry: MediaEntry) => void;
}

/** Deterministic pseudo-random rotation from entry ID so items feel hand-placed. */
function getRotation(id: number | undefined): number {
  if (!id) return 0;
  // Simple LCG-like hash to get a stable value per ID
  const seed = (id * 9301 + 49297) % 233280;
  const norm = seed / 233280;
  return Math.round((norm * 3 - 1.5) * 10) / 10;
}

export function MediaShelf({ entries, onItemClick }: MediaShelfProps) {
  if (entries.length === 0) {
    return (
      <div className="media-shelf media-shelf-empty">
        <div className="media-shelf-track" />
        <div className="media-shelf-surface" />
        <p className="media-shelf-empty-text">No recent completions</p>
      </div>
    );
  }

  return (
    <div className="media-shelf">
      <div className="media-shelf-track">
        {entries.map((entry, i) => (
          <div
            key={entry.id}
            className="shelf-item-wrapper"
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            <ShelfItem
              entry={entry}
              rotation={getRotation(entry.id)}
              onClick={onItemClick}
            />
          </div>
        ))}
      </div>
      <div className="media-shelf-surface" />
    </div>
  );
}
