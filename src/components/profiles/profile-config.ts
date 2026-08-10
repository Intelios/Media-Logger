import {
  BookOpen,
  Clapperboard,
  Gamepad2,
  Music,
  Sparkles,
  Tv,
  type LucideIcon,
} from 'lucide-react';
import { getProfileKey, type ProfileIdentity, type ProfileType } from '../../lib/profiles-logic';

export interface ProfileTypeConfig {
  key: ProfileType;
  label: string;
  icon: LucideIcon;
  gradient: string;
  color: string;
  bgGradient: string;
  overlayGradient: string;
  placeholderGradient: string;
  badgeGradient: string;
  badgeShadow: string;
  borderColor: string;
  ringColor: string;
  shadowColor: string;
  bgIconColor: string;
  iconColor: string;
  barGradient: string;
  dividerGradient: string;
  accentColor: string;
  surfaceTintClass: string;
  railColor: string;
}

export const PROFILE_TYPE_CONFIGS: ProfileTypeConfig[] = [
  {
    key: 'director', label: 'Studio', icon: Clapperboard,
    gradient: 'from-blue-500 to-cyan-600', color: 'text-blue-400',
    bgGradient: 'from-blue-600/30 via-cyan-600/20 to-blue-600/30',
    overlayGradient: 'from-blue-500/10 to-cyan-500/10',
    placeholderGradient: 'from-blue-600 to-cyan-600',
    badgeGradient: 'from-blue-500 to-cyan-600', badgeShadow: 'shadow-blue-500/25',
    borderColor: 'border-blue-500/30', ringColor: 'ring-blue-500/10',
    shadowColor: 'shadow-blue-500/20', bgIconColor: 'bg-blue-500/10',
    iconColor: 'text-blue-400', barGradient: 'from-blue-500 to-cyan-500',
    dividerGradient: 'to-blue-500/20', accentColor: 'text-blue-400/60',
    surfaceTintClass: 'from-blue-500/12 to-cyan-500/6', railColor: 'bg-blue-500/30',
  },
  {
    key: 'actress', label: 'Actress', icon: Sparkles,
    gradient: 'from-pink-500 to-rose-600', color: 'text-pink-400',
    bgGradient: 'from-rose-600/30 via-pink-600/20 to-purple-600/30',
    overlayGradient: 'from-rose-500/10 to-pink-500/10',
    placeholderGradient: 'from-rose-600 to-pink-600',
    badgeGradient: 'from-rose-500 to-pink-600', badgeShadow: 'shadow-rose-500/25',
    borderColor: 'border-rose-500/30', ringColor: 'ring-rose-500/10',
    shadowColor: 'shadow-rose-500/20', bgIconColor: 'bg-rose-500/10',
    iconColor: 'text-rose-400', barGradient: 'from-rose-500 to-pink-500',
    dividerGradient: 'to-rose-500/20', accentColor: 'text-rose-400/60',
    surfaceTintClass: 'from-rose-500/12 to-pink-500/6', railColor: 'bg-rose-500/30',
  },
  {
    key: 'artist', label: 'Artist', icon: Music,
    gradient: 'from-purple-500 to-violet-600', color: 'text-purple-400',
    bgGradient: 'from-purple-600/30 via-violet-600/20 to-purple-600/30',
    overlayGradient: 'from-purple-500/10 to-violet-500/10',
    placeholderGradient: 'from-purple-600 to-violet-600',
    badgeGradient: 'from-purple-500 to-violet-600', badgeShadow: 'shadow-purple-500/25',
    borderColor: 'border-purple-500/30', ringColor: 'ring-purple-500/10',
    shadowColor: 'shadow-purple-500/20', bgIconColor: 'bg-purple-500/10',
    iconColor: 'text-purple-400', barGradient: 'from-purple-500 to-violet-500',
    dividerGradient: 'to-purple-500/20', accentColor: 'text-purple-400/60',
    surfaceTintClass: 'from-purple-500/12 to-violet-500/6', railColor: 'bg-purple-500/30',
  },
  {
    key: 'author', label: 'Author', icon: BookOpen,
    gradient: 'from-amber-500 to-orange-600', color: 'text-amber-400',
    bgGradient: 'from-amber-600/30 via-orange-600/20 to-amber-600/30',
    overlayGradient: 'from-amber-500/10 to-orange-500/10',
    placeholderGradient: 'from-amber-600 to-orange-600',
    badgeGradient: 'from-amber-500 to-orange-600', badgeShadow: 'shadow-amber-500/25',
    borderColor: 'border-amber-500/30', ringColor: 'ring-amber-500/10',
    shadowColor: 'shadow-amber-500/20', bgIconColor: 'bg-amber-500/10',
    iconColor: 'text-amber-400', barGradient: 'from-amber-500 to-orange-500',
    dividerGradient: 'to-amber-500/20', accentColor: 'text-amber-400/60',
    surfaceTintClass: 'from-amber-500/12 to-orange-500/6', railColor: 'bg-amber-500/30',
  },
  {
    key: 'platform', label: 'Platform', icon: Gamepad2,
    gradient: 'from-green-500 to-emerald-600', color: 'text-green-400',
    bgGradient: 'from-green-600/30 via-emerald-600/20 to-green-600/30',
    overlayGradient: 'from-green-500/10 to-emerald-500/10',
    placeholderGradient: 'from-green-600 to-emerald-600',
    badgeGradient: 'from-green-500 to-emerald-600', badgeShadow: 'shadow-green-500/25',
    borderColor: 'border-green-500/30', ringColor: 'ring-green-500/10',
    shadowColor: 'shadow-green-500/20', bgIconColor: 'bg-green-500/10',
    iconColor: 'text-green-400', barGradient: 'from-green-500 to-emerald-500',
    dividerGradient: 'to-green-500/20', accentColor: 'text-green-400/60',
    surfaceTintClass: 'from-green-500/12 to-emerald-500/6', railColor: 'bg-green-500/30',
  },
  {
    key: 'franchise', label: 'Franchise', icon: Gamepad2,
    gradient: 'from-indigo-500 to-purple-600', color: 'text-indigo-400',
    bgGradient: 'from-indigo-600/30 via-purple-600/20 to-indigo-600/30',
    overlayGradient: 'from-indigo-500/10 to-purple-500/10',
    placeholderGradient: 'from-indigo-600 to-purple-600',
    badgeGradient: 'from-indigo-500 to-purple-600', badgeShadow: 'shadow-indigo-500/25',
    borderColor: 'border-indigo-500/30', ringColor: 'ring-indigo-500/10',
    shadowColor: 'shadow-indigo-500/20', bgIconColor: 'bg-indigo-500/10',
    iconColor: 'text-indigo-400', barGradient: 'from-indigo-500 to-purple-500',
    dividerGradient: 'to-indigo-500/20', accentColor: 'text-indigo-400/60',
    surfaceTintClass: 'from-indigo-500/12 to-purple-500/6', railColor: 'bg-indigo-500/30',
  },
  {
    key: 'series', label: 'Series', icon: Tv,
    gradient: 'from-teal-500 to-cyan-600', color: 'text-teal-400',
    bgGradient: 'from-teal-600/30 via-cyan-600/20 to-teal-600/30',
    overlayGradient: 'from-teal-500/10 to-cyan-500/10',
    placeholderGradient: 'from-teal-600 to-cyan-600',
    badgeGradient: 'from-teal-500 to-cyan-600', badgeShadow: 'shadow-teal-500/25',
    borderColor: 'border-teal-500/30', ringColor: 'ring-teal-500/10',
    shadowColor: 'shadow-teal-500/20', bgIconColor: 'bg-teal-500/10',
    iconColor: 'text-teal-400', barGradient: 'from-teal-500 to-cyan-500',
    dividerGradient: 'to-teal-500/20', accentColor: 'text-teal-400/60',
    surfaceTintClass: 'from-teal-500/12 to-cyan-500/6', railColor: 'bg-teal-500/30',
  },
];

