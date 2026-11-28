import { Fragment, useContext, useMemo, type ReactNode } from "react";
import { Calendar, Captions, Check, Clock, Puzzle, RotateCcw, Trophy } from "lucide-react";
import type { EntryCardSummary, MediaEntry } from "../lib/db";
import { useCoverPalette } from "../lib/cover-palette";
import { coverFramingStyle, framedCoverSizing, parseCoverFraming } from "../lib/cover-framing";
import { FALLBACK_ACCENT, FALLBACK_SHADOW, TOP_SCRIM, scrimGradient } from "../lib/poster-scrims";
import { CardLightContext, LIGHT_FROM, syncGlowPhase } from "../lib/card-light";
import { cn } from "../lib/utils_ui";
import { formatDate } from "../lib/dates";
import {
  formatCardRating,
  getRatingHex,
  getReplayTerm,
  getTypeAccentClass,
  getTypeBadgeStyle,
  parseGenres,
} from "../lib/media-config";
import { useHoverTooltip } from "./HoverTooltip";
import { CoverImage, type CoverPriority } from "./CoverImage";
import { PosterActionSheet, type PosterMenuAction } from "./PosterActionSheet";
import type { MediaAward, MediaCardContextItem } from "./MediaCard";

// Layout for MediaCard: the cover fills a 2:3 card and the details sit on a
// scrim tinted with the cover's own palette shadow. MediaCard owns state, the
// actions and dialogs; this component is layout, and hands the actions to the
// in-card sheet with the palette they are drawn in.
//
// 2:3 is a minimum, not a fixed size: when a narrow grid leaves the details
// more height than the poster has, the card grows rather than clipping them.

/** Polished silver: the holo sweep reads best against a neutral metal. */
const PLATINUM_FRAME = "linear-gradient(135deg, #f8fafc 0%, #a5b4c8 22%, #f1f5f9 40%, #7c8aa0 58%, #e2e8f0 76%, #b8c4d6 100%)";
const PERFECT_FRAME = "linear-gradient(135deg, #34d399, #a7f3d0 50%, #10b981)";
const PLATINUM_CHIP = "linear-gradient(100deg, #fbbf24, #fde68a 35%, #a5f3fc 65%, #67e8f9)";
/** Unfilled part of the score ring, laid over the solid palette shadow. */
const RING_TRACK = "rgba(255, 255, 255, 0.2)";

const ELEVATION_SHADOW = {
  platinum: "0 30px 60px rgba(0, 0, 0, 0.42), 0 12px 26px rgba(30, 41, 59, 0.3), 0 0 54px rgba(226, 232, 240, 0.2), 0 0 84px rgba(196, 181, 253, 0.14)",
  perfect: "0 30px 60px rgba(0, 0, 0, 0.42), 0 12px 26px rgba(6, 78, 59, 0.26), 0 0 58px rgba(52, 211, 153, 0.22)",
  default: "0 26px 54px rgba(0, 0, 0, 0.38), 0 10px 22px rgba(0, 0, 0, 0.24), 0 0 36px color-mix(in srgb, var(--color-primary) 18%, transparent)",
};

/** One per side; each swells in turn (index.css staggers them). */
const PERFECT_SWELLS = ["perfect-swell-top", "perfect-swell-right", "perfect-swell-bottom", "perfect-swell-left"] as const;

/** Light a neighbouring 10/10 casts on this card, by the direction it comes
 *  from. Sides take a rim, a spill and a swell; corners a dimmer rim and spill. */
