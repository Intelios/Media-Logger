import { openUrl } from '@tauri-apps/plugin-opener';

// A bare title is often ambiguous ("Dark", "Control"), so the entry type is
// appended as a plain-language hint.
const TYPE_HINTS: Record<string, string> = {
  Movie: 'film',
  Show: 'TV series',
  'K-Drama': 'K-drama',
  Anime: 'anime',
  Game: 'video game',
  Book: 'book',
  Album: 'album',
};

/**
 * Opens the default browser on a Google search for a title. The capability
 * only allows `https://www.google.com/search*`, so keep the URL on that path.
 */
export function openWebSearch(name: string, entryType: string): Promise<void> {
  const hint = TYPE_HINTS[entryType] ?? entryType;
  const query = [name.trim(), hint].filter(Boolean).join(' ');
  return openUrl(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
}
