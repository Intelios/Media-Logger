import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { awardsLogic } from '../../lib/awards-logic';
import { onEntriesMutated, type MediaEntry } from '../../lib/db';
import {
  profilesLogic,
  type CropData,
  type ProfileIndex,
  type ProfileSummary,
} from '../../lib/profiles-logic';
import { ADULT_MEDIA_VISIBILITY_CHANGED_EVENT } from '../../lib/settings';
import type { MediaAward } from '../MediaCard';
import {
  PROFILE_SORT_ORDER_KEY,
  getProfileSortKey,
  getSortOrderForProfile,
  loadProfileSortOrderMap,
  type ProfileSortOrder,
  type ProfileSortOrderMap,
} from './profile-config';

const EMPTY_INDEX: ProfileIndex = { visible: [], hidden: [] };

function compareCompletionDates(
  left: MediaEntry,
  right: MediaEntry,
  order: ProfileSortOrder,
): number {
  const comparison = (left.completion_date || '').localeCompare(right.completion_date || '');
  return order === 'oldest' ? comparison : -comparison;
}

function sameProfile(left: ProfileSummary, right: ProfileSummary): boolean {
  return left.type === right.type && left.name === right.name;
}

export interface ProfileAwardYearGroup {
  year: number;
  awards: Array<{ entry: MediaEntry; categoryName: string; year: number }>;
}

