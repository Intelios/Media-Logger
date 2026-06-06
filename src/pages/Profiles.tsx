import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Users, ChevronLeft, Star, Hash, Camera, Clapperboard, Sparkles, Music, BookOpen, Gamepad2, Clock, LayoutGrid, Flag, Flame, Calendar, RotateCcw, Trophy, Tv, ArrowUp, ArrowDown, Captions, MoreVertical, EyeOff, Eye } from "lucide-react";
import { open } from '@tauri-apps/plugin-dialog';
import { profilesLogic, type ProfileSummary } from "../lib/profiles-logic";
import { awardsLogic } from "../lib/awards-logic";
import type { MediaEntry } from "../lib/db";
import { MediaCard, type MediaAward } from "../components/MediaCard";
import { useImageUrl } from "../lib/utils";

type ViewMode = 'collection' | 'timeline' | 'awards';

// Filter Options with visual config - each type has its own color palette
const PROFILE_TYPES = [
  {
    key: "director", label: "Studio", icon: Clapperboard,
    gradient: "from-blue-500 to-cyan-600", color: "text-blue-400",
    bgGradient: "from-blue-600/30 via-cyan-600/20 to-blue-600/30",
    overlayGradient: "from-blue-500/10 to-cyan-500/10",
    placeholderGradient: "from-blue-600 to-cyan-600",
    badgeGradient: "from-blue-500 to-cyan-600",
    badgeShadow: "shadow-blue-500/25",
    borderColor: "border-blue-500/30",
    ringColor: "ring-blue-500/10",
    shadowColor: "shadow-blue-500/20",
    bgIconColor: "bg-blue-500/10",
    iconColor: "text-blue-400",
    barGradient: "from-blue-500 to-cyan-500",
    dividerGradient: "to-blue-500/20",
    accentColor: "text-blue-400/60"
  },
  {
    key: "actress", label: "Actress", icon: Sparkles,
    gradient: "from-pink-500 to-rose-600", color: "text-pink-400",
    bgGradient: "from-rose-600/30 via-pink-600/20 to-purple-600/30",
    overlayGradient: "from-rose-500/10 to-pink-500/10",
    placeholderGradient: "from-rose-600 to-pink-600",
    badgeGradient: "from-rose-500 to-pink-600",
    badgeShadow: "shadow-rose-500/25",
    borderColor: "border-rose-500/30",
    ringColor: "ring-rose-500/10",
    shadowColor: "shadow-rose-500/20",
    bgIconColor: "bg-rose-500/10",
    iconColor: "text-rose-400",
    barGradient: "from-rose-500 to-pink-500",
    dividerGradient: "to-rose-500/20",
    accentColor: "text-rose-400/60"
  },
  {
    key: "artist", label: "Artist", icon: Music,
    gradient: "from-purple-500 to-violet-600", color: "text-purple-400",
    bgGradient: "from-purple-600/30 via-violet-600/20 to-purple-600/30",
    overlayGradient: "from-purple-500/10 to-violet-500/10",
    placeholderGradient: "from-purple-600 to-violet-600",
    badgeGradient: "from-purple-500 to-violet-600",
    badgeShadow: "shadow-purple-500/25",
    borderColor: "border-purple-500/30",
    ringColor: "ring-purple-500/10",
    shadowColor: "shadow-purple-500/20",
    bgIconColor: "bg-purple-500/10",
    iconColor: "text-purple-400",
    barGradient: "from-purple-500 to-violet-500",
    dividerGradient: "to-purple-500/20",
    accentColor: "text-purple-400/60"
  },
  {
    key: "author", label: "Author", icon: BookOpen,
    gradient: "from-amber-500 to-orange-600", color: "text-amber-400",
    bgGradient: "from-amber-600/30 via-orange-600/20 to-amber-600/30",
    overlayGradient: "from-amber-500/10 to-orange-500/10",
    placeholderGradient: "from-amber-600 to-orange-600",
    badgeGradient: "from-amber-500 to-orange-600",
    badgeShadow: "shadow-amber-500/25",
    borderColor: "border-amber-500/30",
    ringColor: "ring-amber-500/10",
    shadowColor: "shadow-amber-500/20",
    bgIconColor: "bg-amber-500/10",
    iconColor: "text-amber-400",
    barGradient: "from-amber-500 to-orange-500",
    dividerGradient: "to-amber-500/20",
    accentColor: "text-amber-400/60"
  },
  {
    key: "platform", label: "Platform", icon: Gamepad2,
    gradient: "from-green-500 to-emerald-600", color: "text-green-400",
    bgGradient: "from-green-600/30 via-emerald-600/20 to-green-600/30",
    overlayGradient: "from-green-500/10 to-emerald-500/10",
    placeholderGradient: "from-green-600 to-emerald-600",
    badgeGradient: "from-green-500 to-emerald-600",
    badgeShadow: "shadow-green-500/25",
    borderColor: "border-green-500/30",
    ringColor: "ring-green-500/10",
    shadowColor: "shadow-green-500/20",
    bgIconColor: "bg-green-500/10",
    iconColor: "text-green-400",
    barGradient: "from-green-500 to-emerald-500",
    dividerGradient: "to-green-500/20",
    accentColor: "text-green-400/60"
  },
  {
    key: "franchise", label: "Franchise", icon: Gamepad2,
    gradient: "from-indigo-500 to-purple-600", color: "text-indigo-400",
    bgGradient: "from-indigo-600/30 via-purple-600/20 to-indigo-600/30",
    overlayGradient: "from-indigo-500/10 to-purple-500/10",
    placeholderGradient: "from-indigo-600 to-purple-600",
    badgeGradient: "from-indigo-500 to-purple-600",
    badgeShadow: "shadow-indigo-500/25",
    borderColor: "border-indigo-500/30",
    ringColor: "ring-indigo-500/10",
    shadowColor: "shadow-indigo-500/20",
    bgIconColor: "bg-indigo-500/10",
    iconColor: "text-indigo-400",
    barGradient: "from-indigo-500 to-purple-500",
    dividerGradient: "to-indigo-500/20",
    accentColor: "text-indigo-400/60"
  },
  {
    key: "series", label: "Series", icon: Tv,
    gradient: "from-teal-500 to-cyan-600", color: "text-teal-400",
    bgGradient: "from-teal-600/30 via-cyan-600/20 to-teal-600/30",
    overlayGradient: "from-teal-500/10 to-cyan-500/10",
    placeholderGradient: "from-teal-600 to-cyan-600",
    badgeGradient: "from-teal-500 to-cyan-600",
    badgeShadow: "shadow-teal-500/25",
    borderColor: "border-teal-500/30",
    ringColor: "ring-teal-500/10",
    shadowColor: "shadow-teal-500/20",
    bgIconColor: "bg-teal-500/10",
    iconColor: "text-teal-400",
    barGradient: "from-teal-500 to-cyan-500",
    dividerGradient: "to-teal-500/20",
    accentColor: "text-teal-400/60"
  },
];

