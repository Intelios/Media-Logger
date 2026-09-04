import { AnimatedNumber } from "../../../AnimatedNumber";
import { CoverImage } from "../../../CoverImage";
import { formatShortDate } from "../../../../lib/dates";
import { cn } from "../../../../lib/utils_ui";
import type { BiggestMonthData, BookendsData, VersusData } from "../../../../lib/review/chapters";
import type { ReviewContext } from "../../../../lib/review-logic";
import {
  ChapterBody,
  ChapterLead,
  ChapterStat,
  ChapterStatRow,
  ChapterSubtitle,
  ChapterTitle,
  StatDivider,
} from "./layout";

export function BiggestMonthChapter({ data }: { data: BiggestMonthData }) {
  const peak = Math.max(...data.months.map((month) => month.completions), 1);
  return (
    <ChapterBody>
      <ChapterLead eyebrow="Your biggest month" width={620}>
        <ChapterTitle size={104}>{data.monthName}</ChapterTitle>
        <ChapterSubtitle>
          <AnimatedNumber value={data.count} />{" "}
          {data.count === 1 ? "completion" : "completions"} in a single month.
        </ChapterSubtitle>

        <div className="mt-11 flex h-28 items-end gap-2">
          {data.months.map((month) => {
            const isPeak = month.completions === peak;
            const height = (month.completions / peak) * 100;
            return (
              <div key={month.key} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-t-md transition-[height] duration-700 ease-out"
                  style={{
                    height: `${Math.max(height, month.completions > 0 ? 4 : 2)}%`,
                    background: isPeak ? "#ffffff" : "rgba(255,255,255,0.26)",
                  }}
                />
                <span
                  className={cn("text-[10px]", isPeak ? "font-bold text-white" : "text-white/40")}
                >
                  {month.label.slice(0, 1)}
                </span>
              </div>
            );
          })}
        </div>
      </ChapterLead>

      {data.entries.length > 0 && (
        <div className="flex max-w-[520px] flex-wrap justify-end gap-3">
          {data.entries.slice(0, 8).map((entry) => (
            <div
              key={entry.id}
              className="h-[120px] w-[82px] shrink-0 overflow-hidden rounded-lg"
              style={{ boxShadow: "0 16px 34px rgba(0,0,0,0.55)" }}
            >
              <CoverImage
                path={entry.image_url}
                alt=""
                variant="small"
                sizes="82px"
                containerClassName="h-full w-full"
                imageClassName="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      )}
    </ChapterBody>
  );
}

export function BookendsChapter({ data }: { data: BookendsData }) {
  const end = (
    entry: BookendsData["first"],
    label: string,
    align: "start" | "end",
  ) => (
    <div className={cn("flex max-w-[380px] flex-col gap-4", align === "end" && "items-end text-right")}>
      <span
        className="text-[11px] font-bold uppercase text-white/70"
        style={{ letterSpacing: "0.22em", textShadow: "0 2px 10px rgba(0,0,0,0.85)" }}
      >
        {label} &middot; {formatShortDate(entry.completion_date)}
      </span>
      <div
        className="h-[228px] w-[156px] overflow-hidden rounded-xl"
        style={{ boxShadow: "0 26px 52px rgba(0,0,0,0.6)" }}
      >
        <CoverImage
          path={entry.image_url}
          alt=""
          variant="card"
          sizes="156px"
          containerClassName="h-full w-full"
          imageClassName="h-full w-full object-cover"
        />
      </div>
      <ChapterTitle size={38} style={{ textShadow: "0 2px 16px rgba(0,0,0,0.85)" }}>
        {entry.name}
      </ChapterTitle>
    </div>
  );

  return (
    <ChapterBody className="!items-center justify-between">
      {end(data.first, "First", "start")}

      <div className="flex shrink-0 flex-col items-center gap-3 px-8">
        <div className="h-24 w-px bg-white/15" />
        <span
          className="whitespace-nowrap text-[11px] font-bold uppercase text-white/75"
          // This chapter is centred, so its label lands on the brightest part
          // of the backdrop rather than in the stage's side scrims.
          style={{ letterSpacing: "0.2em", textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}
        >
          {data.dayGap === 0
            ? "Same day"
            : `${data.dayGap} ${data.dayGap === 1 ? "day" : "days"} apart`}
        </span>
        <div className="h-24 w-px bg-white/15" />
      </div>

      {end(data.last, "Last", "end")}
    </ChapterBody>
  );
}

export function VersusChapter({ data, ctx }: { data: VersusData; ctx: ReviewContext }) {
  const peak = Math.max(data.currentCount, data.previousCount, 1);
  const ahead = data.countDelta >= 0;
  const accent = ahead ? "#34d399" : "#fb7185";
  const percent =
    data.countRatio != null ? `${ahead ? "+" : ""}${Math.round(data.countRatio * 100)}%` : null;

  const scoreShift =
    data.currentAvg != null && data.previousAvg != null
      ? data.currentAvg - data.previousAvg
      : null;

  return (
    <ChapterBody>
      <ChapterLead
        eyebrow={ahead ? `You beat your ${data.previousYear} self` : `${data.previousYear} had the edge`}
        eyebrowColor={accent}
        width={560}
      >
        <ChapterTitle size={104}>
          {ahead ? "Up" : "Down"} {Math.abs(data.countDelta)}
        </ChapterTitle>
        <ChapterSubtitle>
          {data.currentCount} in {ctx.period.year}, against {data.previousCount} in{" "}
          {data.previousYear}
          {scoreShift != null && Math.abs(scoreShift) >= 0.05
            ? ` — and ${Math.abs(scoreShift).toFixed(1)} of a point ${scoreShift > 0 ? "more generous" : "pickier"}.`
            : "."}
        </ChapterSubtitle>

        {percent && (
          <ChapterStatRow>
            <ChapterStat value={percent} label="Volume" color={accent} />
            {data.currentAvg != null && (
              <>
                <StatDivider />
                <ChapterStat value={data.currentAvg.toFixed(1)} label={`${ctx.period.year} average`} />
              </>
            )}
            {data.previousAvg != null && (
              <>
                <StatDivider />
                <ChapterStat
                  value={data.previousAvg.toFixed(1)}
                  label={`${data.previousYear} average`}
                  color="rgba(255,255,255,0.5)"
                />
              </>
            )}
          </ChapterStatRow>
        )}
      </ChapterLead>

      <div className="flex flex-1 flex-col gap-8">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-white/55">{data.previousYear}</span>
            <span
              className="text-xl font-extrabold text-white/55"
              style={{ letterSpacing: "-0.02em" }}
            >
              {data.previousCount}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full bg-white/25 transition-[width] duration-700 ease-out"
              style={{ width: `${(data.previousCount / peak) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold" style={{ color: accent }}>
              {ctx.period.year}
            </span>
            <span
              className="text-4xl font-extrabold"
              style={{ letterSpacing: "-0.03em", color: accent }}
            >
              {data.currentCount}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{
                width: `${(data.currentCount / peak) * 100}%`,
                background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 70%, #000000), ${accent})`,
                boxShadow: `0 0 22px ${accent}80`,
              }}
            />
          </div>
        </div>
      </div>
    </ChapterBody>
  );
}
