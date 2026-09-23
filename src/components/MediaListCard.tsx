import { useMemo, type ReactNode } from "react";
import { Star, Calendar, RotateCcw, Captions, Trophy, Clock, Puzzle } from "lucide-react";
import type { MediaEntry } from "../lib/db";
import { cn } from "../lib/utils_ui";
import { formatCardRating, getRatingColor, getReplayTerm, getTypeBadgeStyle, parseGenres } from "../lib/media-config";
import { formatDate, getYearsAgo } from "../lib/dates";
import { useHoverTooltip } from "./HoverTooltip";
import { CoverImage } from "./CoverImage";
import type { MediaAward } from "./MediaCard";
import { createMediaUrl, useImageServiceStatus } from "../lib/image-service";

interface MediaListCardProps {
  entry: MediaEntry;
  onClick?: (entry: MediaEntry) => void;
  index?: number;
  showYearsAgo?: boolean;
  /** Awards won by the entry — renders the gold trophy pill in the trailing slot. */
  awards?: MediaAward[];
  /** Right-side slot: prominent accent (e.g. profile award pill). Takes priority over awards/indexLabel. */
  accentBadge?: ReactNode;
  /** Right-side slot: small index indicator (e.g. timeline "#N"). Used when no accentBadge. */
  indexLabel?: ReactNode;
  /** Top-right overlay slot (e.g. milestone "First"/"Latest" badge). */
  cornerBadge?: ReactNode;
  /** Decorative element rendered to the left of the card (e.g. timeline line+node). */
  leadingRail?: ReactNode;
  /** Tailwind gradient color classes applied as a subtle surface tint (e.g. "from-blue-500/10 to-cyan-500/5"). */
  surfaceTint?: string;
}

/**
 * Compact horizontal "ambient blur" card for the dashboard vertical lists.
 * A crisp cover sits on the left while the same image bleeds across the card
 * as a soft blurred wash that fades into the surface — no hard box edges.
 *
 * Optional slots let the same card identity be reused on the Profiles page
 * (Timeline & Awards) without altering the dashboard appearance.
 */