const FILTER_STORAGE_KEY = "profiles-filter-types";
const SORT_ORDER_KEY = "profiles-sort-order";

// Helper to load persisted filter from localStorage
const loadPersistedFilter = (): string[] => {
  try {
    const stored = localStorage.getItem(FILTER_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.every(t => PROFILE_TYPES.some(pt => pt.key === t))) {
        return parsed;
      }
    }
  } catch {
    // If parsing fails, fall back to default
  }
  return PROFILE_TYPES.map(t => t.key); // Default: all types selected
};

// Per-profile sort order: stored as { "type:name": "oldest" | "newest" }
const loadSortOrderMap = (): Record<string, "oldest" | "newest"> => {
  try {
    const stored = localStorage.getItem(SORT_ORDER_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed;
      }
    }
  } catch {
    // If parsing fails, fall back to default
  }
  return {}; // Default: empty map (falls back to "newest" per profile)
};

const getProfileSortKey = (profile: Pick<ProfileSummary, "type" | "name">): string => {
  return `${profile.type}:${profile.name}`;
};

const getSortOrderForProfile = (profileKey: string, map: Record<string, "oldest" | "newest">): "oldest" | "newest" => {
  return map[profileKey] || "newest";
};

// Get gradient for a profile type
const getTypeConfig = (type: string) => {
  return PROFILE_TYPES.find(t => t.key === type) || PROFILE_TYPES[0];
};

// Format date for timeline
const formatTimelineDate = (dateString: string | null): string => {
  if (!dateString) return 'Unknown Date';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateString;
  }
};

