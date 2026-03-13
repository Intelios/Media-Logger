import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Users, ChevronLeft, Star, Hash, Camera, Clapperboard, Sparkles, Music, BookOpen, Gamepad2, Clock, LayoutGrid, Flag, Flame, Calendar, RotateCcw, Trophy } from "lucide-react";
import { open } from '@tauri-apps/plugin-dialog';
import { profilesLogic, type ProfileSummary } from "../lib/profiles-logic";
import { awardsLogic } from "../lib/awards-logic";
import type { MediaEntry } from "../lib/db";
import { MediaCard, type MediaAward } from "../components/MediaCard";
import { getImageUrl } from "../lib/utils";

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
];

const FILTER_STORAGE_KEY = "profiles-filter-types";

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
  const [imgSrc, setImgSrc] = useState('');
  const isLeft = index % 2 === 0;

  useEffect(() => {
    if (entry.image_url) {
      getImageUrl(entry.image_url).then(setImgSrc);
    }
  }, [entry.image_url]);

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
                {entry.review_score && (
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
  const [imgSrc, setImgSrc] = useState('');

  useEffect(() => {
    if (entry.image_url) {
      getImageUrl(entry.image_url).then(setImgSrc);
    }
  }, [entry.image_url]);

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
            {entry.review_score && (
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
function ProfileCard({ profile, onClick }: { profile: ProfileSummary, onClick: (p: ProfileSummary) => void }) {
  const [imgSrc, setImgSrc] = useState("");
  const typeConfig = getTypeConfig(profile.type);

  useEffect(() => {
    if (profile.image_url) {
      getImageUrl(profile.image_url).then(setImgSrc);
    } else {
      setImgSrc("");
    }
  }, [profile.image_url]);

  return (
    <button
      onClick={() => onClick(profile)}
      className="group relative bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden hover:border-white/25 transition-all duration-300 text-left h-full min-h-[7rem] w-full flex items-center p-4 gap-4 hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/40"
    >
      {/* Gradient accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${typeConfig.gradient} opacity-60 group-hover:opacity-100 transition-opacity`} />

      {/* Avatar / Image */}
      <div className={`h-16 w-16 rounded-xl bg-black/40 flex-shrink-0 overflow-hidden border border-white/10 group-hover:border-white/25 transition-colors shadow-lg`}>
        {imgSrc ? (
          <img src={imgSrc} className="h-full w-full object-cover" alt={profile.name} />
        ) : (
          <div className={`h-full w-full flex items-center justify-center bg-gradient-to-br ${typeConfig.gradient} opacity-20`}>
            <span className="text-2xl font-bold opacity-80 uppercase">{profile.name[0]}</span>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 pl-1">
        <h4 className="font-semibold text-lg group-hover:text-white transition-colors truncate">
          {profile.name}
        </h4>
        <div className="flex items-center gap-3 mt-1.5">
          <span className={`text-xs font-medium capitalize ${typeConfig.color}`}>
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
      <div className={`absolute inset-0 bg-gradient-to-r ${typeConfig.gradient} opacity-0 group-hover:opacity-5 transition-opacity pointer-events-none`} />
    </button>
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

  // Detail View Image State
  const [headerImgSrc, setHeaderImgSrc] = useState("");

  // Filters
  const [selectedTypes, setSelectedTypes] = useState<string[]>(loadPersistedFilter);
  const [searchQuery, setSearchQuery] = useState("");

  // URL params for deep-linking to a specific profile
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Return-to info: where the user came from (e.g., year view)
  const [returnTo, setReturnTo] = useState<{ year: string; entryId: string; entryType: string } | null>(null);

  // Initial Load
  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    const data = await profilesLogic.getAllProfiles();
    setProfiles(data);
    return data;
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

  // Filter Logic
  useEffect(() => {
    let res = profiles;

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
  }, [selectedTypes, searchQuery, profiles]);

  // Load Header Image when entering Detail View
  useEffect(() => {
    if (selectedProfile?.image_url) {
      getImageUrl(selectedProfile.image_url).then(setHeaderImgSrc);
    } else {
      setHeaderImgSrc("");
    }
  }, [selectedProfile]);

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
    // Load both collection (newest first) and timeline (oldest first) entries
    const [collectionData, timelineData] = await Promise.all([
      profilesLogic.getProfileDetails(profile.type, profile.name, false),
      profilesLogic.getProfileDetails(profile.type, profile.name, true)
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
            // Update Header immediately
            const newUrl = await getImageUrl(savedRelPath);
            setHeaderImgSrc(newUrl);

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
        {/* Full-Width Hero Section with Blurred Background */}
        <div className="relative h-72 overflow-hidden">
          {/* Blurred Background Image */}
          {headerImgSrc ? (
            <img
              src={headerImgSrc}
              className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40"
              alt=""
            />
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${selectedProfileConfig.bgGradient}`} />
          )}

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-[#0d0d0d]/80 to-transparent" />
          <div className={`absolute inset-0 bg-gradient-to-r ${selectedProfileConfig.overlayGradient}`} />

          {/* Back Button - Floating */}
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
            className="absolute top-6 left-6 p-3 bg-black/40 backdrop-blur-md hover:bg-black/60 rounded-full transition-all border border-white/10 hover:border-white/30 hover:scale-105 z-10"
          >
            <ChevronLeft size={24} />
          </button>
        </div>

        {/* Floating Profile Card - Overlapping Hero */}
        <div className="relative px-6 -mt-32 z-10">
          <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl shadow-black/50">
            <div className="flex flex-col md:flex-row gap-8">
              {/* Large Profile Image */}
              <div className="relative group flex-shrink-0 self-start">
                <div className={`h-40 w-40 rounded-2xl bg-black/50 overflow-hidden border-2 ${selectedProfileConfig.borderColor} shadow-2xl ${selectedProfileConfig.shadowColor} ring-4 ${selectedProfileConfig.ringColor}`}>
                  {headerImgSrc ? (
                    <img src={headerImgSrc} className="h-full w-full object-cover" alt={selectedProfile.name} />
                  ) : (
                    <div className={`h-full w-full flex items-center justify-center bg-gradient-to-br ${selectedProfileConfig.placeholderGradient} opacity-60`}>
                      <span className="text-5xl font-bold uppercase text-white/80">{selectedProfile.name[0]}</span>
                    </div>
                  )}
                </div>

                {/* Edit Overlay */}
                <button
                  onClick={handleUpdateImage}
                  className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer backdrop-blur-sm"
                >
                  <Camera size={32} className="text-white" />
                </button>
              </div>

              {/* Profile Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300">
                      {selectedProfile.name}
                    </h1>
                    <div className="flex items-center gap-3 mt-4">
                      <span className={`capitalize bg-gradient-to-r ${selectedProfileConfig.badgeGradient} px-5 py-2 rounded-full text-sm font-bold text-white shadow-lg ${selectedProfileConfig.badgeShadow}`}>
                        {selectedProfile.type}
                      </span>
                      <span className={`${selectedProfileConfig.accentColor} text-sm font-medium`}>Profile</span>
                    </div>
                  </div>
                </div>

                {/* Stats Row */}
                <div className="flex flex-wrap gap-4 mt-6">
                  {/* Entry Count */}
                  <div className={`bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl px-6 py-4 flex items-center gap-4 hover:${selectedProfileConfig.borderColor} transition-colors`}>
                    <div className={`p-3 rounded-xl ${selectedProfileConfig.bgIconColor}`}>
                      <Hash size={20} className={selectedProfileConfig.iconColor} />
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-white">{selectedProfile.count}</div>
                      <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Entries</div>
                    </div>
                  </div>

                  {/* Average Score */}
                  {selectedProfile.average_score > 0 && (
                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl px-6 py-4 flex items-center gap-4 hover:border-yellow-500/30 transition-colors">
                      <div className="p-3 rounded-xl bg-yellow-500/10">
                        <Star size={20} className="text-yellow-400" fill="currentColor" />
                      </div>
                      <div>
                        <div className="text-3xl font-bold text-white">{selectedProfile.average_score}</div>
                        <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Avg Score</div>
                      </div>
                    </div>
                  )}

                  {/* Visual Score Bar */}
                  {selectedProfile.average_score > 0 && (
                    <div className="flex-1 min-w-[200px] bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl px-6 py-4 flex flex-col justify-center">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-400">Rating</span>
                        <span className="text-white font-medium">{selectedProfile.average_score}/10</span>
                      </div>
                      <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${selectedProfileConfig.barGradient} rounded-full transition-all duration-1000`}
                          style={{ width: `${(selectedProfile.average_score / 10) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
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
              <p className="text-gray-400 mt-1">Discover your most frequent collaborators</p>
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

            {/* Stats */}
            <div className="ml-auto text-sm text-gray-500">
              {filteredProfiles.length} profiles
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
                onClick={handleProfileClick}
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