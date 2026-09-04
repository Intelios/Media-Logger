import { RotateCcw } from "lucide-react";
import { AnimatedNumber } from "../../../AnimatedNumber";
import { CoverImage } from "../../../CoverImage";
import { formatShortDate } from "../../../../lib/dates";
import { getReplayTerm, getTypeBadgeStyle } from "../../../../lib/media-config";
import type { AwardsData, PerfectTensData, SignatureData } from "../../../../lib/review/chapters";
import type { ReviewContext } from "../../../../lib/review-logic";
import { ScoreMedallion, Serif } from "../../review-ui";
import { ChapterBody, ChapterLead, ChapterSubtitle, ChapterTitle } from "./layout";

export function PerfectTensChapter({ data }: { data: PerfectTensData }) {
  return (
    <ChapterBody>
      <ChapterLead eyebrow="Perfect tens" width={460}>
        <ChapterTitle size={150} style={{ lineHeight: 0.86 }}>
          <AnimatedNumber value={data.count} />
        </ChapterTitle>
        <ChapterSubtitle>
          {data.count === 1
            ? "One thing earned the highest score you give."
            : `${data.count} things earned the highest score you give.`}
        </ChapterSubtitle>
      </ChapterLead>

      <div className="flex flex-1 flex-wrap content-center justify-end gap-3">
        {data.entries
          .filter(
            (entry) =>
              typeof entry.image_url === "string" && entry.image_url.trim().length > 0,
          )
          .slice(0, 18)
          .map((entry) => (
          <div
            key={entry.id}
            className="h-[132px] w-[90px] shrink-0 overflow-hidden rounded-lg"
            style={{ boxShadow: "0 18px 36px rgba(0,0,0,0.55)" }}
          >
            <CoverImage
              path={entry.image_url}
              alt=""
              variant="small"
              sizes="90px"
              containerClassName="h-full w-full"
              imageClassName="h-full w-full object-cover"
            />
          </div>
          ))}
      </div>
    </ChapterBody>
  );
}

export function AwardsChapter({ data, ctx }: { data: AwardsData; ctx: ReviewContext }) {
  const shown = data.awards.slice(0, 6);
  return (
    <ChapterBody>
      <ChapterLead eyebrow="Award night" width={440}>
        <ChapterTitle size={84}>
          {data.awards.length} {data.awards.length === 1 ? "award" : "awards"}
        </ChapterTitle>
        <ChapterSubtitle>
          Handed out in {ctx.period.year}, by you, to you.
        </ChapterSubtitle>
      </ChapterLead>

      <div className="flex flex-1 flex-col gap-3">
        {shown.map((award) => (
          <div
            key={`${award.category}-${award.winner}`}
            className="flex items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.05] p-3"
          >
            <div className="h-[62px] w-[44px] shrink-0 overflow-hidden rounded-md">
              <CoverImage
                path={award.imageUrl}
                alt=""
                variant="small"
                sizes="44px"
                containerClassName="h-full w-full"
                imageClassName="h-full w-full object-cover"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className="truncate text-[11px] font-bold uppercase"
                style={{ letterSpacing: "0.16em", color: "#fbbf24" }}
              >
                {award.category}
              </span>
              <span className="truncate text-lg text-white">
                <Serif style={{ fontSize: 22, lineHeight: 1.15 }}>{award.winner}</Serif>
              </span>
            </div>
            {award.score != null && (
              <span className="shrink-0 text-xl font-extrabold" style={{ color: "#fbbf24" }}>
                {Number.isInteger(award.score) ? award.score : award.score.toFixed(1)}
              </span>
            )}
          </div>
        ))}
        {data.awards.length > shown.length && (
          <span className="text-sm text-white/45">
            and {data.awards.length - shown.length} more.
          </span>
        )}
      </div>
    </ChapterBody>
  );
}

/**
 * The signature frame: the year's highest-rated entry, with the note the user
 * wrote about it at the time.
 *
 * Three things are optional and each collapses cleanly rather than leaving a
 * hole: the note (most entries have none), the cover, and the replay marker.
 */
export function SignatureChapter({ data }: { data: SignatureData; ctx: ReviewContext }) {
  const { entry, note, score } = data;
  const hasCover = typeof entry.image_url === "string" && entry.image_url.trim().length > 0;
  const badge = getTypeBadgeStyle(entry.entry_type);
  const replay = getReplayTerm(entry.entry_type);

  return (
    <ChapterBody className={hasCover ? undefined : "justify-center"}>
      <ChapterLead eyebrow="No. 01 of the year" width={hasCover ? 640 : 860}>
        <ChapterTitle size={hasCover ? 96 : 116}>{entry.name}</ChapterTitle>

        <div className="mt-7 flex flex-wrap items-center gap-3.5">
          {entry.entry_type && (
            <span
              className={`inline-flex h-[30px] items-center gap-[7px] rounded-full px-3.5 text-xs font-bold text-white ${badge.bg}`}
              style={{ letterSpacing: "0.04em" }}
            >
              {badge.icon}
              {entry.entry_type}
            </span>
          )}
          {entry.completion_date && (
            <span className="text-[15px] font-medium text-white/60">
              Finished {formatShortDate(entry.completion_date)}
            </span>
          )}
          {entry.is_rewatch === 1 && (
            <>
              <span className="h-[3px] w-[3px] rounded-full bg-white/30" />
              <span
                className="inline-flex items-center gap-1.5 text-[15px] font-semibold"
                style={{ color: "#fbbf24" }}
              >
                <RotateCcw size={15} />
                {replay.label}
              </span>
            </>
          )}
        </div>

        {/* No note is the common case — drop the whole block rather than
            leaving an empty rule where a quote should be. */}
        {note ? (
          <div
            className="mt-11 flex flex-col gap-3 pl-7"
            style={{ borderLeft: "2px solid rgba(251,191,36,0.55)" }}
          >
            <span
              className="text-[11px] font-bold uppercase text-white/45"
              style={{ letterSpacing: "0.24em" }}
            >
              What you wrote at the time
            </span>
            <p className="m-0 text-white/90" style={{ textWrap: "pretty" }}>
              <Serif italic style={{ fontSize: 29, lineHeight: 1.34 }}>
                &ldquo;{note.length > 260 ? `${note.slice(0, 257).trimEnd()}…` : note}&rdquo;
              </Serif>
            </p>
          </div>
        ) : (
          <div className="mt-10 flex items-center gap-6">
            <ScoreMedallion score={score} size={96} />
            <span className="max-w-[320px] text-[15px] leading-relaxed text-white/55">
              {data.isOnlyPerfect
                ? "The only perfect score you gave all run."
                : "The highest you scored anything in this run."}
            </span>
          </div>
        )}
      </ChapterLead>

      {hasCover && (
        <div className="relative shrink-0" style={{ width: 372, height: 524 }}>
          <div
            className="absolute inset-0 overflow-hidden rounded-2xl"
            style={{
              transform: "rotate(-1.5deg)",
              boxShadow:
                "0 48px 90px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.14), 0 0 90px rgba(251,191,36,0.16)",
            }}
          >
            <CoverImage
              path={entry.image_url}
              alt=""
              variant="card"
              priority="high"
              sizes="372px"
              containerClassName="h-full w-full"
              imageClassName="h-full w-full object-cover"
            />
          </div>
          {/* When the note took the left column, the score lives here instead. */}
          {note && (
            <div className="absolute" style={{ left: -46, bottom: 44 }}>
              <ScoreMedallion score={score} />
            </div>
          )}
        </div>
      )}
    </ChapterBody>
  );
}
