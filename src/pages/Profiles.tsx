import { useEffect, useState } from "react";
import { Users, ChevronLeft, Star, Hash, Camera, Clapperboard, Sparkles, Music, BookOpen, Gamepad2 } from "lucide-react";
import { open } from '@tauri-apps/plugin-dialog';
import { profilesLogic, type ProfileSummary } from "../lib/profiles-logic";
import type { MediaEntry } from "../lib/db";
import { MediaCard } from "../components/MediaCard";
import { getImageUrl } from "../lib/utils";

// Filter Options with visual config
const PROFILE_TYPES = [
  { key: "director", label: "Director", icon: Clapperboard, gradient: "from-blue-500 to-cyan-600", color: "text-blue-400" },
  { key: "actress", label: "Actress", icon: Sparkles, gradient: "from-pink-500 to-rose-600", color: "text-pink-400" },
  { key: "artist", label: "Artist", icon: Music, gradient: "from-purple-500 to-violet-600", color: "text-purple-400" },
  { key: "author", label: "Author", icon: BookOpen, gradient: "from-amber-500 to-orange-600", color: "text-amber-400" },
  { key: "platform", label: "Platform", icon: Gamepad2, gradient: "from-green-500 to-emerald-600", color: "text-green-400" },
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
      className="group relative bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden hover:border-white/25 transition-all duration-300 text-left h-28 flex items-center p-4 gap-4 hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/40"
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

  // Detail View Image State
  const [headerImgSrc, setHeaderImgSrc] = useState("");

  // Filters
  const [selectedTypes, setSelectedTypes] = useState<string[]>(loadPersistedFilter);
  const [searchQuery, setSearchQuery] = useState("");

  // Initial Load
  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    const data = await profilesLogic.getAllProfiles();
    setProfiles(data);
  };

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
    const entries = await profilesLogic.getProfileDetails(profile.type, profile.name);
    setProfileEntries(entries);
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
        // Tauri v2 dialog return type check
        const path = typeof file === 'string' ? file : file.path;

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

  // --- VIEW 1: DETAILS (Drill Down) ---
  if (selectedProfile && selectedProfileConfig) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* Hero Header */}
        <header className="relative">
          {/* Background gradient */}
          <div className={`absolute inset-0 bg-gradient-to-r ${selectedProfileConfig.gradient} opacity-10 blur-3xl -z-10`} />

          <div className="flex items-center gap-6">
            <button
              onClick={() => setSelectedProfile(null)}
              className="p-3 hover:bg-white/10 rounded-full transition-colors self-start mt-2 border border-white/10 hover:border-white/20"
            >
              <ChevronLeft size={24} />
            </button>

            {/* Profile Image with Edit Button */}
            <div className="relative group">
              <div className={`h-28 w-28 rounded-2xl bg-black/50 overflow-hidden border-2 border-white/20 shadow-2xl flex items-center justify-center ring-4 ring-white/5`}>
                {headerImgSrc ? (
                  <img src={headerImgSrc} className="h-full w-full object-cover" alt={selectedProfile.name} />
                ) : (
                  <div className={`h-full w-full flex items-center justify-center bg-gradient-to-br ${selectedProfileConfig.gradient} opacity-30`}>
                    <span className="text-4xl font-bold opacity-60 uppercase">{selectedProfile.name[0]}</span>
                  </div>
                )}
              </div>

              {/* Edit Overlay */}
              <button
                onClick={handleUpdateImage}
                className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <Camera size={28} className="text-white" />
              </button>
            </div>

            <div className="flex-1">
              <h2 className="text-4xl font-bold">{selectedProfile.name}</h2>
              <div className="flex items-center gap-4 mt-3">
                <span className={`capitalize bg-gradient-to-r ${selectedProfileConfig.gradient} px-4 py-1.5 rounded-full text-sm font-semibold text-white shadow-lg`}>
                  {selectedProfile.type}
                </span>

                {/* Stats pills */}
                <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                  <Hash size={14} className="text-gray-400" />
                  <span className="text-sm font-medium">{selectedProfile.count} entries</span>
                </div>

                {selectedProfile.average_score > 0 && (
                  <div className="flex items-center gap-2 bg-yellow-500/10 px-3 py-1.5 rounded-full border border-yellow-500/20">
                    <Star size={14} fill="currentColor" className="text-yellow-500" />
                    <span className="text-sm font-medium text-yellow-500">{selectedProfile.average_score} avg</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Entries Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-10">
          {profileEntries.map(entry => (
            <MediaCard key={entry.id} entry={entry} />
          ))}
        </div>
      </div>
    );
  }

  // --- VIEW 2: MAIN LIST ---
  return (
    <div className="space-y-6">
      {/* Header with gradient background effect */}
      <header className="relative">
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
            <ProfileCard
              key={`${profile.type}-${profile.name}-${idx}`}
              profile={profile}
              onClick={handleProfileClick}
            />
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