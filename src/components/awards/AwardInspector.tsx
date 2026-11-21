import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Calendar,
  Check,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import type { MediaEntry } from "../../lib/db";
import {
  CREDITED_PERSON_MAX_LENGTH,
  withCreditedPerson,
  type TemplateWinnerHistory,
} from "../../lib/awards-logic";
import { useCoverPalettes } from "../../lib/cover-palette";
import { formatDateNoYear } from "../../lib/dates";
import { formatCardRating, getRatingTextColor, parseGenres } from "../../lib/media-config";
import { cn } from "../../lib/utils_ui";
import { AutocompleteInput } from "../AutocompleteInput";
import { CoverImage } from "../CoverImage";
import { TooltipDetail, TooltipTitle, useHoverTooltip } from "../HoverTooltip";
import { AWARD_FOCUS_RING } from "./AwardRow";

/** What the inspector needs to know about the award it is showing. */
export interface InspectorAward {
  categoryId: number;
  year: number;
  name: string;
  entryType: string | null;
  templateId: number | null;
  winner: MediaEntry | null;
  /** The award asks for a person with each winner (template switch). */
  creditsPerson: boolean;
  /** The winner's credited person; null when none. */
  creditedPerson: string | null;
}

interface AwardInspectorProps {
  award: InspectorAward | null;
  /**
   * `year` — award name in the gold label, every-year strip, remove button.
   * `detail` — year in the gold label, no every-year strip, no remove button.
   */
  mode: "year" | "detail";
  /** Other awards in `alsoWonYear` handed to the same winner. */
  alsoWon: string[];
  alsoWonYear: number;
  /** Full template history, newest first. Only used in `year` mode. */
  history?: TemplateWinnerHistory[];
  onChangeWinner: (award: InspectorAward) => void;
  onRemove?: (award: InspectorAward) => void;
  onSelectHistoryYear?: (year: number, templateId: number) => void;
  /** Names credited before, for the inline name editor's suggestions. */
  creditSuggestions?: string[];
  /** Save (or clear, with null) the winner's credited person. Rejects on failure. */
  onSaveCreditedPerson?: (award: InspectorAward, name: string | null) => Promise<void>;
  /** Flip the award's "Credit a person" switch (applies to every year). */
  onToggleCreditsPerson?: (award: InspectorAward, enabled: boolean) => void;
}

const EMPTY_SUGGESTIONS: string[] = [];

const TOOLTIP_OPTIONS = {
  width: "content",
  className: "rounded-lg px-3 py-1.5 whitespace-nowrap",
} as const;

interface Chip {
  key: string;
  icon?: ReactNode;
  text: string;
  color?: string;
}

/**
 * Height of the panel's artwork stage. The stage is fixed so selecting another
 * award never shifts the title and actions, while the print inside keeps its
 * own proportions — a wide key-art banner and a tall poster both fit whole.
 */
const STAGE_HEIGHT = 238;
const PRINT_MAX_HEIGHT = 204;

/**
 * The credited person under the winner's title. The name opens an inline
 * editor (with suggestions from earlier credits); without a name it offers an
 * "Add a name" pill. Saving an empty field clears the credit.
 */
