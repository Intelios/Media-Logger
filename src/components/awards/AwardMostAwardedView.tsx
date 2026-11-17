import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Calendar, ChevronLeft, ChevronRight, Star, Trophy } from "lucide-react";
import {
  GENERAL_GROUP,
  type MostAwardedEntry,
} from "../../lib/awards-logic";
import { useCoverPalettes } from "../../lib/cover-palette";
import { formatDateNoYear } from "../../lib/dates";
import {
  ENTRY_TYPES,
  formatCardRating,
  getRatingTextColor,
  parseGenres,
} from "../../lib/media-config";
import { cn } from "../../lib/utils_ui";
import { CoverImage } from "../CoverImage";
import {
  AWARD_FOCUS_RING,
  AWARD_ICON_BUTTON,
  AwardRow,
} from "./AwardRow";
import { AwardGroupHeading, AwardTypeTabs } from "./AwardTypeTabs";

interface AwardMostAwardedViewProps {
  entries: MostAwardedEntry[];
  /** Active media-type filter (null = All). */
  typeFilter: string | null;
  onTypeFilterChange: (type: string | null) => void;
  /** Opens a specific award year, optionally selecting the clicked award's template. */
  onOpenYear: (year: number, templateId: number | null) => void;
  onBack: () => void;
}

interface Chip {
  key: string;
  icon?: ReactNode;
  text: string;
  color?: string;
}

const STAGE_HEIGHT = 238;
const PRINT_MAX_HEIGHT = 204;

function formatCompletionLabel(
  completionDate: string | null,
  yearCompleted: number | null
): string | null {
  if (completionDate) {
    const dayMonth = formatDateNoYear(completionDate);
    if (dayMonth && yearCompleted != null) return `${dayMonth}, ${yearCompleted}`;
    if (dayMonth) return dayMonth;
  }
  if (yearCompleted != null) return String(yearCompleted);
  return null;
}

/**
 * Right-hand inspector for a multi-award winner: its cover on a palette-tinted
 * stage, entry metadata chips, and every award it won (each clickable to open
 * that award year).
 */
