import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { EntryForm } from '../components/EntryForm';
import { ProfileDetailView } from '../components/profiles/ProfileDetailView';
import { ProfileIndexView } from '../components/profiles/ProfileIndexView';
import { useProfilesPageData } from '../components/profiles/useProfilesPageData';
import { dbService, type MediaEntry } from '../lib/db';
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
  const [editingEntry, setEditingEntry] = useState<MediaEntry | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
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

  // Profile refresh after these mutations is automatic: the entries-mutated
  // subscription in useProfilesPageData reconciles the open profile.
  const handleEditFromCard = (entry: MediaEntry) => {
    setEditingEntry(entry);
    setEditModalOpen(true);
  };

  const handleDuplicateFromCard = (entry: MediaEntry) => {
    setEditingEntry({
      ...entry,
      id: undefined as unknown as number,
      is_rewatch: 1,
      completion_date: null,
    });
    setEditModalOpen(true);
  };

  const handleEditSave = async (editData: Partial<MediaEntry>) => {
    if (!editingEntry) return;
    if (editingEntry.id) {
      await dbService.updateEntry({ ...editingEntry, ...editData } as MediaEntry);
    } else {
      await dbService.addEntry(editData as Omit<MediaEntry, 'id'>);
    }
    setEditModalOpen(false);
    setEditingEntry(null);
  };

  const handleDeleteFromCard = async (id: number) => {
    await dbService.deleteEntry(id);
  };

  if (data.selectedProfile) {
    return (
      <>
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
          onEdit={handleEditFromCard}
          onDelete={handleDeleteFromCard}
          onDuplicate={handleDuplicateFromCard}
          onUpdateImage={data.updateProfileImage}
          onUpdateCrop={data.updateProfileCrop}
          onSetAvgHistoryTracking={data.setAvgHistoryTracking}
        />
        <EntryForm
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          onSave={handleEditSave}
          initialData={editingEntry}
        />
      </>
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
