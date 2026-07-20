import { useEffect, useState, type ReactNode } from "react";
import { Book, Film, Gamepad, Gamepad2, Heart, Music, Sparkles, Star, Tag, type LucideIcon } from "lucide-react";
import { isAdultMediaEnabled, ADULT_MEDIA_VISIBILITY_CHANGED_EVENT } from "./settings";

export const ENTRY_TYPES: string[] = [
  "Movie",
  "Show",
  "Anime",
  "Book",
  "Album",
  "K-Drama",
  "JAV",
  "Hentai",
  "Game",
  "Adult Visual Novel",
  "Other",
];

export const ENTRY_TYPE_OPTIONS: { value: string; icon: ReactNode }[] = [
  { value: "Movie", icon: <Film size={14} /> },
  { value: "Show", icon: <Film size={14} /> },
  { value: "Anime", icon: <Sparkles size={14} /> },
  { value: "Book", icon: <Book size={14} /> },
  { value: "Album", icon: <Music size={14} /> },
  { value: "K-Drama", icon: <Film size={14} /> },
  { value: "JAV", icon: <Star size={14} /> },
  { value: "Hentai", icon: <Star size={14} /> },
  { value: "Game", icon: <Gamepad size={14} /> },
  { value: "Adult Visual Novel", icon: <Gamepad size={14} /> },
  { value: "Other", icon: <Tag size={14} /> },
];

export type FilterPresetKey = "gaming" | "media" | "adult";
export type ActiveFilterPresetKey = FilterPresetKey | null;

export interface MediaFilterPreset {
  key: FilterPresetKey;
  label: string;
  icon: LucideIcon;
  types: string[];
  gradient: string;
}

export const FILTER_PRESET_KEYS: FilterPresetKey[] = ["gaming", "media", "adult"];

export const FILTER_PRESETS: Record<FilterPresetKey, MediaFilterPreset> = {
  gaming: {
    key: "gaming",
    label: "Gaming",
    icon: Gamepad2,
    types: ["Game"],
    gradient: "from-purple-500 to-indigo-600",
  },
  media: {
    key: "media",
    label: "Media",
    icon: Film,
    types: ["K-Drama", "Anime", "Show", "Movie", "Book", "Album"],
    gradient: "from-blue-500 via-cyan-500 to-amber-500",
  },
  adult: {
    key: "adult",
    label: "Adult",
    icon: Heart,
    types: ["JAV", "Hentai", "Adult Visual Novel"],
    gradient: "from-pink-500 to-rose-600",
  },
};

// The media types considered "adult". These remain in the canonical lists above
// (so existing entries still render and persisted filters still validate), but
// are filtered out of the UI option lists and data fetches when the Adult Media
// setting is turned off. Mirrors FILTER_PRESETS.adult.types.
export const ADULT_ENTRY_TYPES: string[] = ["JAV", "Hentai", "Adult Visual Novel"];
const ADULT_ENTRY_TYPE_SET = new Set(ADULT_ENTRY_TYPES);

export function isAdultType(type: string | null | undefined): boolean {
  return type != null && ADULT_ENTRY_TYPE_SET.has(type);
}

/**
 * The entry types that should be offered in pickers/filters right now. Functions
 * (not constants) so they re-evaluate per render and respond to the setting.
 */
export function getVisibleEntryTypes(): string[] {
  return isAdultMediaEnabled() ? ENTRY_TYPES : ENTRY_TYPES.filter((t) => !isAdultType(t));
}

export function getVisibleEntryTypeOptions(): { value: string; icon: ReactNode }[] {
  return isAdultMediaEnabled()
    ? ENTRY_TYPE_OPTIONS
    : ENTRY_TYPE_OPTIONS.filter((o) => !isAdultType(o.value));
}

export function getVisiblePresetKeys(): FilterPresetKey[] {
  return isAdultMediaEnabled()
    ? FILTER_PRESET_KEYS
    : FILTER_PRESET_KEYS.filter((k) => k !== "adult");
}

/**
 * Reactive subscription to the Adult Media setting. Re-renders the consuming
 * component when the toggle changes (same tab via the custom event, other
 * windows via the storage event) so views update without an app restart.
 */
export function useAdultMediaEnabled(): boolean {
  const [enabled, setEnabled] = useState(isAdultMediaEnabled);

  useEffect(() => {
    const handler = () => setEnabled(isAdultMediaEnabled());
    window.addEventListener(ADULT_MEDIA_VISIBILITY_CHANGED_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(ADULT_MEDIA_VISIBILITY_CHANGED_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  return enabled;
}
