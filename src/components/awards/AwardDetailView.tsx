import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Trash2, Trophy } from "lucide-react";
import {
  awardsLogic,
  type AwardCategoryWithWinner,
  type AwardTemplate,
  type TemplateWinnerHistory,
} from "../../lib/awards-logic";
import { cn } from "../../lib/utils_ui";
import { AwardTypeMenu } from "../AwardTypeMenu";
import { useHoverTooltip } from "../HoverTooltip";
import {
  AWARD_ICON_BUTTON,
  AwardRow,
} from "./AwardRow";
import { AwardInspector, type InspectorAward } from "./AwardInspector";
import { DecidedMeter } from "./DecidedMeter";

interface AwardDetailViewProps {
  template: AwardTemplate;
  /** Every year this award appears in, newest first. */
  history: TemplateWinnerHistory[];
  /** Bumped by the controller after a winner change so year caches refresh. */
  version: number;
  onBack: () => void;
  onTypeChange: (type: string | null) => void;
  onDeleteTemplate: () => void;
  /** Undecided rows open that year with this award pre-selected. */
  onOpenYear: (year: number, templateId: number) => void;
  onChangeWinner: (categoryId: number, year: number, entryType: string | null) => void;
}

const TOOLTIP_OPTIONS = {
  width: "content",
  className: "rounded-lg px-3 py-1.5 whitespace-nowrap",
} as const;

/**
 * One award across every year it has appeared in. The selected year's winner
 * fills the inspector; “Also won” needs that year's other categories, fetched
 * once per year and cached in a ref.
 */
export function AwardDetailView({
  template,
  history,
  version,
  onBack,
  onTypeChange,
  onDeleteTemplate,
  onOpenYear,
  onChangeWinner,
}: AwardDetailViewProps) {
  const { bindTooltip } = useHoverTooltip();

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(() => {
    const first = history.find((entry) => entry.winner) ?? history[0];
    return first?.category_id ?? null;
  });

  useEffect(() => {
    if (history.length === 0) {
      setSelectedCategoryId(null);
      return;
    }
    setSelectedCategoryId((current) =>
      current != null && history.some((entry) => entry.category_id === current)
        ? current
        : (history.find((entry) => entry.winner) ?? history[0]).category_id
    );
  }, [history]);

  const selectedEntry =
    history.find((entry) => entry.category_id === selectedCategoryId) ?? null;
  const selectedYear = selectedEntry?.year ?? null;

  const yearCache = useRef(new Map<number, AwardCategoryWithWinner[]>());
  const [yearAwardsState, setYearAwardsState] = useState<{
    year: number | null;
    entries: AwardCategoryWithWinner[];
  }>({ year: null, entries: [] });
  // Keyed by year so another year's “Also won” can't flash while this one loads.
  const yearAwards = yearAwardsState.year === selectedYear ? yearAwardsState.entries : [];

  useEffect(() => {
    yearCache.current.clear();
  }, [version]);

  useEffect(() => {
    if (selectedYear == null) {
      setYearAwardsState({ year: null, entries: [] });
      return;
    }
    const cached = yearCache.current.get(selectedYear);
    if (cached) {
      setYearAwardsState({ year: selectedYear, entries: cached });
      return;
    }
    let cancelled = false;
    awardsLogic
      .getAwardsForYear(selectedYear)
      .then((entries) => {
        yearCache.current.set(selectedYear, entries);
        if (!cancelled) setYearAwardsState({ year: selectedYear, entries });
      })
      .catch(() => {
        if (!cancelled) setYearAwardsState({ year: selectedYear, entries: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedYear, version]);

  const alsoWon = useMemo(() => {
    const winnerId = selectedEntry?.winner?.id;
    if (!selectedEntry || winnerId == null) return [];
    return yearAwards
      .filter(
        (category) => category.id !== selectedEntry.category_id && category.winner?.id === winnerId
      )
      .map((category) => category.name);
  }, [selectedEntry, yearAwards]);

  const inspectorAward: InspectorAward | null = selectedEntry
    ? {
        categoryId: selectedEntry.category_id,
        year: selectedEntry.year,
        name: template.name,
        entryType: template.entry_type,
        templateId: template.id,
        winner: selectedEntry.winner,
      }
    : null;

  const decidedCount = history.reduce(
    (count, entry) => count + (entry.winner ? 1 : 0),
    0
  );

  return (
    <div className="award-year-enter-next mx-auto w-full max-w-[1500px] pb-16">
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

          <div className="flex shrink-0 items-center gap-2">
            <AwardTypeMenu
              value={template.entry_type}
              onChange={(type) => onTypeChange(type)}
            />
            <button
              type="button"
              onClick={onDeleteTemplate}
              aria-label="Delete award"
              {...bindTooltip(<span>Delete award</span>, TOOLTIP_OPTIONS)}
              className={cn(
                AWARD_ICON_BUTTON,
                "hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
              )}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <h1 className="mt-[26px] max-w-[760px] break-words text-[48px] font-bold leading-[1.02] tracking-[-0.035em] text-white">
          {template.name}
        </h1>

        {history.length > 0 && (
          <>
            <DecidedMeter
              variant="wide"
              className="mt-4"
              decided={history.map((entry) => entry.winner !== null)}
            />
            <p className="mt-2 text-[13px] text-gray-400">
              Awarded in {history.length} year{history.length !== 1 ? "s" : ""},{" "}
              {decidedCount} decided
            </p>
          </>
        )}
      </header>

      {history.length === 0 ? (
        <div className="mt-9 flex flex-col items-center justify-center rounded-[18px] border border-white/5 bg-white/[0.02] px-6 py-14 text-center">
          <Trophy size={30} className="text-white/25" />
          <p className="mt-3 text-[15px] font-medium text-white/60">
            This award hasn't been used in a year yet.
          </p>
          <p className="mt-1 text-[13px] text-white/35">
            Add it to an award year to start recording winners.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_300px] items-start gap-9 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-1 min-[1440px]:grid-cols-2">
            {history.map((entry) => (
              <AwardRow
                key={entry.category_id}
                label={String(entry.year)}
                headline={entry.winner?.name ?? null}
                imagePath={entry.winner?.image_url ?? null}
                decided={entry.winner !== null}
                selected={entry.category_id === selectedCategoryId}
                onSelect={() => {
                  if (entry.winner) setSelectedCategoryId(entry.category_id);
                  else onOpenYear(entry.year, template.id);
                }}
              />
            ))}
          </div>

          <AwardInspector
            award={inspectorAward}
            mode="detail"
            alsoWon={alsoWon}
            alsoWonYear={selectedYear ?? 0}
            onChangeWinner={(award) =>
              onChangeWinner(award.categoryId, award.year, award.entryType)
            }
          />
        </div>
      )}
    </div>
  );
}
