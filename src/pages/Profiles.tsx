import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ProfileDetailView } from '../components/profiles/ProfileDetailView';
import { ProfileIndexView } from '../components/profiles/ProfileIndexView';
import { useProfilesPageData } from '../components/profiles/useProfilesPageData';
import type { MediaEntry } from '../lib/db';
import { getProfileKey } from '../lib/profiles-logic';

interface ReturnTo {
  year: string;
  entryId: string;
  entryType: string;
}

export default function ProfilesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [returnTo, setReturnTo] = useState<ReturnTo | null>(null);
  const data = useProfilesPageData();

  useEffect(() => {
    const type = searchParams.get('type');
    const name = searchParams.get('name');
    if (!type || !name || data.profiles.length === 0) return;

    const profile = data.profiles.find((candidate) => candidate.type === type && candidate.name === name);
    if (!profile) return;

    const fromYear = searchParams.get('fromYear');
    const fromEntry = searchParams.get('fromEntry');
    if (fromYear && fromEntry) {
      setReturnTo({
        year: fromYear,
        entryId: fromEntry,
        entryType: searchParams.get('fromType') || '',
      });
    }
    void data.openProfile(profile);
    setSearchParams({}, { replace: true });
  }, [data.openProfile, data.profiles, searchParams, setSearchParams]);

  const handleEntryClick = (entry: MediaEntry) => {
    if (!entry.year_completed) return;
    const params = new URLSearchParams({ highlight: String(entry.id) });
    if (entry.entry_type) params.set('type', entry.entry_type);
    navigate(`/year/${entry.year_completed}?${params.toString()}`);
  };

  const handleBack = () => {
    if (!returnTo) {
      data.closeProfile();
      return;
    }
    const params = new URLSearchParams({ highlight: returnTo.entryId });
    if (returnTo.entryType) params.set('type', returnTo.entryType);
    navigate(`/year/${returnTo.year}?${params.toString()}`);
    setReturnTo(null);
  };

  if (data.selectedProfile) {
    return (
      <ProfileDetailView
        key={getProfileKey(data.selectedProfile)}
        profile={data.selectedProfile}
        allEntries={data.timelineEntries}
        collectionEntries={data.collectionEntries}
        timelineEntries={data.timelineEntries}
        awardsMap={data.awardsMap}
        awardsByYear={data.awardsByYear}
        sortOrder={data.sortOrder}
        onSortOrderChange={data.setSortOrder}
        onBack={handleBack}
        onEntryClick={handleEntryClick}
        onUpdateImage={data.updateProfileImage}
        onUpdateCrop={data.updateProfileCrop}
        onSetAvgHistoryTracking={data.setAvgHistoryTracking}
      />
    );
  }

  return (
    <ProfileIndexView
      profiles={data.profiles}
      hiddenProfiles={data.hiddenProfiles}
      onOpenProfile={(profile) => { void data.openProfile(profile); }}
      onHideProfile={data.hideProfile}
      onUnhideProfile={data.unhideProfile}
    />
  );
}