function MostAwardedInspector({
  item,
  onOpenYear,
}: {
  item: MostAwardedEntry | null;
  onOpenYear: (year: number, templateId: number | null) => void;
}) {
  const entry = item?.entry ?? null;
  const coverPath = entry?.image_url ?? null;
  const palettes = useCoverPalettes(coverPath ? [coverPath] : []);
  const palette = coverPath ? palettes.get(coverPath) : undefined;

  const [printRatio, setPrintRatio] = useState<number | null>(null);
  useEffect(() => {
    setPrintRatio(null);
  }, [coverPath]);

  const printWidth = printRatio
    ? `min(100%, ${Math.round(PRINT_MAX_HEIGHT * printRatio)}px)`
    : "100%";

  if (!item || !entry) return null;

  const tint = palette
    ? `linear-gradient(to bottom, color-mix(in srgb, ${palette.base} 55%, transparent), transparent 62%)`
    : "linear-gradient(to bottom, rgba(255,255,255,0.045), transparent 62%)";

  const creator = entry.author || entry.artist || entry.director;
  const contextChips: Chip[] = [];
  if (creator) contextChips.push({ key: "creator", text: creator });
  if (entry.platform) contextChips.push({ key: "platform", text: entry.platform });

  const completionText = formatCompletionLabel(
    entry.completion_date,
    entry.year_completed
  );
  const dateChip: Chip | null = completionText
    ? {
        key: "date",
        icon: <Calendar size={12} />,
        text: completionText,
      }
    : null;

  const scoreChip: Chip | null =
    entry.review_score != null
      ? {
          key: "score",
          icon: <Star size={12} className="fill-current" />,
          text: formatCardRating(entry.review_score),
          color: getRatingTextColor(entry.review_score),
        }
      : null;

  const chips: Chip[] = [
    ...contextChips,
    ...parseGenres(entry.genre).map((genre, index) => ({
      key: `genre-${index}`,
      text: genre,
    })),
    ...(dateChip ? [dateChip] : []),
    ...(scoreChip ? [scoreChip] : []),
  ];

  const yearsLabel = item.years.join(", ");

  return (
    <aside className="h-full min-h-0 w-[300px] xl:w-[360px]">
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#17141b]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: tint }}
        />

        <div
          key={entry.id}
          className="award-inspector-fade custom-scrollbar relative z-[1] min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-5"
        >
          <div
            className="flex w-full items-center justify-center"
            style={{ height: STAGE_HEIGHT }}
          >
            {entry.image_url ? (
              <CoverImage
                path={entry.image_url}
                alt={entry.name}
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
            ) : (
              <div className="flex h-[200px] w-[150px] items-center justify-center rounded-[7px] border border-white/[0.12] bg-white/[0.03] text-[#d6ab5c]/50">
                <Trophy size={26} />
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-[#d6ab5c]">
            <Trophy size={13} className="shrink-0" />
            <span className="truncate">
              {item.winCount} {item.winCount === 1 ? "Award" : "Awards"}
              {yearsLabel ? ` · ${yearsLabel}` : ""}
            </span>
          </div>

          <h2 className="mt-2 min-w-0 break-words text-center text-[25px] font-bold leading-[1.1] tracking-tight text-white">
            {entry.name}
          </h2>

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

          <div className="mt-5 border-t border-white/5 pt-4">
            <p className="text-[12px] font-medium text-white/40">
              Awards won ({item.winCount})
            </p>
            <div className="mt-2.5 space-y-1">
              {item.awards.map((win) => (
                <button
                  key={win.categoryId}
                  type="button"
                  onClick={() => onOpenYear(win.year, win.templateId)}
                  className={cn(
                    "group flex w-full items-center justify-between gap-2.5 rounded-[9px] border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-left transition-colors hover:border-[#d6ab5c]/35 hover:bg-[#d6ab5c]/[0.08]",
                    AWARD_FOCUS_RING
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Trophy
                      size={12}
                      className="shrink-0 text-[#d6ab5c]/80 transition-colors group-hover:text-[#f0d391]"
                    />
                    <span className="truncate text-[13px] font-medium text-white group-hover:text-[#f0d391]">
                      {win.categoryName}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[11.5px] tabular-nums text-white/45 group-hover:text-[#f0d391]/80">
                    <span>{win.year}</span>
                    <ChevronRight
                      size={13}
                      className="text-white/25 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[#f0d391]"
                    />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/**
 * All-time Most Awarded ("Sweeps") view: entries across the log that have won
 * 2 or more awards, grouped into sections by media type with the sticky award
 * inspector on the right.
 */
export function AwardMostAwardedView({
  entries,
  typeFilter,
  onTypeFilterChange,
  onOpenYear,
  onBack,
}: AwardMostAwardedViewProps) {
  const groups = useMemo<[string, MostAwardedEntry[]][]>(() => {
    const order = new Map<string, number>();
    ENTRY_TYPES.forEach((type, position) => order.set(type, position));
    order.set(GENERAL_GROUP, ENTRY_TYPES.length + 1);

    const byType = new Map<string, MostAwardedEntry[]>();
    for (const item of entries) {
      const key = item.entry.entry_type ?? GENERAL_GROUP;
      const list = byType.get(key);
      if (list) list.push(item);
      else byType.set(key, [item]);
    }

    return [...byType.entries()].sort(
      ([leftKey], [rightKey]) =>
        (order.get(leftKey) ?? ENTRY_TYPES.length) -
        (order.get(rightKey) ?? ENTRY_TYPES.length)
    );
  }, [entries]);

  const activeTypeFilter =
    typeFilter !== null && groups.some(([key]) => key === typeFilter)
      ? typeFilter
      : null;

  const visibleGroups = useMemo<[string, MostAwardedEntry[]][]>(
    () =>
      activeTypeFilter === null
        ? groups
        : groups.filter(([key]) => key === activeTypeFilter),
    [groups, activeTypeFilter]
  );

  const visibleItems = useMemo(
    () => visibleGroups.flatMap(([, group]) => group),
    [visibleGroups]
  );

  const [selectedId, setSelectedId] = useState<number | null>(
    () => visibleItems[0]?.entry.id ?? null
  );

  useEffect(() => {
    if (visibleItems.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) =>
      current != null && visibleItems.some((item) => item.entry.id === current)
        ? current
        : (visibleItems[0]?.entry.id ?? null)
    );
  }, [visibleItems]);

  const selectedItem =
    visibleItems.find((item) => item.entry.id === selectedId) ?? null;

  return (
    <div className="award-year-enter-next flex h-full min-h-0 flex-col">
      <header className="award-header-enter relative z-30">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to all awards"
              className={cn(AWARD_ICON_BUTTON, "rounded-full")}
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-[13px] text-white/40">Awards</span>
          </div>
        </div>

        <h1 className="mt-[22px] max-w-[760px] break-words text-[44px] font-bold leading-[1.02] tracking-[-0.035em] text-white">
          Most Awarded
        </h1>
        <p className="mt-2 text-[13px] text-gray-400">
          {entries.length === 0
            ? "Entries that have won 2 or more awards across all years"
            : `${entries.length} ${
                entries.length === 1 ? "entry" : "entries"
              } with 2+ awards across ${groups.length} media ${
                groups.length === 1 ? "type" : "types"
              }`}
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="mt-9 flex flex-col items-center justify-center rounded-[18px] border border-white/5 bg-white/[0.02] px-6 py-14 text-center">
          <Trophy size={30} className="text-white/25" />
          <p className="mt-3 text-[15px] font-medium text-white/60">
            No multi-award winners yet.
          </p>
          <p className="mt-1 text-[13px] text-white/35">
            Entries that sweep 2 or more awards appear here, grouped by media type.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-[22px] shrink-0">
            <AwardTypeTabs
              groups={groups}
              value={activeTypeFilter}
              onChange={onTypeFilterChange}
            />
          </div>

          <div className="mt-2 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] gap-9 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div
              className="custom-scrollbar min-h-0 min-w-0 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{
                maskImage:
                  "linear-gradient(to bottom, black calc(100% - 20px), transparent)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, black calc(100% - 20px), transparent)",
              }}
            >
              {visibleGroups.map(([groupKey, group]) => (
                <section key={groupKey}>
                  {activeTypeFilter === null && (
                    <AwardGroupHeading label={groupKey} />
                  )}
                  <div
                    className={cn(
                      "grid grid-cols-1 gap-x-5 gap-y-1 min-[1440px]:grid-cols-2",
                      activeTypeFilter !== null && "mt-1"
                    )}
                  >
                    {group.map((item) => {
                      const isSelected = item.entry.id === selectedItem?.entry.id;
                      const yearsText = item.years.join(", ");
                      const awardNamesPreview = item.awards
                        .slice(0, 2)
                        .map((win) => win.categoryName)
                        .join(" · ");
                      const label = yearsText
                        ? `${yearsText} · ${awardNamesPreview}`
                        : awardNamesPreview;

                      return (
                        <AwardRow
                          key={item.entry.id}
                          label={label}
                          headline={item.entry.name}
                          imagePath={item.entry.image_url}
                          decided={true}
                          selected={isSelected}
                          onSelect={() => setSelectedId(item.entry.id)}
                          badge={
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold tabular-nums transition-colors",
                                isSelected
                                  ? "bg-[#d6ab5c] text-[#1d150a]"
                                  : "border border-[#d6ab5c]/30 bg-[#d6ab5c]/10 text-[#f0d391]"
                              )}
                            >
                              <Trophy size={11} className="shrink-0" />
                              <span>{item.winCount}</span>
                            </span>
                          }
                        />
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <MostAwardedInspector
              item={selectedItem}
              onOpenYear={onOpenYear}
            />
          </div>
        </>
      )}
    </div>
  );
}
