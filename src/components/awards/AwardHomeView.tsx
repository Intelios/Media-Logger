import { useMemo } from "react";
import { Plus, Trash2, Trophy } from "lucide-react";
import {
  GENERAL_GROUP,
  type AwardTemplate,
  type AwardYearSummary,
} from "../../lib/awards-logic";
import { ENTRY_TYPES } from "../../lib/media-config";
import { cn } from "../../lib/utils_ui";
import { CoverImage } from "../CoverImage";
import { useHoverTooltip } from "../HoverTooltip";
import { AwardRow, AWARD_FOCUS_RING, AWARD_GOLD_OUTLINE } from "./AwardRow";
import { AwardGroupHeading } from "./AwardTypeTabs";
import { DecidedMeter } from "./DecidedMeter";

interface AwardHomeViewProps {
  years: AwardYearSummary[];
  templates: AwardTemplate[];
  /** First ten winner covers per year (null entries keep their slot). */
  yearCovers: Map<number, (string | null)[]>;
  onOpenYear: (year: number) => void;
  onOpenTemplate: (templateId: number) => void;
  onCreateYear: () => void;
  onDeleteYear: (year: AwardYearSummary) => void;
  onDeleteTemplate: (template: AwardTemplate) => void;
}

const TOOLTIP_OPTIONS = {
  width: "content",
  className: "rounded-lg px-3 py-1.5 whitespace-nowrap",
} as const;

/** Ten mosaic cells: a 5×2 preview of the year's winners. */
const MOSAIC_CELLS = 10;

/**
 * Awards landing page: a grid of year mosaics, then every award template
 * grouped by media type. Both sections are pure summaries — opening either
 * hands off to the year / award views.
 */
