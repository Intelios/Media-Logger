import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  ChevronLeft,
  Clock,
  Crop,
  Flag,
  Flame,
  LayoutGrid,
  Maximize,
  MoreVertical,
  RotateCcw,
  Star,
  Trophy,
  X,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import type { MediaEntry } from '../../lib/db';
import { formatShortDate } from '../../lib/dates';
import { DEFAULT_CROP, type CropData, type ProfileSummary } from '../../lib/profiles-logic';
import { AvgHistoryModal } from '../AvgHistoryModal';
import { useHoverTooltip } from '../HoverTooltip';
import { MediaCard, type MediaAward } from '../MediaCard';
import { CoverImage } from '../CoverImage';
import { VirtualizedCardGrid } from '../VirtualizedCardGrid';
import { AwardCard, TimelineCard } from './ProfileCards';
import { getTypeConfig, type ProfileSortOrder } from './profile-config';
import type { ProfileAwardYearGroup } from './useProfilesPageData';

type ViewMode = 'collection' | 'timeline' | 'awards';

const getMediaEntryKey = (entry: MediaEntry) => entry.id;

interface ProfileDetailViewProps {
  profile: ProfileSummary;
  allEntries: MediaEntry[];
  collectionEntries: MediaEntry[];
  timelineEntries: MediaEntry[];
  awardsMap: Map<number, MediaAward[]>;
  awardsByYear: ProfileAwardYearGroup[];
  sortOrder: ProfileSortOrder;
  onSortOrderChange: (order: ProfileSortOrder) => void;
  onBack: () => void;
  onEntryClick: (entry: MediaEntry) => void;
  onUpdateImage: (profile: ProfileSummary, sysPath: string) => Promise<string | null>;
  onUpdateCrop: (profile: ProfileSummary, crop: CropData) => Promise<void>;
  onSetAvgHistoryTracking: (profile: ProfileSummary, enabled: boolean) => Promise<void>;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function ProfileDetailView({
  profile,
  allEntries,
  collectionEntries,
  timelineEntries,
  awardsMap,
  awardsByYear,
  sortOrder,
  onSortOrderChange,
  onBack,
  onEntryClick,
  onUpdateImage,
  onUpdateCrop,
  onSetAvgHistoryTracking,
}: ProfileDetailViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('collection');
  const [isCropEditing, setIsCropEditing] = useState(false);
  const [draftCrop, setDraftCrop] = useState<CropData>(DEFAULT_CROP);
  const [avgHistoryOpen, setAvgHistoryOpen] = useState(false);
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const [detailMenuPosition, setDetailMenuPosition] = useState({ top: 0, right: 0 });
  const [avgTrackingBusy, setAvgTrackingBusy] = useState(false);
  const { bindTooltip } = useHoverTooltip();
  const cropFrameRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    width: number;
    height: number;
  } | null>(null);
  const detailMenuButtonRef = useRef<HTMLButtonElement>(null);
  const detailMenuDropdownRef = useRef<HTMLDivElement>(null);
  const hasHeaderImage = Boolean(profile.image_url);
  const profileConfig = getTypeConfig(profile.type);
  const activeCrop = isCropEditing ? draftCrop : (profile.crop ?? DEFAULT_CROP);
  const TypeIcon = profileConfig.icon;
  const ratingPct = (profile.average_score / 10) * 100;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const insideButton = detailMenuButtonRef.current?.contains(event.target as Node);
      const insideDropdown = detailMenuDropdownRef.current?.contains(event.target as Node);
      if (!insideButton && !insideDropdown) setDetailMenuOpen(false);
    };
    if (detailMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [detailMenuOpen]);

  const handleDetailMenuClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!detailMenuOpen && detailMenuButtonRef.current) {
      const rect = detailMenuButtonRef.current.getBoundingClientRect();
      setDetailMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setDetailMenuOpen(!detailMenuOpen);
  };

  const handleToggleAvgTracking = async () => {
    setDetailMenuOpen(false);
    setAvgTrackingBusy(true);
    try {
      await onSetAvgHistoryTracking(profile, !profile.track_avg_history);
    } finally {
      setAvgTrackingBusy(false);
    }
  };

  const handleUpdateImage = async () => {
    try {
      const file = await open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      });
      if (typeof file === 'string' && file) await onUpdateImage(profile, file);
    } catch (error) {
      console.error('Failed to update profile image', error);
    }
  };

  const handleEnterCropEdit = () => {
    setDraftCrop(profile.crop ?? DEFAULT_CROP);
    setIsCropEditing(true);
  };
  const handleSaveCrop = async () => {
    await onUpdateCrop(profile, draftCrop);
    setIsCropEditing(false);
  };

  const beginCropDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isCropEditing || draftCrop.fit !== 'cover') return;
    const frame = cropFrameRef.current;
    if (!frame) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: draftCrop.x,
      baseY: draftCrop.y,
      width: frame.clientWidth || 1,
      height: frame.clientHeight || 1,
    };
  };
  const moveCropDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const nextX = clamp(drag.baseX - ((event.clientX - drag.startX) / drag.width) * 100, 0, 100);
    const nextY = clamp(drag.baseY - ((event.clientY - drag.startY) / drag.height) * 100, 0, 100);
    setDraftCrop((current) => ({ ...current, x: nextX, y: nextY }));
  };

  return (
    <>
      <div className="animate-in fade-in duration-500 -mx-6 -mt-6">
        <div className="relative flex flex-col md:flex-row min-h-[340px] overflow-hidden rounded-b-3xl rounded-tl-3xl profile-header-enter">
          {hasHeaderImage ? (
            <CoverImage
              path={profile.image_url}
              variant="hero"
              priority="high"
              alt=""
              showSkeleton={false}
              containerClassName="absolute inset-0"
              imageClassName="h-full w-full scale-110 object-cover opacity-25 blur-2xl"
            />
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${profileConfig.bgGradient}`} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-[#0d0d0d]/70 to-[#0d0d0d]/30" />
          <div className={`absolute inset-0 bg-gradient-to-r ${profileConfig.overlayGradient}`} />

          <button
            onClick={() => {
              setIsCropEditing(false);
              onBack();
            }}
            className="absolute top-6 left-6 p-3 bg-black/40 backdrop-blur-md hover:bg-black/60 rounded-full transition-all border border-white/10 hover:border-white/30 hover:scale-105 z-20"
          >
            <ChevronLeft size={24} />
          </button>

          <div className="absolute top-6 right-6 z-20">
            <button
              ref={detailMenuButtonRef}
              onClick={handleDetailMenuClick}
              {...bindTooltip(
                <span className="text-xs font-medium text-text">Profile settings</span>,
                { width: "content", className: "rounded-lg px-3 py-1.5 whitespace-nowrap" }
              )}
              className="p-3 bg-black/40 backdrop-blur-md hover:bg-black/60 rounded-full transition-all border border-white/10 hover:border-white/30"
            >
              <MoreVertical size={20} className="text-white" />
              <span className="sr-only">Profile settings</span>
            </button>
          </div>
          {detailMenuOpen && createPortal(
            <div
              ref={detailMenuDropdownRef}
              className="fixed w-52 rounded-xl border border-white/20 bg-transparent backdrop-blur-2xl shadow-2xl shadow-black/45 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-[200]"
              style={{
                top: detailMenuPosition.top,
                right: detailMenuPosition.right,
                background: 'color-mix(in srgb, var(--color-surface) 42%, transparent)',
                backdropFilter: 'blur(24px) saturate(170%)',
                WebkitBackdropFilter: 'blur(24px) saturate(170%)',
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                onClick={handleToggleAvgTracking}
                disabled={avgTrackingBusy}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-200 hover:bg-yellow-500/20 hover:text-yellow-400 transition-colors disabled:opacity-50"
              >
                <Activity size={14} />
                <span className="flex-1 text-left">
                  {profile.track_avg_history ? 'Stop tracking AVG' : 'Track AVG history'}
                </span>
                {profile.track_avg_history && <Check size={14} className="text-yellow-400" />}
              </button>
            </div>,
            document.body,
          )}

          <div
            ref={cropFrameRef}
            onPointerDown={beginCropDrag}
            onPointerMove={moveCropDrag}
            onPointerUp={() => { dragStateRef.current = null; }}
            onPointerCancel={() => { dragStateRef.current = null; }}
            className={`relative group w-full md:w-[40%] lg:w-[36%] min-h-[260px] md:min-h-[340px] flex-shrink-0 z-10 overflow-hidden ${isCropEditing && activeCrop.fit === 'cover' ? 'cursor-grab active:cursor-grabbing touch-none select-none' : ''}`}
          >
            {hasHeaderImage ? (
              <CoverImage
                path={profile.image_url}
                variant="hero"
                priority="high"
                draggable={false}
                containerClassName="absolute inset-0"
                imageClassName="h-full w-full"
                imageStyle={{
                  objectFit: activeCrop.fit,
                  objectPosition: `${activeCrop.x}% ${activeCrop.y}%`,
                  transform: activeCrop.fit === 'cover' ? `scale(${activeCrop.scale})` : undefined,
                  transformOrigin: `${activeCrop.x}% ${activeCrop.y}%`,
                }}
                alt={profile.name}
              />
            ) : (
              <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${profileConfig.placeholderGradient}`}>
                <span className="text-8xl font-bold uppercase text-white/80">{profile.name[0]}</span>
              </div>
            )}
            {!isCropEditing && (
              <>
                <div className="absolute inset-0 hidden md:block bg-gradient-to-r from-transparent via-transparent to-[#0d0d0d]/70 pointer-events-none" />
                <div className="absolute inset-x-0 bottom-0 h-24 md:hidden bg-gradient-to-t from-[#0d0d0d]/80 to-transparent pointer-events-none" />
              </>
            )}
            {!isCropEditing && hasHeaderImage && (
              <div className="absolute top-4 right-4 z-10 flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                <button
                  onClick={handleUpdateImage}
                  {...bindTooltip(
                    <span className="text-xs font-medium text-text">Replace image</span>,
                    { width: "content", className: "rounded-lg px-3 py-1.5 whitespace-nowrap" }
                  )}
                  className="p-2.5 rounded-full bg-black/55 hover:bg-black/75 backdrop-blur-md border border-white/15 hover:border-white/30 text-white shadow-lg transition-colors"
                >
                  <Camera size={18} />
                  <span className="sr-only">Replace image</span>
                </button>
                <button
                  onClick={handleEnterCropEdit}
                  {...bindTooltip(
                    <span className="text-xs font-medium text-text">Adjust crop</span>,
                    { width: "content", className: "rounded-lg px-3 py-1.5 whitespace-nowrap" }
                  )}
                  className="p-2.5 rounded-full bg-black/55 hover:bg-black/75 backdrop-blur-md border border-white/15 hover:border-white/30 text-white shadow-lg transition-colors"
                >
                  <Crop size={18} />
                  <span className="sr-only">Adjust crop</span>
                </button>
              </div>
            )}
            {!isCropEditing && !hasHeaderImage && (
              <button
                onClick={handleUpdateImage}
                className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer backdrop-blur-sm"
              >
                <Camera size={36} className="text-white" />
                <span className="sr-only">Add profile image</span>
              </button>
            )}
            {isCropEditing && activeCrop.fit === 'cover' && (
              <div className="absolute top-4 right-4 z-20 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[11px] text-white/90 font-medium pointer-events-none">
                Drag to reposition
              </div>
            )}
            {isCropEditing && (
              <div
                onPointerDown={(event) => event.stopPropagation()}
                className="absolute inset-x-0 bottom-0 z-20 p-4 flex flex-col gap-3 bg-gradient-to-t from-black/90 via-black/70 to-transparent"
              >
                {activeCrop.fit === 'cover' && (
                  <div className="flex items-center gap-3">
                    <span className="w-12 text-[11px] uppercase tracking-wider text-gray-300 font-semibold">Zoom</span>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.05}
                      value={draftCrop.scale}
                      onChange={(event) => setDraftCrop((current) => ({ ...current, scale: parseFloat(event.target.value) }))}
                      className="flex-1 accent-white cursor-pointer"
                    />
                    <span className="w-10 text-right text-xs text-gray-200 font-medium">{draftCrop.scale.toFixed(1)}x</span>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={draftCrop.fit === 'contain'}
                    onChange={(event) => setDraftCrop((current) => ({ ...current, fit: event.target.checked ? 'contain' : 'cover' }))}
                    className="accent-white cursor-pointer"
                  />
                  <Maximize size={14} /> Fit whole image (no crop)
                </label>
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setDraftCrop(DEFAULT_CROP)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-medium transition-colors"
                  >
                    <RotateCcw size={14} /> Reset
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsCropEditing(false)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-medium transition-colors"
                    >
                      <X size={14} /> Cancel
                    </button>
                    <button
                      onClick={handleSaveCrop}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r ${profileConfig.badgeGradient} text-white text-xs font-bold shadow-lg ${profileConfig.badgeShadow} transition-transform hover:scale-105`}
                    >
                      <Check size={14} /> Save
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="relative z-10 flex-1 min-w-0 p-8 md:p-10 flex flex-col justify-center gap-4">
            <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] ${profileConfig.accentColor}`}>
              <TypeIcon size={15} className={profileConfig.iconColor} />
              <span>{profileConfig.label}</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold leading-[1.05] break-words bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300">
              {profile.name}
            </h1>
            <div className="flex items-stretch gap-6 mt-2">
              <div className="flex flex-col">
                <span className="text-3xl md:text-4xl font-bold text-white tabular-nums leading-none">{profile.count}</span>
                <span className="mt-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-400">Entries</span>
              </div>
              {profile.average_score > 0 && (() => {
                const AvgCell = profile.track_avg_history ? 'button' : 'div';
                return (
                  <>
                    <div className="w-px self-stretch bg-white/10" />
                    <AvgCell
                      {...(profile.track_avg_history
                        ? { onClick: () => setAvgHistoryOpen(true), title: 'View AVG rating history' }
                        : {})}
                      className={`group flex flex-col flex-1 max-w-xs text-left ${profile.track_avg_history ? 'cursor-pointer rounded-lg -m-1.5 p-1.5 transition-colors hover:bg-yellow-400/5' : ''}`}
                    >
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl md:text-4xl font-bold text-white tabular-nums leading-none">{profile.average_score}</span>
                        <span className="text-sm font-medium text-gray-500">/10</span>
                        <Star size={16} className="self-center text-yellow-400" fill="currentColor" />
                        {profile.track_avg_history && <Activity size={14} className="self-center text-yellow-400/70 transition-colors group-hover:text-yellow-400" />}
                      </div>
                      <div className="mt-2 flex items-center gap-2.5">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-400 whitespace-nowrap">Avg Rating</span>
                        <div className="relative flex-1">
                          <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                            <div
                              className={`relative h-full rounded-full bg-gradient-to-r ${profileConfig.barGradient}`}
                              style={{ width: `${ratingPct}%`, animation: 'profile-bar-grow 900ms cubic-bezier(0.16,1,0.3,1)' }}
                            >
                              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-transparent to-white/25" />
                            </div>
                          </div>
                          <div
                            className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                            style={{
                              left: `${ratingPct}%`,
                              boxShadow: '0 0 6px 1px rgba(255,255,255,0.75)',
                              animation: 'profile-bar-cap 900ms cubic-bezier(0.16,1,0.3,1)',
                            }}
                          />
                        </div>
                      </div>
                    </AvgCell>
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="px-6 mt-10 mb-6">
          <div className="flex items-center justify-center gap-2">
            <div className={`h-px flex-1 bg-gradient-to-r from-transparent ${profileConfig.dividerGradient}`} />
            <div className="flex items-center gap-1 p-1 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
              {([
                ['collection', LayoutGrid, 'Collection'],
                ['timeline', Clock, 'Timeline'],
                ['awards', Trophy, 'Awards'],
              ] as const).map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${viewMode === mode ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                  {viewMode === mode && (
                    <motion.span
                      layoutId="profile-view-active"
                      className={`absolute inset-0 rounded-lg bg-gradient-to-r ${profileConfig.badgeGradient} text-white shadow-lg`}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon size={16} className="relative z-10" />
                  <span className="relative z-10">{label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 p-1 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
              {([
                ['oldest', ArrowUp, 'Oldest'],
                ['newest', ArrowDown, 'Newest'],
              ] as const).map(([order, Icon, label]) => (
                <button
                  key={order}
                  onClick={() => onSortOrderChange(order)}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${sortOrder === order ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                  {sortOrder === order && (
                    <motion.span
                      layoutId="profile-sort-active"
                      className={`absolute inset-0 rounded-lg bg-gradient-to-r ${profileConfig.badgeGradient} text-white shadow-lg`}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon size={14} className="relative z-10" />
                  <span className="relative z-10">{label}</span>
                </button>
              ))}
            </div>
            <div className={`h-px flex-1 bg-gradient-to-l from-transparent ${profileConfig.dividerGradient}`} />
          </div>
        </div>

        {viewMode === 'collection' ? (
          <div className="px-6">
            <VirtualizedCardGrid
              items={collectionEntries}
              getItemKey={getMediaEntryKey}
              columns={{ base: 2, sm: 3, md: 4, lg: 5, xl: 6 }}
              gap={16}
              estimatedRowHeight={420}
              className="pb-10"
              ariaLabel={`${profile.name} collection`}
              renderItem={(entry, index) => (
                <div
                  className={`${index % 5 === 0 ? 'row-span-1' : ''} transform hover:scale-[1.02] transition-transform duration-200`}
                  style={{ animationDelay: `${Math.min(index * 50, 300)}ms`, animation: 'fadeInUp 0.4s ease-out forwards', opacity: 0 }}
                >
                  <MediaCard
                    entry={entry}
                    imagePriority={index < 10 ? 'high' : 'auto'}
                    awards={awardsMap.get(entry.id)}
                    dateEmphasis="prominent"
                    dateAccentClass={profileConfig.color}
                    dateTintClass={profileConfig.surfaceTintClass}
                  />
                </div>
              )}
            />
          </div>
        ) : viewMode === 'timeline' ? (
          <div className="px-6 pb-10">
            <div className="mb-8 text-center">
              <p className="text-gray-400 text-sm">
                Your journey with <span className={`${profileConfig.color} font-medium`}>{profile.name}</span> — from first discovery to latest experience
              </p>
            </div>
            <div className="relative max-w-2xl mx-auto space-y-3">
              {timelineEntries.map((entry, index) => (
                <TimelineCard
                  key={entry.id}
                  entry={entry}
                  index={index}
                  isFirst={index === 0}
                  isLast={index === timelineEntries.length - 1}
                  onClick={onEntryClick}
                  surfaceTint={profileConfig.surfaceTintClass}
                  railColor={profileConfig.railColor}
                />
              ))}
            </div>
            {timelineEntries.length > 0 && (
              <div className="mt-10 text-center">
                <div className="inline-flex items-center gap-3 px-6 py-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl">
                  <div className="flex items-center gap-1 text-green-400">
                    <Flag size={14} />
                    <span className="text-xs font-medium">{formatShortDate(timelineEntries[0]?.completion_date)}</span>
                  </div>
                  <span className="text-gray-500">→</span>
                  <div className="flex items-center gap-1 text-rose-400">
                    <Flame size={14} />
                    <span className="text-xs font-medium">{formatShortDate(timelineEntries[timelineEntries.length - 1]?.completion_date)}</span>
                  </div>
                  <span className="text-gray-500 mx-2">|</span>
                  <span className="text-gray-400 text-xs">{timelineEntries.length} entries total</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="px-6 pb-10">
            {awardsByYear.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Trophy size={48} className="text-gray-600 mb-4" />
                <p className="text-gray-400 text-lg font-medium">No Awards Yet</p>
                <p className="text-gray-500 text-sm mt-1">
                  Entries from <span className={`${profileConfig.color} font-medium`}>{profile.name}</span> haven't received any awards
                </p>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-8">
                <div className="text-center mb-8">
                  <p className="text-gray-400 text-sm">
                    <span className={`${profileConfig.color} font-medium`}>{profile.name}</span>'s award-winning entries
                  </p>
                </div>
                {awardsByYear.map(({ year, awards }) => (
                  <div key={year}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`h-px flex-1 bg-gradient-to-r from-transparent ${profileConfig.dividerGradient}`} />
                      <span className={`text-sm font-bold bg-gradient-to-r ${profileConfig.badgeGradient} bg-clip-text text-transparent`}>{year}</span>
                      <div className={`h-px flex-1 bg-gradient-to-l from-transparent ${profileConfig.dividerGradient}`} />
                    </div>
                    <div className="space-y-3">
                      {awards.map((item, index) => (
                        <AwardCard
                          key={`${item.entry.id}-${item.categoryName}-${index}`}
                          entry={item.entry}
                          categoryName={item.categoryName}
                          profileConfig={profileConfig}
                          index={index}
                          onClick={onEntryClick}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>

      <AvgHistoryModal
        isOpen={avgHistoryOpen}
        profile={profile}
        entries={allEntries}
        onClose={() => setAvgHistoryOpen(false)}
      />
    </>
  );
}