export function MediaListCard({
  entry,
  onClick,
  index = 0,
  showYearsAgo = false,
  awards = [],
  accentBadge,
  indexLabel,
  cornerBadge,
  leadingRail,
  surfaceTint,
}: MediaListCardProps) {
  const { bindTooltip } = useHoverTooltip();
  const yearsAgo = showYearsAgo ? getYearsAgo(entry.completion_date) : null;
  const service = useImageServiceStatus();
  // Same `small` variant the thumbnail loads, so the ambient wash is a cache hit.
  const washSrc = useMemo(
    () => createMediaUrl(entry.image_url, "small"),
    [entry.image_url, service?.protocolBase, service?.generation]
  );
  const typeBadge = getTypeBadgeStyle(entry.entry_type);
  const genres = parseGenres(entry.genre).slice(0, 2);
  const hasScore = entry.review_score !== null && entry.review_score !== undefined;

  const isGameEntry = (entry.entry_type || "").toLowerCase().includes("game");
  const hasPlatinum = isGameEntry && entry.is_platinum === 1;
  const isEarlyAccess = isGameEntry && entry.is_early_access === 1;
  const isExpansion = isGameEntry && entry.is_expansion === 1;
  const isRewatch = entry.is_rewatch === 1;
  const hasSubtitles = entry.has_subtitles === 1;

  // Gold trophy pill — same award identity as MediaCard, scaled for the list row.
  const awardBadge = awards.length > 0 ? (
    <div
      {...bindTooltip(
        <div>
          <div className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
            <Trophy size={12} />
            <span>Awards Won</span>
          </div>
          <ul className="space-y-1">
            {awards.map((award, i) => (
              <li key={i} className="text-xs text-gray-200">
                {award.categoryName}
                <span className="text-amber-400/70 ml-1">({award.year})</span>
              </li>
            ))}
          </ul>
        </div>,
        {
          width: 192,
          className: "rounded-xl p-3",
          style: { borderColor: "color-mix(in srgb, #f59e0b 30%, var(--color-border))" },
        }
      )}
    >
      <div className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full shadow-lg shadow-amber-500/30">
        <Trophy size={12} className="text-white fill-white/20" />
        {awards.length > 1 && (
          <span className="text-[10px] font-bold text-white leading-none">{awards.length}</span>
        )}
      </div>
    </div>
  ) : null;

  const trailingAccent = accentBadge ?? awardBadge;
  const hasTrailingSlot = Boolean(trailingAccent ?? indexLabel);
  const interactive = Boolean(onClick);
  const card = (
    <div
      onClick={interactive ? () => onClick?.(entry) : undefined}
      className={cn("media-list-card motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-0.5", interactive && "media-list-card-interactive")}
      style={{ animationDelay: `${Math.min(index * 0.05, 0.3)}s` }}
    >
      {/* Ambient blurred wash of the cover, fading out across the card */}
      {washSrc && (
        <div className="media-list-card-blur" style={{ backgroundImage: `url("${washSrc}")` }} />
      )}
      <div className="media-list-card-overlay" />

      {/* Optional profile-color surface tint (sits above overlay, below content) */}
      {surfaceTint && (
        <div className={cn("media-list-card-tint bg-gradient-to-br", surfaceTint)} aria-hidden="true" />
      )}

      {/* Cover thumbnail — uniform left section, image zoomed to fill (cover + center) */}
      <CoverImage
        path={entry.image_url}
        variant="small"
        alt={entry.name}
        priority="auto"
        containerClassName="media-list-card-thumb"
        imageClassName="h-full w-full object-cover object-center"
      />

      {/* Optional top-right overlay badge (milestone) */}
      {cornerBadge && (
        <div className="media-list-card-corner">{cornerBadge}</div>
      )}

      {/* Content */}
      <div className={cn("media-list-card-body", hasTrailingSlot && "pr-2")}>
        {/* Line 1: name (+ rating on dashboard, where no corner badge competes for the top-right) */}
        <div className="flex items-center gap-2">
          <h4 className="flex-1 min-w-0 truncate font-semibold text-sm text-gray-100">
            {entry.name}
          </h4>
          {hasScore && !leadingRail && !trailingAccent && (
            <span
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm shrink-0",
                getRatingColor(entry.review_score)
              )}
            >
              <Star size={9} className="fill-current" />
              {formatCardRating(entry.review_score!)}
            </span>
          )}
        </div>

        {/* Line 2: type badge + genres + status (+ rating when a leading rail is present) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] text-white font-semibold shadow-sm",
              typeBadge.bg
            )}
          >
            {typeBadge.icon}
            <span>{entry.entry_type}</span>
          </span>
          {genres.map((g, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 bg-white/10 rounded text-[9px] text-gray-300 font-medium"
            >
              {g}
            </span>
          ))}
          {hasPlatinum && (
            <span
              {...bindTooltip(
                <span className="text-xs font-medium text-cyan-200">Platinum / 100%</span>,
                { width: "content", className: "rounded-lg px-3 py-1.5 whitespace-nowrap" }
              )}
              className="w-4 h-4 rounded-full bg-gradient-to-br from-amber-400/30 to-cyan-400/30 border border-cyan-300 flex items-center justify-center"
            >
              <Trophy size={9} className="text-cyan-100" />
            </span>
          )}
          {isRewatch && (
            <span
              {...bindTooltip(
                <span className="text-xs font-medium text-amber-400">{getReplayTerm(entry.entry_type).label}</span>,
                { width: "content", className: "rounded-lg px-3 py-1.5 whitespace-nowrap" }
              )}
              className="w-4 h-4 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center"
            >
              <RotateCcw size={9} className="text-amber-500" />
            </span>
          )}
          {hasSubtitles && (
            <span
              {...bindTooltip(
                <span className="text-xs font-medium text-orange-400">Subtitles</span>,
                { width: "content", className: "rounded-lg px-3 py-1.5 whitespace-nowrap" }
              )}
              className="w-4 h-4 rounded-full bg-orange-500/20 border border-orange-500 flex items-center justify-center"
            >
              <Captions size={9} className="text-orange-400" />
            </span>
          )}
          {isEarlyAccess && (
            <span
              {...bindTooltip(
                <span className="text-xs font-medium text-violet-400">
                  Early Access{entry.early_access_version ? `: ${entry.early_access_version}` : ""}
                </span>,
                { width: "content", className: "rounded-lg px-3 py-1.5 whitespace-nowrap" }
              )}
              className="w-4 h-4 rounded-full bg-violet-500/20 border border-violet-500 flex items-center justify-center"
            >
              <Clock size={9} className="text-violet-400" />
            </span>
          )}
          {isExpansion && (
            <span
              {...bindTooltip(
                <span className="text-xs font-medium text-sky-400">
                  {entry.parent_name ? `Expansion for: ${entry.parent_name}` : 'Expansion / DLC'}
                </span>,
                { width: "content", className: "rounded-lg px-3 py-1.5 whitespace-nowrap" }
              )}
              className="w-4 h-4 rounded-full bg-sky-500/20 border border-sky-500 flex items-center justify-center"
            >
              <Puzzle size={9} className="text-sky-400" />
            </span>
          )}
          {hasScore && (leadingRail || trailingAccent) && (
            <span
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold shadow-sm shrink-0",
                getRatingColor(entry.review_score)
              )}
            >
              <Star size={9} className="fill-current" />
              {formatCardRating(entry.review_score!)}
            </span>
          )}
        </div>

        {/* Line 3: date */}
        {entry.completion_date && (
          <div className="flex items-center gap-1 text-[10px] text-gray-400">
            <Calendar size={10} />
            <span>{formatDate(entry.completion_date)}</span>
            {yearsAgo !== null && yearsAgo >= 1 && (
              <span className="ml-0.5 text-gray-500">· {yearsAgo} {yearsAgo === 1 ? 'year' : 'years'} ago</span>
            )}
          </div>
        )}
      </div>

      {/* Trailing slot: accent badge (profile award pill), award trophy pill, or index label (timeline #N) */}
      {hasTrailingSlot && (
        <div className="media-list-card-trailing">
          {trailingAccent ?? indexLabel}
        </div>
      )}
    </div>
  );

  if (!leadingRail) return card;

  // With a leading rail (timeline line+node), wrap in a flex row.
  return (
    <div className="media-list-card-row">
      {leadingRail}
      {card}
    </div>
  );
}