function CreditedPersonLine({
  name,
  suggestions,
  onSave,
}: {
  name: string | null;
  suggestions: string[];
  onSave?: (name: string | null) => Promise<void>;
}) {
  const { bindTooltip } = useHoverTooltip();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setDraft(name ?? "");
    setEditing(true);
  };

  if (editing && onSave) {
    const submit = async (event: FormEvent) => {
      event.preventDefault();
      if (saving) return;
      setSaving(true);
      try {
        const trimmed = draft.trim();
        await onSave(trimmed.length > 0 ? trimmed : null);
        setEditing(false);
      } catch {
        // The page shows the error toast; keep the editor open so the typed
        // name isn't lost.
      } finally {
        setSaving(false);
      }
    };

    return (
      <form
        onSubmit={(event) => void submit(event)}
        onKeyDown={(event) => {
          // An Escape that only closed the suggestion list arrives handled.
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.preventDefault();
            setEditing(false);
          }
        }}
        className="mt-3 flex items-center gap-1.5"
      >
        <div className="min-w-0 flex-1">
          <AutocompleteInput
            value={draft}
            onChange={setDraft}
            suggestions={suggestions}
            autoFocus
            maxLength={CREDITED_PERSON_MAX_LENGTH}
            ariaLabel="Credited person"
            placeholder="e.g. Cillian Murphy"
            className={cn(
              "h-9 w-full rounded-[9px] border border-white/10 bg-black/30 px-3 text-[13.5px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#d6ab5c]/50",
              AWARD_FOCUS_RING
            )}
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          aria-label="Save name"
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[#d6ab5c] text-[#1d150a] transition-colors hover:bg-[#e0b76b] disabled:opacity-50",
            AWARD_FOCUS_RING
          )}
        >
          <Check size={15} />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label="Cancel"
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-white/10 text-white/50 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white",
            AWARD_FOCUS_RING
          )}
        >
          <X size={15} />
        </button>
      </form>
    );
  }

  if (name) {
    const label = (
      <>
        <UserRound size={14} className="shrink-0 text-[#d6ab5c]" />
        <span className="min-w-0 break-words text-[16px] font-semibold leading-snug text-[#f0d391]">
          {name}
        </span>
      </>
    );
    if (!onSave) {
      return <div className="mt-2 flex items-center justify-center gap-1.5">{label}</div>;
    }
    return (
      <div className="mt-2 flex justify-center">
        <button
          type="button"
          onClick={startEditing}
          aria-label={`Credited person: ${name}. Edit`}
          {...bindTooltip(<span>Edit name</span>, TOOLTIP_OPTIONS)}
          className={cn(
            "group inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-white/[0.06]",
            AWARD_FOCUS_RING
          )}
        >
          {label}
          <Pencil
            size={12}
            className="shrink-0 text-white/25 transition-colors group-hover:text-[#f0d391]"
          />
        </button>
      </div>
    );
  }

  if (!onSave) return null;
  return (
    <div className="mt-3 flex justify-center">
      <button
        type="button"
        onClick={startEditing}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-[#d6ab5c]/35 px-3 text-[12px] font-medium text-[#d6ab5c]/85 transition-colors hover:border-[#d6ab5c]/60 hover:bg-[#d6ab5c]/[0.08] hover:text-[#f0d391]",
          AWARD_FOCUS_RING
        )}
      >
        <Plus size={12} />
        Add a name
      </button>
    </div>
  );
}

/**
 * The right-hand award inspector: a large cover tinted by its own palette, the
 * winning entry's details, and the award's history. Sticky inside the page
 * scroll so the selection stays readable while the year list moves.
 */
