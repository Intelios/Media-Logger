import { useMemo } from "react";
import { Plus, Trash2, Trophy } from "lucide-react";
import {
  GENERAL_GROUP,
  type AwardTemplate,
  type AwardYearSummary,
} from "../../lib/awards-logic";
import { ENTRY_TYPES } from "../../lib/media-config";
import { useCoverPalettes } from "../../lib/cover-palette";
import { cn } from "../../lib/utils_ui";
import { CoverImage } from "../CoverImage";
import { useHoverTooltip } from "../HoverTooltip";
import { AWARD_FOCUS_RING, AWARD_GOLD_ICON_BUTTON, AWARD_GOLD_OUTLINE } from "./AwardRow";
import { AwardTypeIcon, typeIconTint } from "./AwardTypeTabs";
import { DecidedMeter } from "./DecidedMeter";

interface AwardHomeViewProps {
  years: AwardYearSummary[];
  templates: AwardTemplate[];
  /** The lead cover of each year (its first award's winner), null when none. */
  yearLeads: Map<number, string | null>;
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

/**
 * The neutral mount a print sits on when its cover has no palette yet. Kept in
 * step with AwardRow so the year cards and the year view read as one surface.
 */
const NEUTRAL_MOUNT = "rgba(255, 255, 255, 0.03)";

function mountFor(palette: { base: string } | undefined): string {
  return palette ? `color-mix(in srgb, ${palette.base} 26%, #151219)` : NEUTRAL_MOUNT;
}

/**
 * Awards landing page: one card per award year (its lead cover on a mount, the
 * decided meter) and then a plain index of award names. The artwork lives in the
 * cards; the index is there to be scanned and opened.
 */
export function AwardHomeView({
  years,
  templates,
  yearLeads,
  onOpenYear,
  onOpenTemplate,
  onCreateYear,
  onDeleteYear,
  onDeleteTemplate,
}: AwardHomeViewProps) {
  const { bindTooltip } = useHoverTooltip();

  const leadPaths = useMemo(
    () => years.map((year) => yearLeads.get(year.year) ?? null),
    [years, yearLeads]
  );
  const palettes = useCoverPalettes(leadPaths);

  // One flat index: the canonical media-type order, then name. The old
  // per-type sections produced a stuttering run of headings with one or two
  // rows under each.
  const indexTemplates = useMemo(() => {
    const order = new Map<string, number>();
    ENTRY_TYPES.forEach((type, position) => order.set(type, position));
    order.set(GENERAL_GROUP, ENTRY_TYPES.length + 1);

    return [...templates].sort((left, right) => {
      const leftType = left.entry_type ?? GENERAL_GROUP;
      const rightType = right.entry_type ?? GENERAL_GROUP;
      const byType =
        (order.get(leftType) ?? ENTRY_TYPES.length) -
        (order.get(rightType) ?? ENTRY_TYPES.length);
      return byType !== 0 ? byType : left.name.localeCompare(right.name);
    });
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
        <button
          type="button"
          onClick={onCreateYear}
          aria-label="New year"
          className={AWARD_GOLD_ICON_BUTTON}
        >
          <Plus size={17} />
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
        <div className="mt-[26px] grid grid-cols-1 gap-5 sm:grid-cols-2 min-[1280px]:grid-cols-3">
          {years.map((year, index) => {
            const lead = yearLeads.get(year.year) ?? null;
            const mount = mountFor(lead ? palettes.get(lead) : undefined);
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
                    "w-full rounded-[16px] border border-white/[0.08] bg-white/[0.03] p-3.5 text-left transition-colors hover:border-[#d6ab5c]/40 hover:bg-[#d6ab5c]/[0.06]",
                    AWARD_FOCUS_RING
                  )}
                >
                  <div
                    className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-[9px] ring-1 ring-white/[0.08]"
                    style={{ background: mount }}
                  >
                    {year.winners > 0 ? (
                      <CoverImage
                        path={lead}
                        alt=""
                        variant="card"
                        priority={index === 0 ? "high" : "low"}
                        sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                        containerClassName="flex h-full w-full items-center justify-center p-2.5"
                        imageClassName="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <Trophy size={20} className="text-white/20" />
                    )}
                  </div>

                  <div className="mt-3.5 flex items-baseline justify-between gap-2">
                    <span className="text-[32px] font-bold tabular-nums leading-none tracking-tight text-white">
                      {year.year}
                    </span>
                    <span className="text-[12.5px] tabular-nums text-white/40">
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
                    {...bindTooltip(<span>Delete empty award year</span>, TOOLTIP_OPTIONS)}
                    className={cn(
                      "absolute right-2 top-2 rounded-lg bg-black/40 p-1.5 text-white/35 opacity-0 transition-[color,background-color,opacity] duration-150 hover:bg-red-500/10 hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100",
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
        <h2 className="flex items-center gap-3 text-[12.5px] font-semibold text-gray-400">
          <span aria-hidden className="h-px flex-1 bg-white/5" />
          Every award
          <span aria-hidden className="h-px flex-1 bg-white/5" />
        </h2>

        {templates.length === 0 ? (
          <div className="mt-4 flex flex-col items-center justify-center rounded-[18px] border border-white/5 bg-white/[0.02] px-6 py-12 text-center">
            <Trophy size={26} className="text-white/20" />
            <p className="mt-3 text-[14px] font-medium text-white/55">No awards yet.</p>
            <p className="mt-1 text-[12.5px] text-white/35">
              Create awards inside a year to build this list.
            </p>
          </div>
        ) : (
          <div className="award-item-enter mt-3 grid grid-cols-2 gap-x-8 gap-y-0.5 min-[1440px]:grid-cols-3">
            {indexTemplates.map((template, index) => {
              return (
                <div
                  key={template.id}
                  className="group relative"
                  style={{ animationDelay: `${Math.min(index * 25, 250)}ms` }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenTemplate(template.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-[8px] py-2.5 pl-2.5 pr-10 text-left transition-colors hover:bg-white/5",
                      AWARD_FOCUS_RING
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn("flex shrink-0", typeIconTint(template.entry_type))}
                    >
                      <AwardTypeIcon type={template.entry_type} size={13} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15.5px] font-medium text-white">
                      {template.name}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteTemplate(template)}
                    aria-label="Delete award"
                    {...bindTooltip(<span>Delete award</span>, TOOLTIP_OPTIONS)}
                    className={cn(
                      "absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/35 opacity-0 transition-[color,background-color,opacity] duration-150 hover:bg-red-500/10 hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100",
                      AWARD_FOCUS_RING
                    )}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
