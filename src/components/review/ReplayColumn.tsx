import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils_ui";
import { CoverImage } from "../CoverImage";
import { useHoverTooltip, TooltipDetail, TooltipTitle } from "../HoverTooltip";
import { ReviewCard } from "./review-ui";
import type { ReviewYearTotal } from "../../lib/review-logic";

const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Past years and single months, one click each.
 *
 * The month grid is what stops this being a page you only open in December —
 * any month with a completion in it can be played on its own.
 */
export function ReplayColumn({
  years,
  activeYear,
  activeMonth,
  monthCounts,
  onSelectYear,
  onSelectMonth,
}: {
  years: ReviewYearTotal[];
  activeYear: number | null;
  activeMonth: number | null;
  monthCounts: number[];
  onSelectYear: (year: number) => void;
  onSelectMonth: (month: number | null) => void;
}) {
  const { bindTooltip } = useHoverTooltip();
  const others = years.filter((entry) => entry.year !== activeYear);

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <span
        className="text-[13px] font-semibold uppercase text-text-muted"
        style={{ letterSpacing: "0.05em" }}
      >
        Replay
      </span>

      {others.length > 0 && (
        <div className="flex flex-col gap-2">
          {others.slice(0, 4).map((entry) => (
            <button
              key={entry.year}
              type="button"
              onClick={() => onSelectYear(entry.year)}
              className="flex items-center gap-3 rounded-[14px] border px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05]"
              style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.06)" }}
            >
              <div className="h-[46px] w-[34px] shrink-0 overflow-hidden rounded-md bg-white/5">
                <CoverImage
                  path={entry.coverPath}
                  alt=""
                  variant="small"
                  sizes="34px"
                  containerClassName="h-full w-full"
                  imageClassName="h-full w-full object-cover"
                />
              </div>
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="text-sm font-bold text-text">{entry.year}</span>
                <span className="truncate text-xs text-text-subtle">
                  {entry.count} {entry.count === 1 ? "entry" : "entries"}
                  {entry.avgScore != null ? ` · avg ${entry.avgScore.toFixed(1)}` : ""}
                </span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-text-subtle" />
            </button>
          ))}
        </div>
      )}

      <ReviewCard className="flex flex-col gap-2.5 p-3.5">
        <div className="flex items-baseline justify-between">
          <span
            className="text-xs font-semibold uppercase text-text-muted"
            style={{ letterSpacing: "0.05em" }}
          >
            Or a single month
          </span>
          {activeMonth != null && (
            <button
              type="button"
              onClick={() => onSelectMonth(null)}
              className="text-xs font-medium text-text-subtle transition-colors hover:text-text"
            >
              Full year
            </button>
          )}
        </div>

        <div className="grid grid-cols-6 gap-[5px]">
          {MONTH_INITIALS.map((initial, index) => {
            const count = monthCounts[index] ?? 0;
            const empty = count === 0;
            const active = activeMonth === index + 1;
            return (
              <button
                key={`${initial}-${index}`}
                type="button"
                disabled={empty}
                onClick={() => onSelectMonth(active ? null : index + 1)}
                {...bindTooltip(
                  <>
                    <TooltipTitle>{MONTH_NAMES[index]}</TooltipTitle>
                    <TooltipDetail>
                      {empty
                        ? "Nothing completed"
                        : `${count} ${count === 1 ? "completion" : "completions"}`}
                    </TooltipDetail>
                  </>,
                )}
                className={cn(
                  "flex h-[30px] items-center justify-center rounded-[7px] text-[11px] transition-colors",
                  empty ? "cursor-default" : active ? "font-bold" : "font-semibold hover:bg-white/[0.08]",
                )}
                // Colour is set inline rather than with a Tailwind opacity
                // modifier: the theme colours are raw `var()` strings, and
                // `text-text-subtle/40` cannot inject an alpha channel into
                // one — it silently produces no colour at all, which made
                // empty months look identical to playable ones.
                style={{
                  background: active
                    ? "color-mix(in srgb, var(--color-primary) 32%, transparent)"
                    : "rgba(255,255,255,0.04)",
                  color: active ? "#ffffff" : empty ? "rgba(255,255,255,0.18)" : "var(--color-text-muted)",
                }}
              >
                {initial}
              </button>
            );
          })}
        </div>
      </ReviewCard>
    </div>
  );
}