// --- SUB-COMPONENT: Timeline Entry Card ---
function TimelineCard({
  entry,
  index,
  isFirst,
  isLast
}: {
  entry: MediaEntry;
  index: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const imgSrc = useImageUrl(entry.image_url, '');
  const isLeft = index % 2 === 0;

  return (
    <div
      className={`relative flex items-center gap-4 ${isLeft ? 'flex-row' : 'flex-row-reverse'} md:flex-row`}
      style={{
        animationDelay: `${index * 80}ms`,
        animation: 'fadeInUp 0.5s ease-out forwards',
        opacity: 0
      }}
    >
      {/* Timeline Line and Node */}
      <div className="absolute left-1/2 md:left-8 -translate-x-1/2 md:translate-x-0 top-0 bottom-0 flex flex-col items-center">
        {/* Top line */}
        {!isFirst && (
          <div className="w-0.5 flex-1 bg-gradient-to-b from-rose-500/40 to-rose-500/20" />
        )}
        {isFirst && <div className="flex-1" />}

        {/* Node */}
        <div className={`relative z-10 flex-shrink-0 w-4 h-4 rounded-full border-2 ${isFirst
          ? 'bg-green-500 border-green-400 shadow-lg shadow-green-500/50'
          : isLast
            ? 'bg-rose-500 border-rose-400 shadow-lg shadow-rose-500/50'
            : 'bg-gray-700 border-gray-500'
          }`}>
          {(isFirst || isLast) && (
            <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ backgroundColor: isFirst ? '#22c55e' : '#f43f5e' }} />
          )}
        </div>

        {/* Bottom line */}
        {!isLast && (
          <div className="w-0.5 flex-1 bg-gradient-to-b from-rose-500/20 to-rose-500/40" />
        )}
        {isLast && <div className="flex-1" />}
      </div>

      {/* Entry Card */}
      <div className={`ml-0 md:ml-20 flex-1 max-w-lg ${isLeft ? 'mr-auto md:mr-0' : 'ml-auto md:ml-20'
        }`}>
        <div className="group relative bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden hover:border-white/25 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/40">
          {/* Milestone Badge */}
          {isFirst && (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-green-500/90 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
              <Flag size={12} />
              <span>First</span>
            </div>
          )}
          {isLast && (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-rose-500/90 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
              <Flame size={12} />
              <span>Latest</span>
            </div>
          )}

          <div className="flex gap-3 p-3">
            {/* Thumbnail */}
            <div className="w-16 h-20 rounded-lg overflow-hidden bg-black/40 flex-shrink-0 border border-white/10">
              {imgSrc ? (
                <img src={imgSrc} className="w-full h-full object-cover" alt={entry.name} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500">
                  <LayoutGrid size={20} />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm text-white truncate group-hover:text-rose-200 transition-colors">
                {entry.name}
              </h4>

              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-xs text-gray-400 capitalize bg-white/5 px-2 py-0.5 rounded">
                  {entry.entry_type || 'Entry'}
                </span>
                {entry.is_rewatch === 1 && (
                  <div className="flex items-center gap-1 bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/30">
                    <RotateCcw size={10} />
                    <span className="text-xs font-medium">Replay</span>
                  </div>
                )}
                {entry.has_subtitles === 1 && (
                  <div className="flex items-center gap-1 bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded border border-orange-500/30">
                    <Captions size={10} />
                    <span className="text-xs font-medium">Subtitles</span>
                  </div>
                )}
                {entry.review_score != null && (
                  <div className="flex items-center gap-1 text-yellow-500">
                    <Star size={10} fill="currentColor" />
                    <span className="text-xs font-medium">{entry.review_score}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 mt-2 text-gray-400">
                <Calendar size={11} />
                <span className="text-xs">{formatTimelineDate(entry.completion_date)}</span>
              </div>
            </div>

            {/* Entry Number Badge */}
            <div className="flex-shrink-0 self-center">
              <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                <span className="text-xs font-bold text-gray-400">#{index + 1}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- SUB-COMPONENT: Award Entry Card ---
function AwardCard({
  entry,
  categoryName,
  profileConfig,
  index
}: {
  entry: MediaEntry;
  categoryName: string;
  profileConfig: typeof PROFILE_TYPES[number];
  index: number;
}) {
  const imgSrc = useImageUrl(entry.image_url, '');

  return (
    <div
      className="group relative bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden hover:border-white/25 transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:shadow-black/40"
      style={{
        animationDelay: `${index * 80}ms`,
        animation: 'fadeInUp 0.5s ease-out forwards',
        opacity: 0
      }}
    >
      <div className="flex gap-4 p-4 items-center">
        {/* Entry Thumbnail */}
        <div className="w-14 h-20 rounded-lg overflow-hidden bg-black/40 flex-shrink-0 border border-white/10">
          {imgSrc ? (
            <img src={imgSrc} className="w-full h-full object-cover" alt={entry.name} />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${profileConfig.placeholderGradient} opacity-30`} />
          )}
        </div>

        {/* Entry Info */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm truncate">{entry.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-400 capitalize bg-white/5 px-2 py-0.5 rounded">
              {entry.entry_type || 'Entry'}
            </span>
            {entry.review_score != null && (
              <div className="flex items-center gap-1 text-yellow-500">
                <Star size={10} fill="currentColor" />
                <span className="text-xs font-medium">{entry.review_score}</span>
              </div>
            )}
          </div>
        </div>

        {/* Award Badge */}
        <div className="flex-shrink-0">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${profileConfig.badgeGradient} shadow-lg ${profileConfig.badgeShadow}`}>
            <Trophy size={14} className="text-white" />
            <span className="text-white text-xs font-bold whitespace-nowrap">{categoryName}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- SUB-COMPONENT: Individual Profile Card for the Grid ---
function ProfileCard({ profile, onClick, onAction, actionLabel, ActionIcon }: {
  profile: ProfileSummary;
  onClick: (p: ProfileSummary) => void;
  onAction: (p: ProfileSummary) => void;
  actionLabel: string;
  ActionIcon: typeof EyeOff;
}) {
  const imgSrc = useImageUrl(profile.image_url, "");
  const typeConfig = getTypeConfig(profile.type);
  const TypeIcon = typeConfig.icon;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const insideButton = menuRef.current?.contains(e.target as Node);
      const insideDropdown = menuDropdownRef.current?.contains(e.target as Node);
      if (!insideButton && !insideDropdown) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!menuOpen && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setMenuOpen(!menuOpen);
  };

  return (
    <div className="group relative h-full">
      <button
        onClick={() => onClick(profile)}
        className={`relative bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-sm border ${typeConfig.borderColor} rounded-2xl overflow-hidden hover:border-white/25 transition-all duration-300 text-left h-32 w-full flex items-stretch hover:scale-[1.02] hover:shadow-2xl ${typeConfig.shadowColor}`}
      >
        {/* Ambient blurred wash of the image, fading out across the card */}
        {imgSrc && (
          <>
            <div className="media-list-card-blur" style={{ backgroundImage: `url("${imgSrc}")` }} />
            <div className="media-list-card-overlay" />
          </>
        )}

        {/* Crisp image / initials — uniform left section, full card height */}
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={profile.name}
            className="relative z-[2] w-28 h-full min-h-0 flex-shrink-0 self-stretch object-cover object-center"
          />
        ) : (
          <div className={`relative z-[2] w-28 flex-shrink-0 self-stretch flex items-center justify-center bg-gradient-to-br ${typeConfig.placeholderGradient}`}>
            <span className="text-3xl font-bold uppercase text-white/90">{profile.name[0]}</span>
          </div>
        )}

        <div className="relative z-[2] flex-1 min-w-0 flex flex-col justify-center px-4 py-3 pr-8">
          <h4 className="font-semibold text-lg group-hover:text-white transition-colors truncate">
            {profile.name}
          </h4>
          <div className="flex items-center gap-3 mt-1.5">
            <span className={`flex items-center gap-1 text-xs font-medium capitalize ${typeConfig.color}`}>
              <TypeIcon size={13} />
              {profile.type}
            </span>
            <div className="flex items-center gap-1.5 text-gray-400">
              <Hash size={12} />
              <span className="text-xs">{profile.count}</span>
            </div>
            {profile.average_score > 0 && (
              <div className="flex items-center gap-1 text-yellow-500">
                <Star size={12} fill="currentColor" />
                <span className="text-xs font-medium">{profile.average_score}</span>
              </div>
            )}
          </div>
        </div>

        {/* Hover glow effect */}
        <div className={`absolute inset-0 z-[3] bg-gradient-to-r ${typeConfig.gradient} opacity-0 group-hover:opacity-5 transition-opacity pointer-events-none`} />
      </button>

      {/* Action menu button */}
      <div className="absolute top-2 right-2 z-20" ref={menuRef}>
        <button
          ref={menuButtonRef}
          onClick={handleMenuClick}
          className={`p-1.5 bg-black/50 backdrop-blur-sm rounded-full transition-all hover:bg-black/70 ${
            menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <MoreVertical size={16} className="text-white" />
        </button>
      </div>

      {menuOpen && createPortal(
        <div
          ref={menuDropdownRef}
          className="fixed w-44 rounded-xl border border-white/20 bg-transparent backdrop-blur-2xl shadow-2xl shadow-black/45 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-[200]"
          style={{
            top: menuPosition.top,
            right: menuPosition.right,
            background: "color-mix(in srgb, var(--color-surface) 42%, transparent)",
            backdropFilter: "blur(24px) saturate(170%)",
            WebkitBackdropFilter: "blur(24px) saturate(170%)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              onAction(profile);
            }}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm ${
              actionLabel === "Hide Profile"
                ? "text-red-400 hover:bg-red-500/15"
                : "text-green-400 hover:bg-green-500/15"
            } transition-colors`}
          >
            <ActionIcon size={14} />
            <span>{actionLabel}</span>
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

// --- MAIN PAGE COMPONENT ---
export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [filteredProfiles, setFilteredProfiles] = useState<ProfileSummary[]>([]);

  // Navigation State
  const [selectedProfile, setSelectedProfile] = useState<ProfileSummary | null>(null);
  const [profileEntries, setProfileEntries] = useState<MediaEntry[]>([]);
  const [timelineEntries, setTimelineEntries] = useState<MediaEntry[]>([]);
  const [awardsMap, setAwardsMap] = useState<Map<number, MediaAward[]>>(new Map());

  // View Mode State
  const [viewMode, setViewMode] = useState<ViewMode>('collection');

  // Sort Order State (per-profile, persisted)
  const [sortOrderMap, setSortOrderMap] = useState<Record<string, "oldest" | "newest">>(loadSortOrderMap);
  const sortOrder = selectedProfile ? getSortOrderForProfile(getProfileSortKey(selectedProfile), sortOrderMap) : "newest";

  // Derived: awards grouped by year for the Awards tab
  const awardsByYear = useMemo(() => {
    const items: { entry: MediaEntry; categoryName: string; year: number }[] = [];
    awardsMap.forEach((awards, entryId) => {
      const entry = profileEntries.find(e => e.id === entryId);
      if (entry) {
        awards.forEach(a => items.push({ entry, categoryName: a.categoryName, year: a.year }));
      }
    });

    const byYear = new Map<number, typeof items>();
    items.forEach(item => {
      const group = byYear.get(item.year) || [];
      group.push(item);
      byYear.set(item.year, group);
    });

    return [...byYear.entries()]
      .sort(([a], [b]) => b - a)
      .map(([year, awards]) => ({ year, awards }));
  }, [awardsMap, profileEntries]);

  // Hidden profiles
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenProfiles, setHiddenProfiles] = useState<ProfileSummary[]>([]);

  // Filters
  const [selectedTypes, setSelectedTypes] = useState<string[]>(loadPersistedFilter);
  const [searchQuery, setSearchQuery] = useState("");

  // URL params for deep-linking to a specific profile
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const headerImgSrc = useImageUrl(selectedProfile?.image_url, "");

  // Return-to info: where the user came from (e.g., year view)
  const [returnTo, setReturnTo] = useState<{ year: string; entryId: string; entryType: string } | null>(null);

  // Initial Load
  useEffect(() => {
    loadProfiles();
  }, []);

  useEffect(() => {
    if (showHidden) loadHiddenProfiles();
  }, [showHidden]);

  const loadProfiles = async () => {
    const data = await profilesLogic.getAllProfiles();
    setProfiles(data);
    if (showHidden) {
      const hidden = await profilesLogic.getHiddenProfiles();
      setHiddenProfiles(hidden);
    }
    return data;
  };

  const loadHiddenProfiles = async () => {
    const hidden = await profilesLogic.getHiddenProfiles();
    setHiddenProfiles(hidden);
  };

  const handleHideProfile = async (profile: ProfileSummary) => {
    await profilesLogic.hideProfile(profile.type, profile.name);
    await loadProfiles();
  };

  const handleUnhideProfile = async (profile: ProfileSummary) => {
    await profilesLogic.unhideProfile(profile.type, profile.name);
    await loadProfiles();
    await loadHiddenProfiles();
  };

  // Handle deep-link URL params (e.g., /profiles?type=artist&name=SomeName)
  useEffect(() => {
    const typeParam = searchParams.get('type');
    const nameParam = searchParams.get('name');
    if (!typeParam || !nameParam || profiles.length === 0) return;

    // Store return-to info if present
    const fromYear = searchParams.get('fromYear');
    const fromEntry = searchParams.get('fromEntry');
    const fromType = searchParams.get('fromType');
    if (fromYear && fromEntry) {
      setReturnTo({ year: fromYear, entryId: fromEntry, entryType: fromType || '' });
    }

    const match = profiles.find(p => p.type === typeParam && p.name === nameParam);
    if (match) {
      handleProfileClick(match);
      // Clean up URL params
      setSearchParams({}, { replace: true });
    }
  }, [profiles, searchParams]);

  // Persist filter selection to localStorage
  useEffect(() => {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(selectedTypes));
  }, [selectedTypes]);

  // Persist sort order map to localStorage
  useEffect(() => {
    localStorage.setItem(SORT_ORDER_KEY, JSON.stringify(sortOrderMap));
  }, [sortOrderMap]);

  // Filter Logic
  useEffect(() => {
    let res = showHidden ? hiddenProfiles : profiles;

    // Type Filter
    if (selectedTypes.length !== PROFILE_TYPES.length) {
      res = res.filter(p => selectedTypes.includes(p.type));
    }

    // Text Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      res = res.filter(p => p.name.toLowerCase().includes(q));
    }

    setFilteredProfiles(res);
  }, [selectedTypes, searchQuery, profiles, showHidden, hiddenProfiles]);

  // Toggle type filter
  const toggleType = (typeKey: string) => {
    setSelectedTypes(prev => {
      if (prev.includes(typeKey)) {
        // Don't allow deselecting all
        if (prev.length === 1) return prev;
        return prev.filter(t => t !== typeKey);
      } else {
        return [...prev, typeKey];
      }
    });
  };

  // Select only one type
  const selectOnlyType = (typeKey: string) => {
    setSelectedTypes([typeKey]);
  };

  // Handle drill-down
  const handleProfileClick = async (profile: ProfileSummary) => {
    setSelectedProfile(profile);
    setViewMode('collection'); // Reset to collection view when opening a new profile
    // Clear stale entries immediately so old profile's items don't flash during animation
    setProfileEntries([]);
    setTimelineEntries([]);
    setAwardsMap(new Map());
    // Load both collection and timeline entries using the clicked profile's saved sort order.
    const collectionAscending = getSortOrderForProfile(getProfileSortKey(profile), sortOrderMap) === "oldest";
    const [collectionData, timelineData] = await Promise.all([
      profilesLogic.getProfileDetails(profile.type, profile.name, collectionAscending),
      profilesLogic.getProfileDetails(profile.type, profile.name, true) // Timeline always chronological
    ]);
    setProfileEntries(collectionData);
    setTimelineEntries(timelineData);

    // Fetch awards for all entries in the profile
    const mediaIds = collectionData.map(e => e.id).filter((id): id is number => id !== undefined);
    if (mediaIds.length > 0) {
      const awards = await awardsLogic.getAwardsForMediaBatch(mediaIds);
      setAwardsMap(awards);
    } else {
      setAwardsMap(new Map());
    }
  };

  // Re-fetch collection entries when sort order changes (if a profile is selected)
  useEffect(() => {
    if (!selectedProfile) return;
    const collectionAscending = sortOrder === "oldest";
    profilesLogic.getProfileDetails(selectedProfile.type, selectedProfile.name, collectionAscending).then(setProfileEntries);
  }, [sortOrder, selectedProfile]);

  // Handle Image Upload
  const handleUpdateImage = async () => {
    if (!selectedProfile) return;

    try {
      const file = await open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      });

      if (file) {
        const path = file as string;

        if (path) {
          // Save to DB
          const savedRelPath = await profilesLogic.setProfileImage(selectedProfile.type, selectedProfile.name, path);

          if (savedRelPath) {
            setSelectedProfile({ ...selectedProfile, image_url: savedRelPath });

            // Update Main List logic so it persists when going back
            const newProfiles = await profilesLogic.getAllProfiles();
            setProfiles(newProfiles);

            // Update current object ref
            const updated = newProfiles.find(p => p.name === selectedProfile.name && p.type === selectedProfile.type);
            if (updated) setSelectedProfile(updated);
          }
        }
      }
    } catch (e) {
      console.error("Failed to update profile image", e);
    }
  };

  const selectedProfileConfig = selectedProfile ? getTypeConfig(selectedProfile.type) : null;

  // --- VIEW 1: DETAILS (Drill Down) - Magazine/Portfolio Layout ---
  if (selectedProfile && selectedProfileConfig) {
    return (
      <div className="animate-in fade-in duration-500 -mx-6 -mt-6">
        {/* Split Hero - Cover-focused header */}
        <div className="relative flex flex-col md:flex-row min-h-[340px] overflow-hidden rounded-b-3xl profile-header-enter">
          {/* Ambient blurred wash of the cover (cohesion layer behind everything) */}
          {headerImgSrc ? (
            <img
              src={headerImgSrc}
              className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-25"
              alt=""
            />
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${selectedProfileConfig.bgGradient}`} />
          )}

          {/* Scrims for legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-[#0d0d0d]/70 to-[#0d0d0d]/30" />
          <div className={`absolute inset-0 bg-gradient-to-r ${selectedProfileConfig.overlayGradient}`} />

          {/* Back Button - Floating over cover */}
          <button
            onClick={() => {
              if (returnTo) {
                // Navigate back to the year view, highlighting the entry they came from
                const params = new URLSearchParams({ highlight: returnTo.entryId });
                if (returnTo.entryType) params.set('type', returnTo.entryType);
                navigate(`/year/${returnTo.year}?${params.toString()}`);
                setReturnTo(null);
              } else {
                setSelectedProfile(null);
              }
            }}
            className="absolute top-6 left-6 p-3 bg-black/40 backdrop-blur-md hover:bg-black/60 rounded-full transition-all border border-white/10 hover:border-white/30 hover:scale-105 z-20"
          >
            <ChevronLeft size={24} />
          </button>

          {/* LEFT: Large sharp cover (the focal point) */}
          <div className="relative group w-full md:w-[40%] lg:w-[36%] min-h-[260px] md:min-h-[340px] flex-shrink-0 z-10">
            {headerImgSrc ? (
              <img
                src={headerImgSrc}
                className="absolute inset-0 h-full w-full object-cover"
                alt={selectedProfile.name}
              />
            ) : (
              <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${selectedProfileConfig.placeholderGradient}`}>
                <span className="text-8xl font-bold uppercase text-white/80">{selectedProfile.name[0]}</span>
              </div>
            )}

            {/* Blend cover into the info panel */}
            <div className="absolute inset-0 hidden md:block bg-gradient-to-r from-transparent via-transparent to-[#0d0d0d]/70" />
            <div className="absolute inset-x-0 bottom-0 h-24 md:hidden bg-gradient-to-t from-[#0d0d0d]/80 to-transparent" />

            {/* Edit Overlay */}
            <button
              onClick={handleUpdateImage}
              className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer backdrop-blur-sm"
            >
              <Camera size={36} className="text-white" />
              <span className="sr-only">Change profile image</span>
            </button>
          </div>

          {/* RIGHT: Info panel */}
          <div className="relative z-10 flex-1 min-w-0 p-8 md:p-10 flex flex-col justify-center gap-4">
            {/* Eyebrow */}
            <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] ${selectedProfileConfig.accentColor}`}>
              <span>Profile</span>
              <span className="opacity-50">·</span>
              <span>{selectedProfileConfig.label}</span>
            </div>

            {/* Name */}
            <h1 className="text-5xl md:text-6xl font-bold leading-[1.05] break-words bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300">
              {selectedProfile.name}
            </h1>

            {/* Type badge */}
            <div>
              <span className={`inline-block capitalize bg-gradient-to-r ${selectedProfileConfig.badgeGradient} px-4 py-1.5 rounded-full text-sm font-bold text-white shadow-lg ${selectedProfileConfig.badgeShadow}`}>
                {selectedProfile.type}
              </span>
            </div>

            {/* Compact inline stats */}
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3.5 py-1.5 text-sm font-medium text-white">
                <Hash size={15} className={selectedProfileConfig.iconColor} />
                {selectedProfile.count}
                <span className="text-gray-400">entries</span>
              </span>
              {selectedProfile.average_score > 0 && (
                <span className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3.5 py-1.5 text-sm font-medium text-white">
                  <Star size={15} className="text-yellow-400" fill="currentColor" />
                  {selectedProfile.average_score}
                  <span className="text-gray-400">avg</span>
                </span>
              )}
            </div>

            {/* Slim rating bar */}
            {selectedProfile.average_score > 0 && (
              <div className="max-w-sm mt-1">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-400">Rating</span>
                  <span className="text-white font-medium">{selectedProfile.average_score}/10</span>
                </div>
                <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${selectedProfileConfig.barGradient} rounded-full transition-all duration-1000`}
                    style={{ width: `${(selectedProfile.average_score / 10) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* View Toggle and Section Divider */}
        <div className="px-6 mt-10 mb-6">
          <div className="flex items-center justify-center gap-2">
            <div className={`h-px flex-1 bg-gradient-to-r from-transparent ${selectedProfileConfig.dividerGradient}`} />

            {/* Toggle Buttons */}
            <div className="flex items-center gap-1 p-1 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
              <button
                onClick={() => setViewMode('collection')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'collection'
                  ? `bg-gradient-to-r ${selectedProfileConfig.badgeGradient} text-white shadow-lg`
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                <LayoutGrid size={16} />
                <span>Collection</span>
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'timeline'
                  ? `bg-gradient-to-r ${selectedProfileConfig.badgeGradient} text-white shadow-lg`
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                <Clock size={16} />
                <span>Timeline</span>
              </button>
              <button
                onClick={() => setViewMode('awards')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'awards'
                  ? `bg-gradient-to-r ${selectedProfileConfig.badgeGradient} text-white shadow-lg`
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                <Trophy size={16} />
                <span>Awards</span>
              </button>
            </div>

            {/* Sort Order Toggle */}
            <div className="flex items-center gap-1 p-1 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
              <button
                onClick={() => {
                  if (selectedProfile) {
                    const key = getProfileSortKey(selectedProfile);
                    setSortOrderMap(prev => ({ ...prev, [key]: "oldest" }));
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${sortOrder === "oldest"
                  ? `bg-gradient-to-r ${selectedProfileConfig.badgeGradient} text-white shadow-lg`
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                <ArrowUp size={14} />
                <span>Oldest</span>
              </button>
              <button
                onClick={() => {
                  if (selectedProfile) {
                    const key = getProfileSortKey(selectedProfile);
                    setSortOrderMap(prev => ({ ...prev, [key]: "newest" }));
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${sortOrder === "newest"
                  ? `bg-gradient-to-r ${selectedProfileConfig.badgeGradient} text-white shadow-lg`
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                <ArrowDown size={14} />
                <span>Newest</span>
              </button>
            </div>

            <div className={`h-px flex-1 bg-gradient-to-l from-transparent ${selectedProfileConfig.dividerGradient}`} />
          </div>
        </div>

        {/* Content based on view mode */}
        {viewMode === 'collection' ? (
          /* Masonry-Style Staggered Grid */
          <div className="px-6 pb-10">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 auto-rows-fr">
              {profileEntries.map((entry, idx) => (
                <div
                  key={entry.id}
                  className={`${idx % 5 === 0 ? 'row-span-1' : ''} transform hover:scale-[1.02] transition-transform duration-200`}
                  style={{
                    animationDelay: `${idx * 50}ms`,
                    animation: 'fadeInUp 0.4s ease-out forwards',
                    opacity: 0
                  }}
                >
                  <MediaCard entry={entry} awards={entry.id ? awardsMap.get(entry.id) : undefined} />
                </div>
              ))}
            </div>
          </div>
        ) : viewMode === 'timeline' ? (
          /* Timeline View */
          <div className="px-6 pb-10">
            {/* Timeline Header */}
            <div className="mb-8 text-center">
              <p className="text-gray-400 text-sm">
                Your journey with <span className={`${selectedProfileConfig.color} font-medium`}>{selectedProfile.name}</span> — from first discovery to latest experience
              </p>
            </div>

            {/* Timeline */}
            <div className="relative max-w-2xl mx-auto space-y-4">
              {timelineEntries.map((entry, idx) => (
                <TimelineCard
                  key={entry.id}
                  entry={entry}
                  index={idx}
                  isFirst={idx === 0}
                  isLast={idx === timelineEntries.length - 1}
                />
              ))}
            </div>

            {/* Timeline Summary */}
            {timelineEntries.length > 0 && (
              <div className="mt-10 text-center">
                <div className="inline-flex items-center gap-3 px-6 py-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl">
                  <div className="flex items-center gap-1 text-green-400">
                    <Flag size={14} />
                    <span className="text-xs font-medium">{formatTimelineDate(timelineEntries[0]?.completion_date)}</span>
                  </div>
                  <span className="text-gray-500">→</span>
                  <div className="flex items-center gap-1 text-rose-400">
                    <Flame size={14} />
                    <span className="text-xs font-medium">{formatTimelineDate(timelineEntries[timelineEntries.length - 1]?.completion_date)}</span>
                  </div>
                  <span className="text-gray-500 mx-2">|</span>
                  <span className="text-gray-400 text-xs">{timelineEntries.length} entries total</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Awards View */
          <div className="px-6 pb-10">
            {awardsByYear.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Trophy size={48} className="text-gray-600 mb-4" />
                <p className="text-gray-400 text-lg font-medium">No Awards Yet</p>
                <p className="text-gray-500 text-sm mt-1">
                  Entries from <span className={`${selectedProfileConfig.color} font-medium`}>{selectedProfile.name}</span> haven't received any awards
                </p>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-8">
                <div className="text-center mb-8">
                  <p className="text-gray-400 text-sm">
                    <span className={`${selectedProfileConfig.color} font-medium`}>{selectedProfile.name}</span>'s award-winning entries
                  </p>
                </div>

                {awardsByYear.map(({ year, awards }) => (
                  <div key={year}>
                    {/* Year Header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`h-px flex-1 bg-gradient-to-r from-transparent ${selectedProfileConfig.dividerGradient}`} />
                      <span className={`text-sm font-bold bg-gradient-to-r ${selectedProfileConfig.badgeGradient} bg-clip-text text-transparent`}>
                        {year}
                      </span>
                      <div className={`h-px flex-1 bg-gradient-to-l from-transparent ${selectedProfileConfig.dividerGradient}`} />
                    </div>

                    {/* Award Cards */}
                    <div className="space-y-3">
                      {awards.map((item, idx) => (
                        <AwardCard
                          key={`${item.entry.id}-${item.categoryName}-${idx}`}
                          entry={item.entry}
                          categoryName={item.categoryName}
                          profileConfig={selectedProfileConfig}
                          index={idx}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Inline Keyframe Animation */}
        <style>{`
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    );
  }

  // --- VIEW 2: MAIN LIST ---
  return (
    <div className="space-y-6">
      {/* Header with gradient background effect */}
      <header className="relative profile-header-enter">
        <div className="absolute inset-0 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-blue-500/10 blur-3xl -z-10 opacity-50" />

        <div className="flex flex-col gap-6">
          {/* Title and search row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-pink-500 to-purple-600 rounded-xl shadow-lg shadow-pink-500/20">
                  <Users size={24} />
                </div>
                Profiles
              </h2>
              <p className="text-gray-400 mt-1">{showHidden ? "Profiles you've hidden — unhide to restore" : "Discover your most frequent collaborators"}</p>
            </div>

            {/* Search bar */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search profiles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-3 text-sm w-72 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-gray-500"
              />
            </div>
          </div>

          {/* Quick Type Filter Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {PROFILE_TYPES.map(type => {
              const Icon = type.icon;
              const isActive = selectedTypes.includes(type.key);
              const isOnlySelected = selectedTypes.length === 1 && selectedTypes[0] === type.key;

              return (
                <button
                  key={type.key}
                  onClick={() => toggleType(type.key)}
                  onDoubleClick={() => selectOnlyType(type.key)}
                  className={`
                    flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm
                    transition-all duration-200 
                    ${isActive
                      ? `bg-gradient-to-r ${type.gradient} text-white shadow-lg scale-105`
                      : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 hover:border-white/20'}
                    ${isOnlySelected ? 'ring-2 ring-white/30' : ''}
                  `}
                  title={isActive ? "Click to toggle off, double-click to select only this" : "Click to add filter"}
                >
                  <Icon size={16} />
                  <span>{type.label}</span>
                  {isActive && (
                    <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] font-bold">
                      {profiles.filter(p => p.type === type.key).length}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Reset button - only show when not all selected */}
            {selectedTypes.length !== PROFILE_TYPES.length && (
              <button
                onClick={() => setSelectedTypes(PROFILE_TYPES.map(t => t.key))}
                className="text-gray-400 hover:text-white text-sm underline underline-offset-2 transition-colors ml-2"
              >
                Show All
              </button>
            )}

            {/* Stats and Hidden toggle */}
            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => setShowHidden(!showHidden)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  showHidden
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-white/5 text-gray-400 hover:text-white border border-white/10 hover:border-white/20'
                }`}
              >
                <EyeOff size={14} />
                <span>Hidden</span>
              </button>
              <div className="text-sm text-gray-500">
                {filteredProfiles.length} {showHidden ? 'hidden' : ''} profiles
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Profile Grid */}
      {filteredProfiles.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-10">
          {filteredProfiles.map((profile, idx) => (
            <div
              key={`${profile.type}-${profile.name}-${idx}`}
              className="profile-card-enter h-full"
              style={{ animationDelay: `${Math.min(idx * 50, 500)}ms` }}
            >
              <ProfileCard
                profile={profile}
                onClick={showHidden ? () => {} : handleProfileClick}
                onAction={showHidden ? handleUnhideProfile : handleHideProfile}
                actionLabel={showHidden ? "Unhide Profile" : "Hide Profile"}
                ActionIcon={showHidden ? Eye : EyeOff}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="text-gray-500 text-center">
            <Users size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg">No profiles found matching criteria.</p>
            <button
              onClick={() => setSelectedTypes(PROFILE_TYPES.map(t => t.key))}
              className="mt-4 text-primary hover:underline"
            >
              Reset Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
