import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, ChevronLeft, Plus, Trophy } from "lucide-react";
import {
  awardsLogic,
  type AwardCategoryWithWinner,
  type AwardYearSummary,
  type TemplateWinnerHistory,
} from "../../lib/awards-logic";
import { cn } from "../../lib/utils_ui";
import { useHoverTooltip } from "../HoverTooltip";
import {
  AWARD_FOCUS_RING,
  AWARD_GOLD_OUTLINE,
  AWARD_ICON_BUTTON,
  AwardRow,
} from "./AwardRow";
import { AwardInspector, type InspectorAward } from "./AwardInspector";
import { AwardGroupHeading, AwardTypeTabs } from "./AwardTypeTabs";
import { DecidedMeter } from "./DecidedMeter";

interface AwardYearViewProps {
  year: number;
  /** All award years, newest first — powers the header's year stepping. */
  years: AwardYearSummary[];
  /** Every category in the year, in stored order. */
  categories: AwardCategoryWithWinner[];
  /** Unfiltered groups, for the type tabs. */
  groups: [string, AwardCategoryWithWinner[]][];
  /** Groups after the active type filter, in page order. */
  visibleGroups: [string, AwardCategoryWithWinner[]][];
  /** Active media-type filter (null = All). */
  typeFilter: string | null;
  /** Template to select on arrival (history cover / award detail navigation). */
  initialTemplateId: number | null;
  /** Bumped by the controller after mutations that invalidate history caches. */
  historyVersion: number;
  onTypeFilterChange: (type: string | null) => void;
  onSelectYear: (year: number) => void;
  onYearSelectWithTemplate: (year: number, templateId: number) => void;
  onOpenPicker: (category: AwardCategoryWithWinner) => void;
  onDeleteCategory: (category: AwardCategoryWithWinner) => void;
  onAddAward: () => void;
  onReorder: () => void;
  onBack: () => void;
}

const TOOLTIP_OPTIONS = {
  width: "content",
  className: "rounded-lg px-3 py-1.5 whitespace-nowrap",
} as const;

function defaultSelection(items: AwardCategoryWithWinner[]): number | null {
  return items.find((item) => item.winner)?.id ?? items[0]?.id ?? null;
}

/**
 * A single award year: the year's cover rows on the left, the selected award's
 * inspector on the right. Selection is local state so clicking a row costs no
 * query; the type filter narrows the same loaded rows in memory.
 */
