import type { ReactNode } from "react";
import { Book, Film, Gamepad, Gamepad2, Heart, Music, Sparkles, Star, Tag, type LucideIcon } from "lucide-react";

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
    gradient: "from-green-500 to-emerald-600",
  },
  media: {
    key: "media",
    label: "Media",
    icon: Film,
    types: ["K-Drama", "Anime", "Show", "Movie", "Book", "Album"],
    gradient: "from-blue-500 to-purple-600",
  },
  adult: {
    key: "adult",
    label: "Adult",
    icon: Heart,
    types: ["JAV", "Hentai", "Adult Visual Novel"],
    gradient: "from-pink-500 to-rose-600",
  },
};
