import { useEffect, useState } from "react";
import { Users, ChevronLeft, Star, Hash } from "lucide-react";
import { profilesLogic, type ProfileSummary } from "../lib/profiles-logic";
import type { MediaEntry } from "../lib/db";
import { MediaCard } from "../components/MediaCard";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { cn } from "../lib/utils_ui";

// Filter Options
const TYPES = ["director", "actress", "artist", "author", "platform"];

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [filteredProfiles, setFilteredProfiles] = useState<ProfileSummary[]>([]);
  
  // Navigation State
  const [selectedProfile, setSelectedProfile] = useState<ProfileSummary | null>(null);
  const [profileEntries, setProfileEntries] = useState<MediaEntry[]>([]);
  
  // Filters
  const [selectedTypes, setSelectedTypes] = useState<string[]>(TYPES);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    profilesLogic.getAllProfiles().then(data => {
      setProfiles(data);
      setFilteredProfiles(data); // Initial set
    });
  }, []);

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

  // Handle drill-down
  const handleProfileClick = async (profile: ProfileSummary) => {
    setSelectedProfile(profile);
    const entries = await profilesLogic.getProfileDetails(profile.type, profile.name);
    setProfileEntries(entries);
  };

  // --- VIEW 1: DETAILS (Drill Down) ---
  if (selectedProfile) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <header className="flex items-center gap-4">
          <button 
            onClick={() => setSelectedProfile(null)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h2 className="text-3xl font-bold">{selectedProfile.name}</h2>
            <div className="flex items-center gap-3 text-gray-400 mt-1">
              <span className="capitalize bg-white/10 px-2 py-0.5 rounded text-sm">{selectedProfile.type}</span>
              <span>•</span>
              <span className="flex items-center gap-1"><Hash size={14}/> {selectedProfile.count} entries</span>
              <span>•</span>
              <span className="flex items-center gap-1"><Star size={14}/> {selectedProfile.average_score} avg</span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredProfiles.map((profile, idx) => (
          <button
            key={`${profile.type}-${profile.name}-${idx}`}
            onClick={() => handleProfileClick(profile)}
            className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center justify-between hover:bg-white/10 hover:border-primary/50 transition-all group text-left"
          >
            <div>
              <h4 className="font-bold text-lg group-hover:text-primary transition-colors line-clamp-1">
                {profile.name}
              </h4>
              <p className="text-xs text-gray-400 capitalize">{profile.type}</p>
            </div>
            
            <div className="flex flex-col items-end gap-1">
              <span className="bg-white/10 px-2 py-1 rounded-md text-xs font-bold">
                {profile.count}
              </span>
              {profile.average_score > 0 && (
                <span className="text-xs text-yellow-500 font-medium flex items-center gap-0.5">
                  <Star size={10} fill="currentColor" />
                  {profile.average_score}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}