const CARD_LIGHT = [
  { bit: LIGHT_FROM.left, className: "card-light-edge card-light-from-left", edge: true },
  { bit: LIGHT_FROM.right, className: "card-light-edge card-light-from-right", edge: true },
  { bit: LIGHT_FROM.top, className: "card-light-edge card-light-from-top", edge: true },
  { bit: LIGHT_FROM.bottom, className: "card-light-edge card-light-from-bottom", edge: true },
  { bit: LIGHT_FROM.topLeft, className: "card-light-corner card-light-from-top-left", edge: false },
  { bit: LIGHT_FROM.topRight, className: "card-light-corner card-light-from-top-right", edge: false },
  { bit: LIGHT_FROM.bottomLeft, className: "card-light-corner card-light-from-bottom-left", edge: false },
  { bit: LIGHT_FROM.bottomRight, className: "card-light-corner card-light-from-bottom-right", edge: false },
] as const;

const SMALL_TOOLTIP = { width: "content" as const, className: "rounded-lg px-3 py-1.5 whitespace-nowrap" };

interface MediaCardPosterProps {
  entry: MediaEntry | EntryCardSummary;
  awards: MediaAward[];
  contextInfo: MediaCardContextItem[];
  profileKeys?: Set<string>;
  imagePriority: CoverPriority;
  topLeftActions?: ReactNode;
  /** The ⋯ menu's actions, shown on the card's own face when open. */
  actions: PosterMenuAction[];
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  dateEmphasis: "default" | "prominent";
  dateAccentClass?: string;
  dateTintClass?: string;
  onOpenProfile: (profileType: string, name: string) => void;
  onNavigateToParent?: (parentEntryId: number, parentName: string) => void;
}

