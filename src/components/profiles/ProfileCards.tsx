import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Flag, Flame, Hash, MoreVertical, Star, Trophy, type LucideIcon } from 'lucide-react';
import type { MediaEntry } from '../../lib/db';
import type { ProfileSummary } from '../../lib/profiles-logic';
import { useImageUrl } from '../../lib/utils';
import { MediaListCard } from '../MediaListCard';
import { getTypeConfig, type ProfileTypeConfig } from './profile-config';

export function TimelineCard({
  entry,
  index,
  isFirst,
  isLast,
  onClick,
  surfaceTint,
  railColor,
}: {
  entry: MediaEntry;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onClick: (entry: MediaEntry) => void;
  surfaceTint?: string;
  railColor?: string;
}) {
  const lineColor = railColor || 'bg-rose-500/30';
  const rail = (
    <div className="relative w-4 flex-shrink-0 self-stretch">
      {!isFirst && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 w-0.5 ${lineColor}`}
          style={{ bottom: '50%', height: 'calc(50% + 0.375rem)' }}
        />
      )}
      <div
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-4 h-4 rounded-full border-2 ${
          isFirst
            ? 'bg-green-500 border-green-400 shadow-lg shadow-green-500/50'
            : isLast
              ? 'bg-rose-500 border-rose-400 shadow-lg shadow-rose-500/50'
              : 'bg-gray-700 border-gray-500'
        }`}
      >
        {(isFirst || isLast) && (
          <div
            className="absolute inset-0 rounded-full animate-ping opacity-30"
            style={{ backgroundColor: isFirst ? '#22c55e' : '#f43f5e' }}
          />
        )}
      </div>
      {!isLast && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 w-0.5 ${lineColor}`}
          style={{ top: '50%', height: 'calc(50% + 0.375rem)' }}
        />
      )}
    </div>
  );
  const cornerBadge = isFirst ? (
    <div className="flex items-center gap-1 bg-green-500/90 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg backdrop-blur-sm">
      <Flag size={12} />
      <span>First</span>
    </div>
  ) : isLast ? (
    <div className="flex items-center gap-1 bg-rose-500/90 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg backdrop-blur-sm">
      <Flame size={12} />
      <span>Latest</span>
    </div>
  ) : null;
  const indexLabel = (
    <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
      <span className="text-xs font-bold text-gray-400">#{index + 1}</span>
    </div>
  );
  return (
    <MediaListCard
      entry={entry}
      index={index}
      onClick={onClick}
      leadingRail={rail}
      cornerBadge={cornerBadge}
      indexLabel={indexLabel}
      surfaceTint={surfaceTint}
    />
  );
}

export function AwardCard({
  entry,
  categoryName,
  profileConfig,
  index,
  onClick,
}: {
  entry: MediaEntry;
  categoryName: string;
  profileConfig: ProfileTypeConfig;
  index: number;
  onClick: (entry: MediaEntry) => void;
}) {
  const accentBadge = (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${profileConfig.badgeGradient} shadow-lg ${profileConfig.badgeShadow}`}>
      <Trophy size={14} className="text-white" />
      <span className="text-white text-xs font-bold whitespace-nowrap">{categoryName}</span>
    </div>
  );
  return (
    <MediaListCard
      entry={entry}
      index={index}
      onClick={onClick}
      accentBadge={accentBadge}
      surfaceTint={profileConfig.surfaceTintClass}
    />
  );
}

export function ProfileCard({
  profile,
  onClick,
  onAction,
  actionLabel,
  ActionIcon,
}: {
  profile: ProfileSummary;
  onClick: (profile: ProfileSummary) => void;
  onAction: (profile: ProfileSummary) => void;
  actionLabel: string;
  ActionIcon: LucideIcon;
}) {
  const imgSrc = useImageUrl(profile.image_url, '', { variant: 'thumbnail' });
  const typeConfig = getTypeConfig(profile.type);
  const TypeIcon = typeConfig.icon;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const insideButton = menuRef.current?.contains(event.target as Node);
      const insideDropdown = menuDropdownRef.current?.contains(event.target as Node);
      if (!insideButton && !insideDropdown) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleMenuClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!menuOpen && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setMenuOpen(!menuOpen);
  };

  return (
    <div className="group relative h-full">
      <button
        onClick={() => onClick(profile)}
        className={`relative bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-sm border ${typeConfig.borderColor} rounded-2xl overflow-hidden hover:border-white/25 transition-all duration-300 text-left h-32 w-full flex items-stretch hover:scale-[1.02] hover:shadow-2xl ${typeConfig.shadowColor}`}
      >
        {imgSrc && (
          <>
            <div className="media-list-card-blur" style={{ backgroundImage: `url("${imgSrc}")` }} />
            <div className="media-list-card-overlay" />
          </>
        )}
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={profile.name}
            className="relative z-[2] w-28 h-full min-h-0 flex-shrink-0 self-stretch object-cover object-center"
            style={profile.crop ? { objectPosition: `${profile.crop.x}% ${profile.crop.y}%` } : undefined}
          />
        ) : (
          <div className={`relative z-[2] w-28 flex-shrink-0 self-stretch flex items-center justify-center bg-gradient-to-br ${typeConfig.placeholderGradient}`}>
            <span className="text-3xl font-bold uppercase text-white/90">{profile.name[0]}</span>
          </div>
        )}
        <div className="relative z-[2] flex-1 min-w-0 flex flex-col justify-center px-4 py-3 pr-8">
          <h4 className="font-semibold text-lg group-hover:text-white transition-colors truncate">{profile.name}</h4>
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
                {profile.track_avg_history && <Activity size={10} className="text-yellow-400/70" />}
              </div>
            )}
          </div>
        </div>
        <div className={`absolute inset-0 z-[3] bg-gradient-to-r ${typeConfig.gradient} opacity-0 group-hover:opacity-5 transition-opacity pointer-events-none`} />
      </button>
      <div className="absolute top-2 right-2 z-20" ref={menuRef}>
        <button
          ref={menuButtonRef}
          onClick={handleMenuClick}
          className={`p-1.5 bg-black/50 backdrop-blur-sm rounded-full transition-all hover:bg-black/70 ${menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
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
            background: 'color-mix(in srgb, var(--color-surface) 42%, transparent)',
            backdropFilter: 'blur(24px) saturate(170%)',
            WebkitBackdropFilter: 'blur(24px) saturate(170%)',
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen(false);
              onAction(profile);
            }}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm ${actionLabel === 'Hide Profile' ? 'text-red-400 hover:bg-red-500/15' : 'text-green-400 hover:bg-green-500/15'} transition-colors`}
          >
            <ActionIcon size={14} />
            <span>{actionLabel}</span>
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
