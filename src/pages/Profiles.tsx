import { useEffect, useState } from "react";
import { Users, ChevronLeft, Star, Hash, Camera } from "lucide-react";
import { open } from '@tauri-apps/plugin-dialog';
import { profilesLogic, type ProfileSummary } from "../lib/profiles-logic";
import type { MediaEntry } from "../lib/db";
import { MediaCard } from "../components/MediaCard";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { getImageUrl } from "../lib/utils"; 

// Filter Options
const TYPES = ["director", "actress", "artist", "author", "platform"];

// --- SUB-COMPONENT: Individual Profile Card for the Grid ---
function ProfileCard({ profile, onClick }: { profile: ProfileSummary, onClick: (p: ProfileSummary) => void }) {
  const [imgSrc, setImgSrc] = useState("");

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
      className="group relative bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:bg-white/10 hover:border-primary/50 transition-all text-left h-24 flex items-center p-3 gap-4"
    >
        {/* Avatar / Image */}
        <div className="h-16 w-16 rounded-full bg-black/30 flex-shrink-0 overflow-hidden border border-white/10">
            {imgSrc ? (
                <img src={imgSrc} className="h-full w-full object-cover" alt={profile.name} />
            ) : (
                <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-white/5 to-white/0">
                    <span className="text-xl font-bold opacity-30 uppercase">{profile.name[0]}</span>
                </div>
            )}
        </div>

        <div className="flex-1 min-w-0">
            <h4 className="font-bold text-lg group-hover:text-primary transition-colors truncate">
                {profile.name}
            </h4>
            <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-400 capitalize">{profile.type}</span>
                <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px] font-bold">
                    {profile.count}
                </span>
            </div>
        </div>
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
  const [selectedTypes, setSelectedTypes] = useState<string[]>(TYPES);
  const [searchQuery, setSearchQuery] = useState("");

  // Initial Load
  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    const data = await profilesLogic.getAllProfiles();
    setProfiles(data);
    setFilteredProfiles(data);
  };

  // Filter Logic
  useEffect(() => {
    let res = profiles;
    
    // Type Filter
    if (selectedTypes.length !== TYPES.length) {
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

  // --- VIEW 1: DETAILS (Drill Down) ---
  if (selectedProfile) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <header className="flex items-center gap-6">
          <button 
            onClick={() => setSelectedProfile(null)}
            className="p-3 hover:bg-white/10 rounded-full transition-colors self-start mt-2"
          >
            <ChevronLeft size={24} />
          </button>

          {/* Profile Image with Edit Button */}
          <div className="relative group">
            <div className="h-24 w-24 rounded-full bg-black/50 overflow-hidden border-2 border-white/10 shadow-xl flex items-center justify-center">
                {headerImgSrc ? (
                    <img src={headerImgSrc} className="h-full w-full object-cover" alt={selectedProfile.name} />
                ) : (
                    <span className="text-3xl font-bold opacity-30 uppercase">{selectedProfile.name[0]}</span>
                )}
            </div>
            
            {/* Edit Overlay */}
            <button 
                onClick={handleUpdateImage}
                className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
                <Camera size={24} className="text-white" />
            </button>
          </div>

          <div>
            <h2 className="text-4xl font-bold">{selectedProfile.name}</h2>
            <div className="flex items-center gap-3 text-gray-400 mt-2">
              <span className="capitalize bg-white/10 px-3 py-1 rounded-full text-xs font-bold tracking-wider">{selectedProfile.type}</span>
              <span className="flex items-center gap-1.5"><Hash size={16}/> {selectedProfile.count} entries</span>
              {selectedProfile.average_score > 0 && (
                <span className="flex items-center gap-1.5 text-yellow-500"><Star size={16} fill="currentColor"/> {selectedProfile.average_score} avg</span>
              )}
            </div>
          </div>
        </header>

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
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <Users className="text-pink-500" />
            Profiles
          </h2>
          <p className="text-gray-400">Discover your most frequent collaborators</p>
        </div>

        <div className="flex items-center gap-3">
          <input 
            type="text"
            placeholder="Search profiles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm w-64 focus:border-primary outline-none"
          />
          <MultiSelectFilter 
            options={TYPES}
            selected={selectedTypes}
            onChange={setSelectedTypes}
            label="Type"
          />
        </div>
      </header>

      {filteredProfiles.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-10">
          {filteredProfiles.map((profile, idx) => (
            <ProfileCard 
                key={`${profile.type}-${profile.name}-${idx}`} 
                profile={profile} 
                onClick={handleProfileClick} 
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 text-gray-500">
            No profiles found matching criteria.
        </div>
      )}
    </div>
  );
}