export function AwardHomeView({
  years,
  templates,
  yearCovers,
  onOpenYear,
  onOpenTemplate,
  onCreateYear,
  onDeleteYear,
  onDeleteTemplate,
}: AwardHomeViewProps) {
  const { bindTooltip } = useHoverTooltip();

  // General last; everything else follows the canonical entry-type order.
  const templateGroups = useMemo<[string, AwardTemplate[]][]>(() => {
    const byType = new Map<string, AwardTemplate[]>();
    for (const template of templates) {
      const key = template.entry_type ?? GENERAL_GROUP;
      const group = byType.get(key);
      if (group) group.push(template);
      else byType.set(key, [template]);
    }

    const order = new Map<string, number>();
    ENTRY_TYPES.forEach((type, index) => order.set(type, index));
    order.set(GENERAL_GROUP, ENTRY_TYPES.length + 1);

    return [...byType.entries()].sort(
      (a, b) =>
        (order.get(a[0]) ?? ENTRY_TYPES.length) - (order.get(b[0]) ?? ENTRY_TYPES.length)
    );
  }, [templates]);

  return (
    <div className="mx-auto w-full max-w-6xl pb-16">
      <header className="award-header-enter flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[44px] font-bold leading-none tracking-[-0.035em] text-white">
            Awards
          </h1>
          <p className="mt-2.5 text-[13px] text-gray-400">
            {years.length} year{years.length !== 1 ? "s" : ""}, {templates.length} award
            {templates.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button type="button" onClick={onCreateYear} className={AWARD_GOLD_OUTLINE}>
          <Plus size={15} />
          New year
        </button>
      </header>

      {years.length === 0 ? (
        <div className="mt-7 flex flex-col items-center justify-center rounded-[18px] border border-white/5 bg-white/[0.02] px-6 py-14 text-center">
          <Trophy size={30} className="text-white/25" />
          <p className="mt-3 text-[15px] font-medium text-white/60">No award years yet.</p>
          <button type="button" onClick={onCreateYear} className={cn(AWARD_GOLD_OUTLINE, "mt-5")}>
            <Plus size={15} />
            New year
          </button>
        </div>
      ) : (
        <div className="mt-[26px] grid grid-cols-4 gap-[18px] min-[1440px]:grid-cols-5">
          {years.map((year, index) => {
            const covers = yearCovers.get(year.year) ?? [];
            const isEmpty = year.categories === 0 && year.winners === 0;

            return (
              <div
                key={year.year}
                className="group award-card-enter relative"
                style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
              >
                <button
                  type="button"
                  onClick={() => onOpenYear(year.year)}
                  aria-label={`Open ${year.year} awards`}
                  className={cn(
                    "w-full rounded-[14px] border border-white/[0.08] bg-white/[0.03] p-3 text-left transition-colors hover:border-[#d6ab5c]/40 hover:bg-[#d6ab5c]/[0.06]",
                    AWARD_FOCUS_RING
                  )}
                >
                  <div className="grid grid-cols-5 gap-1">
                    {Array.from({ length: MOSAIC_CELLS }, (_, cell) => {
                      const path = covers[cell] ?? null;
                      return (
                        <span
                          key={cell}
                          className={cn(
                            "block aspect-[2/3] overflow-hidden rounded-[3px]",
                            path
                              ? "bg-white/[0.04]"
                              : "border border-dashed border-white/[0.07]"
                          )}
                        >
                          {path && (
                            <CoverImage
                              path={path}
                              alt=""
                              variant="small"
                              priority="low"
                              containerClassName="h-full w-full"
                              imageClassName="h-full w-full object-cover"
                            />
                          )}
                        </span>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <span className="text-[26px] font-bold tabular-nums leading-none tracking-tight text-white">
                      {year.year}
                    </span>
                    <span className="text-[12px] tabular-nums text-white/40">
                      {year.categories === 0 ? "Empty" : `${year.winners} of ${year.categories}`}
                    </span>
                  </div>

                  <DecidedMeter
                    variant="fill"
                    className="mt-2.5"
                    decided={Array.from(
                      { length: year.categories },
                      (_, award) => award < year.winners
                    )}
                  />
                </button>

                {isEmpty && (
                  <button
                    type="button"
                    onClick={() => onDeleteYear(year)}
                    aria-label="Delete empty award year"
                    {...bindTooltip(
                      <span>Delete empty award year</span>,
                      TOOLTIP_OPTIONS
                    )}
                    className={cn(
                      "absolute right-2 top-2 rounded-lg p-1.5 text-white/35 opacity-0 transition-[color,background-color,opacity] duration-150 hover:bg-red-500/10 hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100",
                      AWARD_FOCUS_RING
                    )}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <section className="mt-10">
        <div className="flex items-center gap-2">
          <Trophy size={14} className="text-[#d6ab5c]" />
          <h2 className="text-[15px] font-semibold text-white">Every award</h2>
          <span className="text-[12px] tabular-nums text-white/40">{templates.length}</span>
        </div>

        {templates.length === 0 ? (
          <div className="mt-4 flex flex-col items-center justify-center rounded-[18px] border border-white/5 bg-white/[0.02] px-6 py-12 text-center">
            <Trophy size={26} className="text-white/20" />
            <p className="mt-3 text-[14px] font-medium text-white/55">No awards yet.</p>
            <p className="mt-1 text-[12.5px] text-white/35">
              Create awards inside a year to build this list.
            </p>
          </div>
        ) : (
          templateGroups.map(([groupKey, group]) => (
            <section key={groupKey}>
              <AwardGroupHeading label={groupKey} />
              <div className="grid grid-cols-2 gap-x-5 gap-y-0.5 min-[1440px]:grid-cols-3">
                {group.map((template, index) => {
                  const usage = template.usage_count ?? 0;
                  return (
                    <AwardRow
                      key={template.id}
                      compact
                      label={
                        usage === 0
                          ? "Not used yet"
                          : `${usage} year${usage !== 1 ? "s" : ""}`
                      }
                      headline={template.name}
                      imagePath={template.latest_winner_image ?? null}
                      decided={Boolean(template.latest_winner_image)}
                      index={index}
                      onSelect={() => onOpenTemplate(template.id)}
                      onDelete={() => onDeleteTemplate(template)}
                      deleteLabel="Delete award"
                      deleteTooltip="Delete award"
                    />
                  );
                })}
              </div>
            </section>
          ))
        )}
      </section>
    </div>
  );
}