export type ProfileSortOrder = 'oldest' | 'newest';
export type ProfileSortOrderMap = Record<string, ProfileSortOrder>;

export const PROFILE_FILTER_STORAGE_KEY = 'profiles-filter-types';
export const PROFILE_SORT_ORDER_KEY = 'profiles-sort-order';

export function getTypeConfig(type: ProfileType): ProfileTypeConfig {
  return PROFILE_TYPE_CONFIGS.find((config) => config.key === type) ?? PROFILE_TYPE_CONFIGS[0];
}

export function getProfileSortKey(profile: ProfileIdentity): string {
  return getProfileKey(profile);
}

export function getSortOrderForProfile(
  profileKey: string,
  map: ProfileSortOrderMap,
): ProfileSortOrder {
  return map[profileKey] === 'oldest' ? 'oldest' : 'newest';
}

export function loadPersistedProfileFilters(): ProfileType[] {
  try {
    const stored = localStorage.getItem(PROFILE_FILTER_STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every((value) => PROFILE_TYPE_CONFIGS.some((config) => config.key === value))
      ) {
        return parsed as ProfileType[];
      }
    }
  } catch {
    // Invalid persisted state falls back to all profile types.
  }
  return PROFILE_TYPE_CONFIGS.map((config) => config.key);
}

export function loadProfileSortOrderMap(): ProfileSortOrderMap {
  try {
    const stored = localStorage.getItem(PROFILE_SORT_ORDER_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (typeof parsed === 'object' && parsed !== null) {
        const validEntries = Object.entries(parsed).filter(
          (entry): entry is [string, ProfileSortOrder] => entry[1] === 'oldest' || entry[1] === 'newest',
        );
        return Object.fromEntries(validEntries);
      }
    }
  } catch {
    // Invalid persisted state falls back to newest for every profile.
  }
  return {};
}
