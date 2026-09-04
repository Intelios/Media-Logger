import { Play } from "lucide-react";
import { CoverImage } from "../CoverImage";
import { Serif, MetaDot } from "./review-ui";
import type { ReviewContext, ReviewYearTotal } from "../../lib/review-logic";

const NUMBER_WORDS = [
  "no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen", "twenty",
];

function spell(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}

/** Five covers, fanned. Angles and offsets are fixed so the stack never jitters. */
const FAN = [
  { right: 348, top: 46, width: 132, height: 186, rotate: -16, opacity: 0.75 },
  { right: 246, top: 24, width: 142, height: 202, rotate: -9, opacity: 0.86 },
  { right: 140, top: 8, width: 152, height: 216, rotate: -3, opacity: 1 },
  { right: 30, top: 16, width: 152, height: 216, rotate: 5, opacity: 1 },
  { right: -66, top: 40, width: 146, height: 206, rotate: 13, opacity: 0.9 },
];

export function ReviewHero({
  ctx,
  chapterCount,
  years,
  onPlay,
}: {
  ctx: ReviewContext;
  chapterCount: number;
  years: ReviewYearTotal[];
  onPlay: () => void;
}) {
  const covers = ctx.dataset.entries
    .filter((entry) => typeof entry.image_url === "string" && entry.image_url.trim().length > 0)
    .slice(0, FAN.length);

  // A month's total is not comparable to the whole-year figures behind
  // ctx.comparison, so the standing line only makes sense in year mode.
  const others = years.filter((entry) => entry.year !== ctx.period.year);
  const comparison = ctx.comparison;
  const standing =
    ctx.period.month != null || others.length === 0
      ? null
      : others.every((entry) => ctx.basics.total >= entry.count)
        ? "your biggest year yet"
        : comparison
          ? `${comparison.currentCount >= comparison.previousCount ? "up from" : "down from"} ${comparison.previousCount} in ${comparison.previousYear}`
          : null;

  const [firstWord, ...restWords] = ctx.period.label.split(" ");

  return (
    <div
      className="relative flex items-center overflow-hidden rounded-[24px] bg-black"
      style={{ height: 316, boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}
    >
      <div
        className="absolute inset-0"
        style={{
          // Every stop is theme-derived and mixed toward the near-black the
          // reel uses, so a light accent (gold, lime) stays a cinematic wash
          // rather than washing the card out.
          background:
            "radial-gradient(110% 130% at 76% 26%, color-mix(in srgb, var(--color-primary) 82%, #000000) 0%, color-mix(in srgb, var(--color-primary) 40%, #08080A) 38%, color-mix(in srgb, var(--color-primary) 12%, #08080A) 68%, #08080A 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(8,8,10,0.94) 0%, rgba(8,8,10,0.78) 40%, rgba(8,8,10,0.08) 78%)",
        }}
      />

      {/* Fanned covers */}
      <div className="pointer-events-none absolute" style={{ right: 56, top: 30, width: 470, height: 256 }}>
        {covers.map((entry, index) => {
          const spot = FAN[index];
          return (
            <div
              key={entry.id}
              className="absolute overflow-hidden rounded-[12px]"
              style={{
                right: spot.right,
                top: spot.top,
                width: spot.width,
                height: spot.height,
                transform: `rotate(${spot.rotate}deg)`,
                opacity: spot.opacity,
                boxShadow: "0 22px 44px rgba(0,0,0,0.6)",
              }}
            >
              <CoverImage
                path={entry.image_url}
                alt=""
                variant="small"
                sizes="152px"
                containerClassName="h-full w-full"
                imageClassName="h-full w-full object-cover"
              />
            </div>
          );
        })}
      </div>

      <div className="relative flex max-w-[620px] flex-col px-10">
        <div className="mb-3.5 flex items-center gap-2.5">
          <span
            className="inline-flex h-[26px] items-center gap-[7px] rounded-full px-[11px] text-[11px] font-bold uppercase"
            style={{
              letterSpacing: "0.1em",
              background: "rgba(251,191,36,0.18)",
              border: "1px solid rgba(251,191,36,0.32)",
              color: "#fbbf24",
            }}
          >
            <span className="h-[6px] w-[6px] rounded-full" style={{ background: "#fbbf24" }} />
            Ready now
          </span>
          <span className="text-xs font-medium text-white/45" style={{ letterSpacing: "0.06em" }}>
            {ctx.basics.total} {ctx.basics.total === 1 ? "entry" : "entries"} in range
          </span>
        </div>

        <h2 className="m-0 text-white" style={{ textWrap: "balance" }}>
          {/* An inline-block island keeps the serif figure glued to its lead-in
              — a plain space gets axed at a line break and can land as no space. */}
          <Serif style={{ fontSize: 60, lineHeight: 0.98, letterSpacing: "-0.01em" }}>
            Your <Serif italic>{firstWord}</Serif>
            {restWords.length > 0 ? ` ${restWords.join(" ")}` : ""},{" "}
            <span className="inline-block">
              in {spell(chapterCount)} {chapterCount === 1 ? "chapter" : "chapters"}
            </span>
          </Serif>
        </h2>

        <div className="mt-4 flex flex-wrap items-center gap-3.5">
          <span className="text-[15px] font-semibold text-white/85">
            {ctx.basics.total} {ctx.basics.total === 1 ? "entry" : "entries"}
          </span>
          {ctx.basics.perfectTenCount > 0 && (
            <>
              <MetaDot />
              <span className="text-[15px] font-semibold" style={{ color: "#fbbf24" }}>
                {ctx.basics.perfectTenCount} perfect{" "}
                {ctx.basics.perfectTenCount === 1 ? "score" : "scores"}
              </span>
            </>
          )}
          {standing && (
            <>
              <MetaDot />
              <span className="text-[15px] text-white/60">{standing}</span>
            </>
          )}
        </div>

        <div className="mt-7 flex items-center gap-3">
          <button
            type="button"
            onClick={onPlay}
            className="inline-flex items-center gap-2.5 rounded-full px-[26px] text-base font-bold text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
            style={{
              height: 52,
              background: "linear-gradient(to right, var(--color-primary), var(--color-secondary))",
              boxShadow: "0 12px 30px color-mix(in srgb, var(--color-primary) 40%, transparent)",
            }}
          >
            <Play size={18} className="fill-current" />
            Play your {ctx.period.month != null ? "month" : "year"}
          </button>
        </div>
      </div>
    </div>
  );
}
