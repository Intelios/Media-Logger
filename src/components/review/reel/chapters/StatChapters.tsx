import { AnimatedNumber } from "../../../AnimatedNumber";
import { CoverImage } from "../../../CoverImage";
import { getTypeBadgeStyle } from "../../../../lib/media-config";
import type {
  FinaleData,
  OverviewData,
  RatingsData,
  TypeChampionData,
} from "../../../../lib/review/chapters";
import type { ReviewContext } from "../../../../lib/review-logic";
import {
  ChapterBody,
  ChapterChip,
  ChapterLead,
  ChapterStat,
  ChapterStatRow,
  ChapterSubtitle,
  ChapterTitle,
  StatDivider,
} from "./layout";

export function OverviewChapter({ data, ctx }: { data: OverviewData; ctx: ReviewContext }) {
  return (
    <ChapterBody>
      <ChapterLead eyebrow={`Your ${ctx.period.label}`} width={760}>
        <ChapterTitle size={150} style={{ lineHeight: 0.86 }}>
          <AnimatedNumber value={data.total} />
        </ChapterTitle>
        <p className="m-0 mt-4 text-2xl font-medium text-white/80">
          {data.total === 1 ? "thing finished" : "things finished"}
        </p>

        <ChapterStatRow>
          <ChapterStat value={data.avgScore.toFixed(1)} label="Average score" />
          <StatDivider />
          <ChapterStat value={<AnimatedNumber value={data.typeCount} />} label="Kinds of media" />
          {data.replays > 0 && (
            <>
              <StatDivider />
              <ChapterStat value={<AnimatedNumber value={data.replays} />} label="Replays" />
            </>
          )}
        </ChapterStatRow>
      </ChapterLead>
    </ChapterBody>
  );
}

export function TypeChampionChapter({ data }: { data: TypeChampionData }) {
  const share = Math.round(data.share * 100);
  return (
    <ChapterBody>
      <ChapterLead eyebrow="Your medium" width={820}>
        <ChapterTitle size={116}>{data.champion.name}</ChapterTitle>
        <ChapterSubtitle>
          {data.champion.count} of {data.total} entries &mdash; {share}% of everything you finished.
        </ChapterSubtitle>

        <div className="mt-10 flex max-w-[720px] flex-wrap gap-3">
          {data.breakdown.map((item) => {
            const style = getTypeBadgeStyle(item.name);
            return (
              <ChapterChip key={item.name}>
                <span className="flex items-center gap-1.5">
                  <span className={`flex h-5 w-5 items-center justify-center rounded ${style.bg}`}>
                    {style.icon}
                  </span>
                  {item.name}
                </span>
                <span className="text-white/50">{item.count}</span>
              </ChapterChip>
            );
          })}
        </div>
      </ChapterLead>
    </ChapterBody>
  );
}

export function RatingsChapter({ data }: { data: RatingsData }) {
  const peak = Math.max(...data.bars.map((bar) => bar.count), 1);
  return (
    <ChapterBody>
      <ChapterLead eyebrow="How you rated" width={560}>
        <ChapterTitle size={104}>
          {data.avgScore.toFixed(1)}
          <span className="text-white/35">/10</span>
        </ChapterTitle>
        <ChapterSubtitle>
          Your most-given score was {data.mostCommon.name} &mdash; handed out {data.mostCommon.count}{" "}
          {data.mostCommon.count === 1 ? "time" : "times"} across {data.ratedCount} ratings.
        </ChapterSubtitle>
      </ChapterLead>

      <div className="flex flex-1 flex-col gap-2.5">
        {data.bars.map((bar) => {
          const isPeak = bar.name === data.mostCommon.name;
          const width = (bar.count / peak) * 100;
          return (
            <div key={bar.name} className="flex items-center gap-4">
              <span
                className="w-7 shrink-0 text-right text-sm font-bold tabular-nums"
                style={{ color: isPeak ? "#fbbf24" : "rgba(255,255,255,0.45)" }}
              >
                {bar.name}
              </span>
              <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{
                    width: `${Math.max(width, bar.count > 0 ? 2 : 0)}%`,
                    background: isPeak ? "#fbbf24" : "rgba(255,255,255,0.28)",
                    boxShadow: isPeak ? "0 0 22px rgba(251,191,36,0.45)" : undefined,
                  }}
                />
              </div>
              <span
                className="w-9 shrink-0 text-sm font-semibold tabular-nums"
                style={{ color: isPeak ? "#fbbf24" : "rgba(255,255,255,0.4)" }}
              >
                {bar.count}
              </span>
            </div>
          );
        })}
      </div>
    </ChapterBody>
  );
}

export function FinaleChapter({
  data,
  ctx,
  onSavePoster,
  saving,
}: {
  data: FinaleData;
  ctx: ReviewContext;
  onSavePoster: () => void;
  saving: boolean;
}) {
  return (
    <ChapterBody className="flex-col !items-start justify-center gap-0">
      <ChapterLead eyebrow={`That was ${ctx.period.label}`} width="100%">
        <ChapterTitle size={104}>
          Take it with you
        </ChapterTitle>
        <ChapterSubtitle>
          {data.total} finished, {data.perfectCount} of them perfect, across {data.typeCount}{" "}
          {data.typeCount === 1 ? "kind" : "kinds"} of media.
        </ChapterSubtitle>

        <ChapterStatRow>
          <ChapterStat value={data.total} label="Finished" />
          <StatDivider />
          <ChapterStat value={data.avgScore.toFixed(1)} label="Average" />
          <StatDivider />
          <ChapterStat value={data.perfectCount} label="Perfect" color="#fbbf24" />
          {data.replays > 0 && (
            <>
              <StatDivider />
              <ChapterStat value={data.replays} label="Replays" />
            </>
          )}
        </ChapterStatRow>

        <div className="mt-11 flex items-center gap-5">
          <button
            type="button"
            onClick={onSavePoster}
            disabled={saving}
            className="inline-flex h-[52px] items-center gap-2.5 rounded-full px-7 text-base font-bold text-white transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70"
            style={{
              background: "linear-gradient(to right, var(--color-primary), var(--color-secondary))",
              boxShadow: "0 12px 30px color-mix(in srgb, var(--color-primary) 40%, transparent)",
            }}
          >
            {saving ? "Saving…" : "Save your poster"}
          </button>
          <span className="text-sm text-white/45">A 1080×1350 PNG, drawn from this run.</span>
        </div>

        {data.highlights.length > 0 && (
          <div className="mt-12 flex gap-2.5">
            {data.highlights.slice(0, 12).map((entry) => (
              <div
                key={entry.id}
                className="h-[76px] w-[52px] shrink-0 overflow-hidden rounded-md"
                style={{ boxShadow: "0 10px 22px rgba(0,0,0,0.5)" }}
              >
                <CoverImage
                  path={entry.image_url}
                  alt=""
                  variant="small"
                  sizes="52px"
                  containerClassName="h-full w-full"
                  imageClassName="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        )}
      </ChapterLead>
    </ChapterBody>
  );
}