export function AwardInspector({
  award,
  mode,
  alsoWon,
  alsoWonYear,
  history,
  onChangeWinner,
  onRemove,
  onSelectHistoryYear,
  creditSuggestions = EMPTY_SUGGESTIONS,
  onSaveCreditedPerson,
  onToggleCreditsPerson,
}: AwardInspectorProps) {
  const { bindTooltip } = useHoverTooltip();
  const winner = award?.winner ?? null;
  const winnerPath = winner?.image_url ?? null;
  const palettes = useCoverPalettes(winnerPath ? [winnerPath] : []);
  const palette = winnerPath ? palettes.get(winnerPath) : undefined;

  // The "card" srcSet advertises fixed widths, so for a source smaller than
  // those the browser reports a density-shrunk intrinsic size. A print has to
  // keep its own proportions, so measure the ratio off the decoded file and
  // size the stage from that instead.
  const [printRatio, setPrintRatio] = useState<number | null>(null);
  useEffect(() => {
    setPrintRatio(null);
  }, [winnerPath]);
  const printWidth = printRatio
    ? `min(100%, ${Math.round(PRINT_MAX_HEIGHT * printRatio)}px)`
    : "100%";

  if (!award) return null;

  const tint = palette
    ? `linear-gradient(to bottom, color-mix(in srgb, ${palette.base} 55%, transparent), transparent 62%)`
    : "linear-gradient(to bottom, rgba(255,255,255,0.045), transparent 62%)";

  const creator = winner
    ? winner.author || winner.artist || winner.director
    : null;
  const contextChips: Chip[] = [];
  if (creator) contextChips.push({ key: "creator", text: creator });
  if (winner?.platform) contextChips.push({ key: "platform", text: winner.platform });

  const dateChip: Chip | null =
    winner?.completion_date
      ? {
          key: "date",
          icon: <Calendar size={12} />,
          text: formatDateNoYear(winner.completion_date),
        }
      : null;
  const scoreChip: Chip | null =
    winner?.review_score != null
      ? {
          key: "score",
          icon: <Star size={12} className="fill-current" />,
          text: formatCardRating(winner.review_score),
          color: getRatingTextColor(winner.review_score),
        }
      : null;

  // Genres ride in the same pill row as the platform and date: they describe
  // the winner, so they belong with its facts rather than in a section of
  // their own.
  const chips: Chip[] = [
    ...contextChips,
    ...(winner ? parseGenres(winner.genre) : []).map((genre, index) => ({
      key: `genre-${index}`,
      text: genre,
    })),
    ...(dateChip ? [dateChip] : []),
    ...(scoreChip ? [scoreChip] : []),
  ];

  const recentYears = mode === "year" ? (history ?? []).slice(0, 6).reverse() : [];
  const label = mode === "detail" ? String(award.year) : award.name;

  const actions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChangeWinner(award)}
        className={cn(
          "inline-flex h-[38px] flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#d6ab5c] text-[13px] font-semibold text-[#1d150a] transition-colors hover:bg-[#e0b76b]",
          AWARD_FOCUS_RING
        )}
      >
        <RefreshCw size={14} />
        {winner ? "Change winner" : "Choose winner"}
      </button>
      {onToggleCreditsPerson && (
        <button
          type="button"
          onClick={() => onToggleCreditsPerson(award, !award.creditsPerson)}
          disabled={award.templateId == null}
          aria-pressed={award.creditsPerson}
          aria-label="Credit a person"
          {...bindTooltip(
            award.templateId == null ? (
              <TooltipDetail>This award has no template, so it can't credit a person.</TooltipDetail>
            ) : award.creditsPerson ? (
              <>
                <TooltipTitle>Credits a person</TooltipTitle>
                <TooltipDetail>
                  Asks who won with each winner, in every year of this award. Turning it
                  off hides names but keeps them.
                </TooltipDetail>
              </>
            ) : (
              <>
                <TooltipTitle>Credit a person</TooltipTitle>
                <TooltipDetail>
                  Name who won alongside the entry, like the actor for Best Actor. Applies to
                  every year of this award.
                </TooltipDetail>
              </>
            ),
            { width: 250, className: "rounded-xl px-3 py-2" }
          )}
          className={cn(
            "inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] border transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            award.creditsPerson
              ? "border-[#d6ab5c]/45 bg-[#d6ab5c]/[0.12] text-[#f0d391] hover:border-[#d6ab5c]/65 hover:bg-[#d6ab5c]/[0.18]"
              : "border-white/10 text-white/45 hover:border-white/20 hover:bg-white/[0.06] hover:text-white",
            AWARD_FOCUS_RING
          )}
        >
          <UserRound size={15} />
        </button>
      )}
      {mode === "year" && onRemove && (
        <button
          type="button"
          onClick={() => onRemove(award)}
          aria-label="Remove award"
          {...bindTooltip(
            <span>{`Remove this award from ${award.year}`}</span>,
            TOOLTIP_OPTIONS
          )}
          className={cn(
            "inline-flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-white/10 text-white/45 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400",
            AWARD_FOCUS_RING
          )}
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );

  return (
    <aside className="h-full min-h-0 w-[300px] xl:w-[360px]">
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#17141b]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: tint }}
        />

        <div
          key={award.categoryId}
          className="award-inspector-fade custom-scrollbar relative z-[1] min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-5"
        >
          {winner ? (
            <>
              <div className="flex w-full items-center justify-center" style={{ height: STAGE_HEIGHT }}>
                <CoverImage
                  path={winner.image_url}
                  alt={winner.name}
                  variant="card"
                  priority="high"
                  sizes="320px"
                  containerClassName="flex items-center justify-center"
                  containerStyle={{ width: printWidth }}
                  imageClassName="h-auto w-full rounded-[6px] object-contain shadow-[0_22px_40px_-16px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.08]"
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                      setPrintRatio(image.naturalWidth / image.naturalHeight);
                    }
                  }}
                />
              </div>

              <div className="mt-5 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-[#d6ab5c]">
                <Trophy size={13} className="shrink-0" />
                <span className="truncate">{label}</span>
              </div>

              <h2 className="mt-2 min-w-0 break-words text-center text-[25px] font-bold leading-[1.1] tracking-tight text-white">
                {winner.name}
              </h2>

              {award.creditsPerson && (
                <CreditedPersonLine
                  name={award.creditedPerson}
                  suggestions={creditSuggestions}
                  onSave={
                    onSaveCreditedPerson
                      ? (name) => onSaveCreditedPerson(award, name)
                      : undefined
                  }
                />
              )}

              {chips.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                  {chips.map((chip) => (
                    <span
                      key={chip.key}
                      className={cn(
                        "inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-black/30 px-2.5 text-xs",
                        chip.color ?? "text-white/80"
                      )}
                    >
                      {chip.icon}
                      <span className="truncate">{chip.text}</span>
                    </span>
                  ))}
                </div>
              )}

              {alsoWon.length > 0 && (
                <p className="mt-3.5 text-center text-[12.5px] leading-snug text-white/40">
                  Also won{" "}
                  <span className="font-semibold text-white/70">{alsoWon.join(", ")}</span>{" "}
                  in {alsoWonYear}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex w-full items-center justify-center" style={{ height: STAGE_HEIGHT }}>
                <div className="flex h-[200px] w-[150px] items-center justify-center rounded-[7px] border-[1.5px] border-dashed border-white/[0.18] bg-white/[0.02] text-white/25">
                  <Plus size={24} />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-[#d6ab5c]">
                <Trophy size={13} className="shrink-0" />
                <span className="truncate">{label}</span>
              </div>
              <p className="mt-2 text-center text-[15px] font-medium text-white/40">
                No winner yet
              </p>
              {award.creditsPerson && (
                <p className="mt-1.5 flex items-center justify-center gap-1 text-[12px] text-white/35">
                  <UserRound size={12} className="shrink-0" />
                  Credits a person with the winner
                </p>
              )}
            </>
          )}

          {mode === "year" && recentYears.length > 0 && (
            <div className="mt-5 border-t border-white/5 pt-4">
              <p className="text-[12px] font-medium text-white/40">Every year</p>
              <div className="mt-2.5 grid grid-cols-6 gap-1.5">
                {recentYears.map((entry) => {
                  const isCurrent = entry.year === award.year;
                  return (
                    <button
                      key={entry.year}
                      type="button"
                      onClick={() => {
                        if (award.templateId != null) {
                          onSelectHistoryYear?.(entry.year, award.templateId);
                        }
                      }}
                      disabled={award.templateId == null}
                      aria-label={`${entry.year}: ${
                        entry.winner
                          ? withCreditedPerson(entry.winner.name, entry.credited_person)
                          : "no winner"
                      }`}
                      {...bindTooltip(
                        <span>
                          {entry.year}
                          {entry.winner
                            ? ` · ${withCreditedPerson(entry.winner.name, entry.credited_person)}`
                            : " · No winner"}
                        </span>,
                        TOOLTIP_OPTIONS
                      )}
                      className={cn(
                        "group flex flex-col items-center gap-1 rounded-[5px]",
                        AWARD_FOCUS_RING
                      )}
                    >
                      <span
                        className={cn(
                          "block w-full overflow-hidden rounded-[3px]",
                          isCurrent && "ring-2 ring-[#d6ab5c]",
                          entry.winner
                            ? isCurrent
                              ? ""
                              : "ring-1 ring-white/10"
                            : "border-[1.5px] border-dashed border-white/[0.18] bg-white/[0.02]"
                        )}
                      >
                        {entry.winner ? (
                          <CoverImage
                            path={entry.winner.image_url}
                            alt={entry.winner.name}
                            variant="small"
                            priority="low"
                            containerClassName="aspect-[2/3] w-full"
                            imageClassName="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
                          />
                        ) : (
                          <span className="flex aspect-[2/3] w-full items-center justify-center text-white/20">
                            <Plus size={12} />
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] tabular-nums",
                          isCurrent ? "text-[#f0d391]" : "text-white/40"
                        )}
                      >
                        {entry.year}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {mode === "year" && award.templateId == null && (
            <p className="mt-4 border-t border-white/5 pt-3 text-[11.5px] text-white/30">
              This award has no template, so its history can't be tracked.
            </p>
          )}
        </div>

        <div className="relative z-[1] shrink-0 border-t border-white/5 p-5">
          {actions}
        </div>
      </div>
    </aside>
  );
}
