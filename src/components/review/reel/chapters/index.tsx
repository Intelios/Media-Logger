import type { ReactNode } from "react";
import type { ReelChapterId, ReviewContext } from "../../../../lib/review-logic";
import {
  FinaleChapter,
  OverviewChapter,
  RatingsChapter,
  TypeChampionChapter,
} from "./StatChapters";
import { BiggestMonthChapter, BookendsChapter, VersusChapter } from "./TimeChapters";
import {
  ConstellationChapter,
  TopFranchiseChapter,
  TopGenreChapter,
} from "./TasteChapters";
import { AwardsChapter, PerfectTensChapter, SignatureChapter } from "./HighlightChapters";

export interface ChapterRenderProps {
  /** Narrowed by each renderer — the registry erases the per-chapter type. */
  data: never;
  ctx: ReviewContext;
  onSavePoster: () => void;
  saving: boolean;
}

/**
 * Renderer per chapter id, matching the specs in lib/review/chapters.ts.
 *
 * The spec side stays free of React so the gating logic is pure; this side
 * holds everything that draws. The two are joined only by the id.
 */
export const CHAPTER_RENDERERS: Record<
  ReelChapterId,
  (props: ChapterRenderProps) => ReactNode
> = {
  overview: ({ data, ctx }) => <OverviewChapter data={data} ctx={ctx} />,
  "type-champion": ({ data }) => <TypeChampionChapter data={data} />,
  "biggest-month": ({ data }) => <BiggestMonthChapter data={data} />,
  bookends: ({ data }) => <BookendsChapter data={data} />,
  "top-genre": ({ data }) => <TopGenreChapter data={data} />,
  constellation: ({ data }) => <ConstellationChapter data={data} />,
  "top-franchise": ({ data }) => <TopFranchiseChapter data={data} />,
  ratings: ({ data }) => <RatingsChapter data={data} />,
  "perfect-tens": ({ data }) => <PerfectTensChapter data={data} />,
  versus: ({ data, ctx }) => <VersusChapter data={data} ctx={ctx} />,
  awards: ({ data, ctx }) => <AwardsChapter data={data} ctx={ctx} />,
  signature: ({ data, ctx }) => <SignatureChapter data={data} ctx={ctx} />,
  finale: ({ data, ctx, onSavePoster, saving }) => (
    <FinaleChapter data={data} ctx={ctx} onSavePoster={onSavePoster} saving={saving} />
  ),
};