export function MediaCardPoster({
  entry,
  awards,
  contextInfo,
  profileKeys,
  imagePriority,
  topLeftActions,
  actions,
  menuOpen,
  onMenuOpenChange,
  dateEmphasis,
  dateAccentClass,
  dateTintClass,
  onOpenProfile,
  onNavigateToParent,
}: MediaCardPosterProps) {
  const { bindTooltip } = useHoverTooltip();
  // Null until extracted, and for coverless entries: the neutral scrim stands in.
  const palette = useCoverPalette(entry.image_url);
  const lightFrom = useContext(CardLightContext);
  // The user's framing for this cover (focal point and zoom); null is centred.
  const framing = useMemo(() => parseCoverFraming(entry.cover_framing), [entry.cover_framing]);
  const coverSizing = framedCoverSizing(framing);
  const incomingLight = lightFrom === 0 ? [] : CARD_LIGHT.filter(({ bit }) => (lightFrom & bit) !== 0);
  const typeBadge = getTypeBadgeStyle(entry.entry_type);
  const genres = parseGenres(entry.genre);
  const isGameEntry = (entry.entry_type || "").toLowerCase().includes("game");
  const hasPlatinum = isGameEntry && entry.is_platinum === 1;
  const isEarlyAccess = isGameEntry && entry.is_early_access === 1;
  const isExpansion = isGameEntry && entry.is_expansion === 1;
  const expansionCount = typeof entry.expansion_count === "number" ? entry.expansion_count : 0;
  const hasExpansions = isGameEntry && expansionCount > 0;
  const isRewatch = entry.is_rewatch === 1;
  const hasLocalCopy = entry.own_local_copy === 1;
  const hasSubtitles = entry.has_subtitles === 1;
  const hasAwards = awards.length > 0;
  const replayTerm = getReplayTerm(entry.entry_type).label;

  const score = entry.review_score ?? null;
  const perfectTen = score === 10;
  const special = hasPlatinum || perfectTen;
  const shadow = palette?.shadow ?? FALLBACK_SHADOW;
  const ringGlow = perfectTen ? "0 0 14px rgba(52, 211, 153, 0.7)" : "0 4px 12px rgba(0, 0, 0, 0.45)";
  const awardLabel = awards.length > 1 ? `${awards.length} awards` : awards[0]?.categoryName;
  const hasFooter = Boolean(entry.completion_date) || hasExpansions || isRewatch || hasLocalCopy || hasSubtitles;

  return (
    <div
      className={cn(
        "group relative cursor-pointer rounded-2xl transition-transform duration-200 ease-out motion-safe:hover:-translate-y-1.5",
        special ? "p-[2px]" : "bg-white/10 p-px",
      )}
      style={special ? { background: hasPlatinum ? PLATINUM_FRAME : PERFECT_FRAME } : undefined}
    >
      {/* Glow behind the frame. A Platinum 10/10 keeps the 10/10 glow; its
          face carries the Platinum foil. The energy saver pauses both
          (index.css), and reduced motion stills them. */}
      {perfectTen ? (
        <>
          <div aria-hidden className="perfect-aura pointer-events-none absolute -inset-[3px] -z-10 rounded-[20px]" />
          <div ref={syncGlowPhase} aria-hidden className="perfect-bloom pointer-events-none absolute -inset-[3px] -z-10 rounded-[20px]" />
        </>
      ) : hasPlatinum ? (
        <div aria-hidden className="platinum-aura pointer-events-none absolute -inset-[3px] -z-10 rounded-[20px]" />
      ) : null}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100"
        style={{ boxShadow: hasPlatinum ? ELEVATION_SHADOW.platinum : perfectTen ? ELEVATION_SHADOW.perfect : ELEVATION_SHADOW.default }}
      />
      {/* Light in the 2px frame: these cover the whole card, but the article
          paints over everything inside the frame. */}
      {perfectTen && PERFECT_SWELLS.map((side) => (
        <div key={side} ref={syncGlowPhase} aria-hidden className={cn("perfect-swell pointer-events-none absolute inset-0 rounded-2xl", side)} />
      ))}
      {hasPlatinum && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="platinum-sweep platinum-sweep-shine" />
        </div>
      )}
      {/* A neighbouring 10/10's light catching the frame on the side facing it */}
      {incomingLight.map(({ className }) => (
        <div
          key={className}
          ref={syncGlowPhase}
          aria-hidden
          className={cn("card-light-rim card-light-breathe pointer-events-none absolute inset-0 rounded-2xl", className)}
        />
      ))}

      <article
        className={cn(
          "relative flex aspect-[2/3] flex-col justify-end transition-colors duration-500",
          special ? "rounded-[14px]" : "rounded-[15px]",
        )}
        style={{ backgroundColor: shadow }}
      >
        {/* Art and scrims are clipped on their own layer so the article itself
            can grow past 2:3 when the details need the room. */}
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
          style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
        >
          {/* The hover zoom lives on the wrapper so it stacks on the framing's
              own transform instead of replacing it. */}
          <CoverImage
            path={entry.image_url}
            variant={coverSizing.variant}
            sizes={coverSizing.sizes}
            priority={imagePriority}
            alt={entry.name}
            containerClassName="absolute inset-0 transition-transform duration-300 group-hover:scale-105"
            imageClassName="h-full w-full object-cover"
            imageStyle={coverFramingStyle(framing)}
          />

          {/* Scrims. The palette layer fades in over the neutral one, so a late
              palette never snaps a whole row of cards to new colours. */}
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: TOP_SCRIM }} />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 transition-opacity duration-500"
            style={{ background: scrimGradient(FALLBACK_SHADOW), opacity: palette ? 0 : 1 }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 transition-opacity duration-500"
            style={{ background: palette ? scrimGradient(palette.shadow) : "none", opacity: palette ? 1 : 0 }}
          />
          {/* ...and spilling across the art, above the scrims and beneath the text */}
          {incomingLight.map(({ className, edge }) => (
            <Fragment key={className}>
              <div ref={syncGlowPhase} aria-hidden className={cn("card-light-face card-light-breathe pointer-events-none absolute inset-0", className)} />
              {edge && (
                <div ref={syncGlowPhase} aria-hidden className={cn("card-light-face card-light-swell pointer-events-none absolute inset-0", className)} />
              )}
            </Fragment>
          ))}
          {/* Platinum foil: above the art and scrims, beneath the text. */}
          {hasPlatinum && (
            <>
              <div aria-hidden className="platinum-foil pointer-events-none absolute inset-0" />
              <div aria-hidden className="platinum-sweep platinum-sweep-holo" />
            </>
          )}
        </div>

        {/* Top left: platinum and awards own the corner; a host page's own
            controls (Collections' hover buttons, the picker's selection
            marker) follow as one row beneath them, so controls that are
            invisible until hover never push the chips out of place. */}
        {(hasPlatinum || hasAwards || topLeftActions) && (
          // Stops short of the score ring, so on a narrow card a long award
          // name truncates instead of running underneath it.
          <div
            className={cn(
              "absolute left-2.5 top-2.5 z-20 flex flex-col items-start gap-1.5 transition-[opacity,visibility] duration-150",
              score !== null ? "right-[58px]" : "right-2.5",
              menuOpen && "invisible opacity-0",
            )}
          >
            {hasPlatinum && (
              <div
                {...bindTooltip(
                  <span className="text-xs font-medium text-cyan-200">Platinum / 100% Completed</span>,
                  { ...SMALL_TOOLTIP, style: { borderColor: "color-mix(in srgb, #67e8f9 40%, var(--color-border))" } },
                )}
              >
                <span
                  className="relative inline-flex items-center gap-[5px] overflow-hidden rounded-full px-[9px] py-1 text-[9.5px] font-extrabold tracking-[0.08em] text-slate-900 shadow-[0_4px_14px_rgba(34,211,238,0.35)]"
                  style={{ background: PLATINUM_CHIP }}
                >
                  <Trophy size={11} strokeWidth={2.25} />
                  PLATINUM
                  {/* Catches the same sweep as the foil */}
                  <span aria-hidden className="platinum-sweep platinum-sweep-shine" />
                </span>
              </div>
            )}
            {hasAwards && (
              <div
                className="max-w-full"
                {...bindTooltip(
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                      <Trophy size={12} />
                      <span>Awards Won</span>
                    </div>
                    <ul className="space-y-1">
                      {awards.map((award, i) => (
                        <li key={i} className="text-xs text-gray-200">
                          {award.categoryName}
                          {award.creditedPerson && <span className="text-gray-400"> — {award.creditedPerson}</span>}
                          <span className="ml-1 text-amber-400/70">({award.year})</span>
                        </li>
                      ))}
                    </ul>
                  </div>,
                  {
                    width: 192,
                    className: "rounded-xl p-3",
                    style: { borderColor: "color-mix(in srgb, #f59e0b 30%, var(--color-border))" },
                  },
                )}
              >
                <span className="inline-flex max-w-[min(150px,100%)] cursor-pointer items-center gap-[5px] rounded-full bg-amber-400 px-[9px] py-1 text-[10px] font-bold text-amber-950 shadow-[0_4px_14px_rgba(245,158,11,0.4)]">
                  <Trophy size={11} strokeWidth={2.25} className="shrink-0" />
                  <span className="truncate">{awardLabel}</span>
                </span>
              </div>
            )}
            {topLeftActions && <div className="flex items-center gap-1.5">{topLeftActions}</div>}
          </div>
        )}

        {/* Score ring: fills to the score in the rating colour. Unscored entries
            show nothing, as on the classic card — unscored isn't always unrated.
            The ring sits on a solid disc of the palette shadow, so the unfilled
            track is a dim tint of that colour rather than see-through to the art,
            and reads the same on busy or bright covers. */}
        {score !== null && (
          <div
            role="img"
            aria-label={`Score ${formatCardRating(score)} out of 10`}
            className="absolute right-2.5 top-2.5 z-40 h-[38px] w-[38px] rounded-full p-[3px] transition-colors duration-500"
            style={{
              backgroundColor: shadow,
              backgroundImage: `conic-gradient(${getRatingHex(score)} 0% ${score * 10}%, ${RING_TRACK} ${score * 10}% 100%)`,
              boxShadow: `0 0 0 2px ${shadow}, ${ringGlow}`,
            }}
          >
            <div
              className="flex h-full w-full items-center justify-center rounded-full text-sm font-extrabold tabular-nums text-white transition-colors duration-500"
              style={{ backgroundColor: shadow }}
            >
              {formatCardRating(score)}
            </div>
          </div>
        )}

        {/* The ⋯ trigger parks beside the score ring (in the corner when the
            entry is unscored); when open, the sheet covers the card's face
            beneath the ring and trigger. */}
        <PosterActionSheet
          entryName={entry.name}
          actions={actions}
          open={menuOpen}
          onOpenChange={onMenuOpenChange}
          shadow={shadow}
          accent={palette?.accent ?? FALLBACK_ACCENT}
          anchorClass={score !== null ? "top-[15px] right-[56px]" : "top-2.5 right-2.5"}
        />

        {/* Keeps the corner chips' and score ring's band clear when a narrow
            card has to grow to fit its details. */}
        <div aria-hidden className="h-14 shrink-0" />

        {/* Details */}
        {/* Steps aside while the action sheet is open, so only the art shows
            through it rather than ghosted text. */}
        <div
          className={cn(
            "relative z-10 flex flex-col gap-1.5 p-3.5 transition-[opacity,visibility] duration-150",
            menuOpen && "invisible opacity-0",
          )}
        >
          <div className={cn("flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em]", getTypeAccentClass(entry.entry_type))}>
            {typeBadge.icon}
            <span className="truncate">{entry.entry_type}</span>
          </div>

          <h3 className="line-clamp-2 text-lg font-extrabold leading-[1.15] tracking-[-0.01em] text-white">
            {entry.name}
          </h3>

          {/* Bylines: "by Author", "on Platform", "with Actress", "from Studio".
              The lead word is muted and the names are white; names with a
              profile page link to it. */}
          {contextInfo.map((info, infoIdx) => (
            info.badgeClass ? (
              <p key={infoIdx} className="flex items-center gap-1 text-xs font-semibold leading-snug text-emerald-400">
                {info.icon}
                <span>{info.value}</span>
              </p>
            ) : (
              <p key={infoIdx} className="line-clamp-2 text-xs leading-snug text-white/60">
                {info.lead && <span className="mr-1">{info.lead}</span>}
                {info.value.split(",").map((item) => item.trim()).filter(Boolean).map((name, i) => {
                  const profileType = info.profileType;
                  const hasProfile = profileType !== null && Boolean(profileKeys?.has(`${profileType}:${name}`));
                  return (
                    <Fragment key={`${name}-${i}`}>
                      {i > 0 && ", "}
                      {hasProfile ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenProfile(profileType, name);
                          }}
                          className="font-semibold text-white underline-offset-2 hover:underline"
                        >
                          {name}
                        </button>
                      ) : (
                        <span className="font-semibold text-white">{name}</span>
                      )}
                    </Fragment>
                  );
                })}
              </p>
            )
          ))}

          {isExpansion && (
            entry.parent_name ? (
              <button
                type="button"
                {...bindTooltip(<span>Jump to base game card in Year View</span>, SMALL_TOOLTIP)}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (entry.parent_entry_id != null && entry.parent_name && onNavigateToParent) {
                    onNavigateToParent(entry.parent_entry_id, entry.parent_name);
                  }
                }}
                className="inline-flex w-fit max-w-full items-center gap-[5px] text-left text-[11px] font-semibold text-sky-300 hover:underline"
              >
                <Puzzle size={11} className="shrink-0" />
                <span className="truncate">Expansion for {entry.parent_name}</span>
              </button>
            ) : (
              <p className="flex items-center gap-[5px] text-[11px] font-semibold text-sky-300">
                <Puzzle size={11} className="shrink-0" />
                <span>Expansion / DLC</span>
              </p>
            )
          )}

          {isEarlyAccess && (
            <p className="flex items-center gap-[5px] text-[11px] font-semibold text-violet-300">
              <Clock size={11} className="shrink-0" />
              <span className="truncate">
                Early Access{entry.early_access_version ? `: ${entry.early_access_version}` : ""}
              </span>
            </p>
          )}

          {genres.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {genres.slice(0, 3).map((genre, i) => (
                <span key={i} className="rounded-md bg-white/[0.14] px-[7px] py-[3px] text-[10px] font-medium text-white/90">
                  {genre}
                </span>
              ))}
              {genres.length > 3 && (
                <div
                  className="flex"
                  {...bindTooltip(
                    <div>
                      <div className="mb-2 text-xs font-semibold text-text-muted">More Genres</div>
                      <div className="flex flex-wrap gap-1.5">
                        {genres.slice(3).map((genre, i) => (
                          <span key={i} className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-text">
                            {genre}
                          </span>
                        ))}
                      </div>
                    </div>,
                    { width: "content", className: "min-w-[120px] rounded-xl p-3" },
                  )}
                >
                  <span className="cursor-pointer rounded-md border border-white/20 px-[7px] py-[3px] text-[10px] font-semibold text-white/75 transition-colors hover:text-white">
                    +{genres.length - 3}
                  </span>
                </div>
              )}
            </div>
          )}

          {hasFooter && (
            // Wraps rather than squeezing: on a narrow card the flag glyphs drop
            // to their own right-aligned line and the date stays on one line.
            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-t border-white/[0.14] pt-[9px]">
              {dateEmphasis === "prominent" && entry.completion_date ? (
                // Profiles: the date is what you scan for, so it is louder and
                // tinted with the profile's own accent.
                <span
                  className={cn(
                    "inline-flex min-w-0 items-center gap-1.5 rounded-md border border-white/10 bg-gradient-to-r px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                    dateTintClass || "from-primary/15 to-primary/5",
                    dateAccentClass || "text-primary",
                  )}
                >
                  <Calendar size={11} className="shrink-0" />
                  <span className="truncate">{formatDate(entry.completion_date)}</span>
                </span>
              ) : (
                <span className="whitespace-nowrap text-[11px] font-medium tabular-nums text-white/75">
                  {formatDate(entry.completion_date)}
                </span>
              )}
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {hasExpansions && (
                  <button
                    type="button"
                    {...bindTooltip(
                      <span>{expansionCount} expansion{expansionCount === 1 ? "" : "s"} logged for this game</span>,
                      SMALL_TOOLTIP,
                    )}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Host pages own the modal; this event opens it.
                      window.dispatchEvent(new CustomEvent("media:open-expansions", {
                        detail: { parentId: entry.id, parentName: entry.name },
                      }));
                    }}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-300 transition-colors hover:text-sky-200"
                  >
                    <Puzzle size={12} />
                    <span>{expansionCount} DLC</span>
                  </button>
                )}
                {isRewatch && (
                  <span
                    role="img"
                    aria-label={replayTerm}
                    className="inline-flex text-amber-400"
                    {...bindTooltip(<span className="text-xs font-medium text-amber-400">{replayTerm}</span>, SMALL_TOOLTIP)}
                  >
                    <RotateCcw size={14} />
                  </span>
                )}
                {hasLocalCopy && (
                  <span
                    role="img"
                    aria-label="Own local copy"
                    className="inline-flex text-emerald-400"
                    {...bindTooltip(<span className="text-xs font-medium text-emerald-400">Own Local Copy</span>, SMALL_TOOLTIP)}
                  >
                    <Check size={14} strokeWidth={2.25} />
                  </span>
                )}
                {hasSubtitles && (
                  <span
                    role="img"
                    aria-label="Subtitles"
                    className="inline-flex text-orange-400"
                    {...bindTooltip(<span className="text-xs font-medium text-orange-400">Subtitles</span>, SMALL_TOOLTIP)}
                  >
                    <Captions size={14} />
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