export function useProfilesPageData() {
  const [profileIndex, setProfileIndex] = useState<ProfileIndex>(EMPTY_INDEX);
  const [selectedProfile, setSelectedProfile] = useState<ProfileSummary | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<MediaEntry[]>([]);
  const [awardsMap, setAwardsMap] = useState<Map<number, MediaAward[]>>(new Map());
  const [sortOrderMap, setSortOrderMap] = useState<ProfileSortOrderMap>(loadProfileSortOrderMap);
  const indexLoadGeneration = useRef(0);
  const selectionGeneration = useRef(0);

  const loadProfileIndex = useCallback(async (): Promise<ProfileIndex> => {
    const generation = ++indexLoadGeneration.current;
    const index = await profilesLogic.getProfileIndex();
    if (indexLoadGeneration.current === generation) setProfileIndex(index);
    return index;
  }, []);

  useEffect(() => {
    void loadProfileIndex().catch((error) => console.error('Failed to load profiles:', error));
    const unsubscribe = onEntriesMutated(() => {
      void loadProfileIndex().catch((error) => console.error('Failed to refresh profiles:', error));
    });
    const handleAdultVisibilityChange = () => {
      void loadProfileIndex().catch((error) => console.error('Failed to refresh profiles:', error));
    };
    window.addEventListener(ADULT_MEDIA_VISIBILITY_CHANGED_EVENT, handleAdultVisibilityChange);
    return () => {
      indexLoadGeneration.current += 1;
      unsubscribe();
      window.removeEventListener(ADULT_MEDIA_VISIBILITY_CHANGED_EVENT, handleAdultVisibilityChange);
    };
  }, [loadProfileIndex]);

  useEffect(() => {
    localStorage.setItem(PROFILE_SORT_ORDER_KEY, JSON.stringify(sortOrderMap));
  }, [sortOrderMap]);

  const openProfile = useCallback(async (profile: ProfileSummary): Promise<void> => {
    const generation = ++selectionGeneration.current;
    setSelectedProfile(profile);
    setSelectedEntries([]);
    setAwardsMap(new Map());
    try {
      const entries = await profilesLogic.getProfileEntries(profile.type, profile.name);
      if (selectionGeneration.current !== generation) return;
      setSelectedEntries(entries);

      const mediaIds = entries.map((entry) => entry.id);
      if (mediaIds.length === 0) return;
      const awards = await awardsLogic.getAwardsForMediaBatch(mediaIds);
      if (selectionGeneration.current === generation) setAwardsMap(awards);
    } catch (error) {
      if (selectionGeneration.current === generation) {
        console.error('Failed to load profile entries:', error);
      }
    }
  }, []);

  const closeProfile = useCallback(() => {
    selectionGeneration.current += 1;
    setSelectedProfile(null);
    setSelectedEntries([]);
    setAwardsMap(new Map());
  }, []);

  const patchProfile = useCallback((profile: ProfileSummary, patch: Partial<ProfileSummary>) => {
    const update = (candidate: ProfileSummary) => (
      sameProfile(candidate, profile) ? { ...candidate, ...patch } : candidate
    );
    setProfileIndex((current) => ({
      visible: current.visible.map(update),
      hidden: current.hidden.map(update),
    }));
    setSelectedProfile((current) => (current && sameProfile(current, profile) ? update(current) : current));
  }, []);

  const hideProfile = useCallback(async (profile: ProfileSummary) => {
    await profilesLogic.hideProfile(profile.type, profile.name);
    await loadProfileIndex();
  }, [loadProfileIndex]);

  const unhideProfile = useCallback(async (profile: ProfileSummary) => {
    await profilesLogic.unhideProfile(profile.type, profile.name);
    await loadProfileIndex();
  }, [loadProfileIndex]);

  const updateProfileImage = useCallback(async (profile: ProfileSummary, sysPath: string) => {
    const imageUrl = await profilesLogic.setProfileImage(profile.type, profile.name, sysPath);
    if (imageUrl) patchProfile(profile, { image_url: imageUrl });
    return imageUrl;
  }, [patchProfile]);

  const updateProfileCrop = useCallback(async (profile: ProfileSummary, crop: CropData) => {
    await profilesLogic.setProfileCrop(profile.type, profile.name, crop);
    patchProfile(profile, { crop });
  }, [patchProfile]);

  const setAvgHistoryTracking = useCallback(async (profile: ProfileSummary, enabled: boolean) => {
    await profilesLogic.setAvgHistoryEnabled(profile.type, profile.name, enabled);
    patchProfile(profile, { track_avg_history: enabled });
  }, [patchProfile]);

  const sortOrder = selectedProfile
    ? getSortOrderForProfile(getProfileSortKey(selectedProfile), sortOrderMap)
    : 'newest';

  const setSortOrder = useCallback((order: ProfileSortOrder) => {
    if (!selectedProfile) return;
    const key = getProfileSortKey(selectedProfile);
    setSortOrderMap((current) => ({ ...current, [key]: order }));
  }, [selectedProfile]);

  const collectionEntries = useMemo(
    () => [...selectedEntries].sort((left, right) => compareCompletionDates(left, right, sortOrder)),
    [selectedEntries, sortOrder],
  );
  const timelineEntries = useMemo(
    () => [...selectedEntries].sort((left, right) => compareCompletionDates(left, right, 'oldest')),
    [selectedEntries],
  );

  const awardsByYear = useMemo<ProfileAwardYearGroup[]>(() => {
    const grouped = new Map<number, ProfileAwardYearGroup['awards']>();
    for (const [entryId, awards] of awardsMap) {
      const entry = selectedEntries.find((candidate) => candidate.id === entryId);
      if (!entry) continue;
      for (const award of awards) {
        const group = grouped.get(award.year) ?? [];
        group.push({ entry, categoryName: award.categoryName, year: award.year });
        grouped.set(award.year, group);
      }
    }
    return [...grouped.entries()]
      .sort(([left], [right]) => right - left)
      .map(([year, awards]) => ({ year, awards }));
  }, [awardsMap, selectedEntries]);

  return {
    profiles: profileIndex.visible,
    hiddenProfiles: profileIndex.hidden,
    selectedProfile,
    selectedEntries,
    collectionEntries,
    timelineEntries,
    awardsMap,
    awardsByYear,
    sortOrder,
    openProfile,
    closeProfile,
    hideProfile,
    unhideProfile,
    updateProfileImage,
    updateProfileCrop,
    setAvgHistoryTracking,
    setSortOrder,
  };
}