export function AwardYearView({
  year,
  years,
  categories,
  groups,
  visibleGroups,
  typeFilter,
  initialTemplateId,
  historyVersion,
  onTypeFilterChange,
  onSelectYear,
  onYearSelectWithTemplate,
  onOpenPicker,
  onDeleteCategory,
  onAddAward,
  onReorder,
  onBack,
}: AwardYearViewProps) {
  const { bindTooltip } = useHoverTooltip();

  const visibleItems = useMemo(
    () => visibleGroups.flatMap(([, group]) => group),
    [visibleGroups]
  );

  const rowOrder = useMemo(() => {
    const order = new Map<number, number>();
    let next = 0;
    for (const [, group] of visibleGroups) {
      for (const category of group) order.set(category.id, next++);
    }
    return order;
  }, [visibleGroups]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  // The initial template only applies once the year's categories have loaded —
  // the page mounts before the async fetch resolves.
  const initialTemplateApplied = useRef(false);

  useEffect(() => {
    if (visibleItems.length === 0) {
      setSelectedId(null);
      return;
    }

    if (!initialTemplateApplied.current) {
      initialTemplateApplied.current = true;
      if (initialTemplateId != null) {
        const match = visibleItems.find(
          (category) => category.template_id === initialTemplateId
        );
        if (match) {
          setSelectedId(match.id);
          return;
        }
      }
    }

    setSelectedId((current) =>
      current != null && visibleItems.some((category) => category.id === current)
        ? current
        : defaultSelection(visibleItems)
    );
  }, [initialTemplateId, visibleItems]);

  const selectedCategory = visibleItems.find((category) => category.id === selectedId) ?? null;

  const inspectorAward: InspectorAward | null = selectedCategory
    ? {
        categoryId: selectedCategory.id,
        year: selectedCategory.year,
        name: selectedCategory.name,
        entryType: selectedCategory.entry_type,
        templateId: selectedCategory.template_id,
        winner: selectedCategory.winner,
      }
    : null;

  const alsoWon = useMemo(() => {
    const winnerId = selectedCategory?.winner?.id;
    if (!selectedCategory || winnerId == null) return [];
    return categories
      .filter(
        (category) => category.id !== selectedCategory.id && category.winner?.id === winnerId
      )
      .map((category) => category.name);
  }, [categories, selectedCategory]);

  // Template history is immutable between mutations and shared by every
  // category using that template, so one Map serves the whole year view.
  // The state is keyed by template id: while a new template loads, the old
  // award's years must not be painted under the new one's title.
  const historyCache = useRef(new Map<number, TemplateWinnerHistory[]>());
  const [historyState, setHistoryState] = useState<{
    templateId: number | null;
    entries: TemplateWinnerHistory[];
  }>({ templateId: null, entries: [] });
  const templateId = selectedCategory?.template_id ?? null;
  const history = historyState.templateId === templateId ? historyState.entries : [];

  useEffect(() => {
    historyCache.current.clear();
  }, [historyVersion]);

  useEffect(() => {
    if (templateId == null) {
      setHistoryState({ templateId: null, entries: [] });
      return;
    }
    const cached = historyCache.current.get(templateId);
    if (cached) {
      setHistoryState({ templateId, entries: cached });
      return;
    }
    let cancelled = false;
    awardsLogic
      .getTemplateHistory(templateId)
      .then((entries) => {
        historyCache.current.set(templateId, entries);
        if (!cancelled) setHistoryState({ templateId, entries });
      })
      .catch(() => {
        if (!cancelled) setHistoryState({ templateId, entries: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [templateId, historyVersion]);

  // `years` is newest-first: the previous (older) year sits after this one.
  const yearIndex = years.findIndex((entry) => entry.year === year);
  const olderYear =
    yearIndex >= 0 && yearIndex < years.length - 1 ? years[yearIndex + 1] : null;
  const newerYear = yearIndex > 0 ? years[yearIndex - 1] : null;

  const handleSelect = (category: AwardCategoryWithWinner) => {
    setSelectedId(category.id);
    if (!category.winner) onOpenPicker(category);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="award-header-enter relative z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to all awards"
          className={cn(AWARD_ICON_BUTTON, "justify-self-start rounded-full")}
        >
          <ChevronLeft size={18} />
        </button>

        <div className="flex min-w-0 flex-col items-center">
          <div className="flex items-baseline gap-3">
            {olderYear && (
              <button
                type="button"
                onClick={() => onSelectYear(olderYear.year)}
                aria-label={`${olderYear.year} awards`}
                className={cn(
                  "rounded-md text-[22px] font-semibold tabular-nums text-white/25 transition-colors hover:text-white/60",
                  AWARD_FOCUS_RING
                )}
              >
                {olderYear.year}
              </button>
            )}
            <h1 className="text-[56px] font-bold leading-[0.9] tracking-[-0.035em] tabular-nums text-white">
              {year}
            </h1>
            {newerYear && (
              <button
                type="button"
                onClick={() => onSelectYear(newerYear.year)}
                aria-label={`${newerYear.year} awards`}
                className={cn(
                  "rounded-md text-[22px] font-semibold tabular-nums text-white/25 transition-colors hover:text-white/60",
                  AWARD_FOCUS_RING
                )}
              >
                {newerYear.year}
              </button>
            )}
          </div>
          <DecidedMeter
            className="mt-3.5"
            decided={categories.map((category) => category.winner !== null)}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2 justify-self-end">
          {typeFilter === null && (
            <button
              type="button"
              onClick={onReorder}
              disabled={categories.length < 2}
              aria-label="Reorder awards"
              {...bindTooltip(<span>Reorder awards</span>, TOOLTIP_OPTIONS)}
              className={AWARD_ICON_BUTTON}
            >
              <ArrowUpDown size={17} />
            </button>
          )}
          <button
            type="button"
            onClick={onAddAward}
            aria-label="Add award"
            className={AWARD_GOLD_OUTLINE}
          >
            <Plus size={15} />
            Add award
          </button>
        </div>
      </header>

      {categories.length === 0 ? (
        <div className="mt-9 flex flex-col items-center justify-center rounded-[18px] border border-white/5 bg-white/[0.02] px-6 py-14 text-center">
          <Trophy size={30} className="text-white/25" />
          <p className="mt-3 text-[15px] font-medium text-white/60">No awards yet.</p>
          <button type="button" onClick={onAddAward} className={cn(AWARD_GOLD_OUTLINE, "mt-5")}>
            <Plus size={15} />
            Add award
          </button>
        </div>
      ) : (
        <>
          <div className="mt-[22px] shrink-0">
            <AwardTypeTabs
              groups={groups}
              value={typeFilter}
              onChange={onTypeFilterChange}
            />
          </div>

          <div className="mt-2 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] gap-9 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div
              className="custom-scrollbar min-h-0 min-w-0 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{
                maskImage: "linear-gradient(to bottom, black calc(100% - 20px), transparent)",
                WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 20px), transparent)",
              }}
            >
              {visibleGroups.map(([groupKey, group]) => (
                <section key={groupKey}>
                  {typeFilter === null && <AwardGroupHeading label={groupKey} />}
                  <div
                    className={cn(
                      "grid grid-cols-1 gap-x-5 gap-y-1 min-[1440px]:grid-cols-2",
                      typeFilter !== null && "mt-1"
                    )}
                  >
                    {group.map((category) => (
                      <AwardRow
                        key={category.id}
                        label={category.name}
                        headline={category.winner?.name ?? null}
                        imagePath={category.winner?.image_url ?? null}
                        decided={category.winner !== null}
                        selected={category.id === selectedId}
                        index={rowOrder.get(category.id) ?? 0}
                        onSelect={() => handleSelect(category)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <AwardInspector
              award={inspectorAward}
              mode="year"
              alsoWon={alsoWon}
              alsoWonYear={year}
              history={history}
              onChangeWinner={(award) => {
                const category = categories.find((entry) => entry.id === award.categoryId);
                if (category) onOpenPicker(category);
              }}
              onRemove={(award) => {
                const category = categories.find((entry) => entry.id === award.categoryId);
                if (category) onDeleteCategory(category);
              }}
              onSelectHistoryYear={onYearSelectWithTemplate}
            />
          </div>
        </>
      )}
    </div>
  );
}
