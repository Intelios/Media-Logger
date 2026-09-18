import { cloneElement, type ReactElement } from "react";
import { ChevronDown, ChevronUp, Layers, Trophy, type LucideProps } from "lucide-react";
import { ENTRY_TYPES, getTypeBadgeStyle } from "../../lib/media-config";
import { TooltipDetail, TooltipTitle, useHoverTooltip } from "../HoverTooltip";
import type { AwardYearSummary } from "../../lib/awards-logic";
import { cn } from "../../lib/utils_ui";

interface AwardYearPanelProps {
  year: number;
  /** Total award count — shown on the "All" filter tooltip. */
  total: number;
  /** Categories grouped by media type, in the page's canonical order. */
  groups: [string, unknown[]][];
  /** Active media-type filter (null = All). */
  typeFilter: string | null;
  onSelectType: (type: string | null) => void;
  /** All award years (sorted desc) — used for prev/next navigation. */
  years: AwardYearSummary[];
  onSelectYear: (year: number) => void;
}

const iconButtonClass = (active: boolean) => cn(
  "flex h-10 w-10 items-center justify-center rounded-xl border transition-all",
  active
    ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
    : "border-white/10 bg-white/5 text-gray-400 hover:border-white/25 hover:text-gray-200"
);

/**
 * Narrow icon rail pinned to the left edge of the year view: the year itself,
 * the media-type filter as icon buttons (replacing the old chip row), and
 * prev/next year navigation.
 */
export function AwardYearPanel({ year, total, groups, typeFilter, onSelectType, years, onSelectYear }: AwardYearPanelProps) {
  const { bindTooltip } = useHoverTooltip();

  // `years` arrives sorted newest-first: the previous slot is the newer year.
  const yearIndex = years.findIndex(y => y.year === year);
  const newerYear = yearIndex > 0 ? years[yearIndex - 1].year : null;
  const olderYear = yearIndex >= 0 && yearIndex < years.length - 1 ? years[yearIndex + 1].year : null;

  return (
    <div className="flex w-full flex-col items-center gap-4 rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-500/[0.07] via-white/[0.03] to-transparent p-3 shadow-xl shadow-black/30">
      {/* Year — vertical so it fits the rail */}
      <div className="flex flex-col items-center gap-2">
        <Trophy size={14} className="text-amber-400" />
        <div
          className="bg-gradient-to-b from-amber-300 to-yellow-500 bg-clip-text text-xl font-black leading-none text-transparent"
          style={{ writingMode: "vertical-rl" }}
        >
          {year}
        </div>
      </div>

      {/* Media-type filter — icon buttons, name + count on hover */}
      <div className="flex w-full flex-col items-center gap-1.5 border-t border-white/5 pt-3">
        <button
          type="button"
          onClick={() => onSelectType(null)}
          aria-label="All categories"
          {...bindTooltip(
            <>
              <TooltipTitle>All categories</TooltipTitle>
              <TooltipDetail>{total} award{total !== 1 ? "s" : ""}</TooltipDetail>
            </>,
            { width: "content" }
          )}
          className={iconButtonClass(typeFilter === null)}
        >
          <Trophy size={16} />
        </button>
        {groups.map(([key, group]) => {
          const badge = ENTRY_TYPES.includes(key) ? getTypeBadgeStyle(key) : null;
          const icon = badge
            ? cloneElement(badge.icon as ReactElement<LucideProps>, { size: 16 })
            : <Layers size={16} />;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectType(key)}
              aria-label={key}
              {...bindTooltip(
                <>
                  <TooltipTitle>{key}</TooltipTitle>
                  <TooltipDetail>{group.length} award{group.length !== 1 ? "s" : ""}</TooltipDetail>
                </>,
                { width: "content" }
              )}
              className={iconButtonClass(typeFilter === key)}
            >
              {icon}
            </button>
          );
        })}
      </div>

      {/* Prev/next year navigation */}
      {(olderYear != null || newerYear != null) && (
        <div className="flex w-full flex-col items-center gap-1.5 border-t border-white/5 pt-3">
          {newerYear != null && (
            <button
              type="button"
              onClick={() => onSelectYear(newerYear)}
              aria-label={`${newerYear} awards`}
              {...bindTooltip(<TooltipTitle>{newerYear} awards</TooltipTitle>, { width: "content" })}
              className={iconButtonClass(false)}
            >
              <ChevronUp size={16} />
            </button>
          )}
          {olderYear != null && (
            <button
              type="button"
              onClick={() => onSelectYear(olderYear)}
              aria-label={`${olderYear} awards`}
              {...bindTooltip(<TooltipTitle>{olderYear} awards</TooltipTitle>, { width: "content" })}
              className={iconButtonClass(false)}
            >
              <ChevronDown size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
