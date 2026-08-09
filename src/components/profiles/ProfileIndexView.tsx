import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Users } from 'lucide-react';
import type { ProfileSummary, ProfileType } from '../../lib/profiles-logic';
import { ProfileCard } from './ProfileCards';
import {
  PROFILE_FILTER_STORAGE_KEY,
  PROFILE_TYPE_CONFIGS,
  loadPersistedProfileFilters,
} from './profile-config';

interface ProfileIndexViewProps {
  profiles: ProfileSummary[];
  hiddenProfiles: ProfileSummary[];
  onOpenProfile: (profile: ProfileSummary) => void;
  onHideProfile: (profile: ProfileSummary) => Promise<void>;
  onUnhideProfile: (profile: ProfileSummary) => Promise<void>;
}

export function ProfileIndexView({
  profiles,
  hiddenProfiles,
  onOpenProfile,
  onHideProfile,
  onUnhideProfile,
}: ProfileIndexViewProps) {
  const [showHidden, setShowHidden] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<ProfileType[]>(loadPersistedProfileFilters);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    localStorage.setItem(PROFILE_FILTER_STORAGE_KEY, JSON.stringify(selectedTypes));
  }, [selectedTypes]);

  const filteredProfiles = useMemo(() => {
    let result = showHidden ? hiddenProfiles : profiles;
    if (selectedTypes.length !== PROFILE_TYPE_CONFIGS.length) {
      result = result.filter((profile) => selectedTypes.includes(profile.type));
    }
    const query = searchQuery.trim().toLowerCase();
    if (query) result = result.filter((profile) => profile.name.toLowerCase().includes(query));
    return result;
  }, [hiddenProfiles, profiles, searchQuery, selectedTypes, showHidden]);

  const toggleType = (type: ProfileType) => {
    setSelectedTypes((current) => {
      if (!current.includes(type)) return [...current, type];
      return current.length === 1 ? current : current.filter((candidate) => candidate !== type);
    });
  };

  const allTypes = PROFILE_TYPE_CONFIGS.map((config) => config.key);

  return (
    <div className="space-y-6">
      <header className="relative profile-header-enter">
        <div
          className="absolute inset-0 blur-3xl -z-10 opacity-50"
          style={{
            background: 'linear-gradient(to right, color-mix(in srgb, var(--color-primary) 10%, transparent), color-mix(in srgb, var(--color-secondary) 10%, transparent))',
          }}
        />
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2
                className="text-3xl font-bold bg-clip-text text-transparent flex items-center gap-3"
                style={{ backgroundImage: 'linear-gradient(to right, var(--color-primary), var(--color-secondary))' }}
              >
                <div
                  className="p-2 rounded-xl shadow-lg"
                  style={{
                    background: 'linear-gradient(to bottom right, var(--color-primary), var(--color-secondary))',
                    boxShadow: '0 10px 15px -3px color-mix(in srgb, var(--color-primary) 20%, transparent)',
                  }}
                >
                  <Users size={24} style={{ color: 'white' }} />
                </div>
                Profiles
              </h2>
              <p className="text-gray-400 mt-1">
                {showHidden ? "Profiles you've hidden — unhide to restore" : 'Discover your most frequent collaborators'}
              </p>
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Search profiles..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-3 text-sm w-72 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-gray-500"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PROFILE_TYPE_CONFIGS.map((type) => {
              const Icon = type.icon;
              const isActive = selectedTypes.includes(type.key);
              const isOnlySelected = selectedTypes.length === 1 && selectedTypes[0] === type.key;
              return (
                <button
                  key={type.key}
                  onClick={() => toggleType(type.key)}
                  onDoubleClick={() => setSelectedTypes([type.key])}
                  className={`
                    flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm
                    transition-all duration-200
                    ${isActive
                      ? `bg-gradient-to-r ${type.gradient} text-white shadow-lg scale-105`
                      : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 hover:border-white/20'}
                    ${isOnlySelected ? 'ring-2 ring-white/30' : ''}
                  `}
                  title={isActive ? 'Click to toggle off, double-click to select only this' : 'Click to add filter'}
                >
                  <Icon size={16} />
                  <span>{type.label}</span>
                  {isActive && (
                    <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] font-bold">
                      {profiles.filter((profile) => profile.type === type.key).length}
                    </span>
                  )}
                </button>
              );
            })}
            {selectedTypes.length !== PROFILE_TYPE_CONFIGS.length && (
              <button
                onClick={() => setSelectedTypes(allTypes)}
                className="text-gray-400 hover:text-white text-sm underline underline-offset-2 transition-colors ml-2"
              >
                Show All
              </button>
            )}
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

      {filteredProfiles.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-10">
          {filteredProfiles.map((profile, index) => (
            <div
              key={`${profile.type}-${profile.name}-${index}`}
              className="profile-card-enter h-full"
              style={{ animationDelay: `${Math.min(index * 50, 500)}ms` }}
            >
              <ProfileCard
                profile={profile}
                onClick={showHidden ? () => undefined : onOpenProfile}
                onAction={showHidden ? onUnhideProfile : onHideProfile}
                actionLabel={showHidden ? 'Unhide Profile' : 'Hide Profile'}
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
              onClick={() => setSelectedTypes(allTypes)}
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
