/**
 * Public surface of the Review feature.
 *
 * Internals live in ./review/ — the same shape src/lib/backup, collections
 * and profiles already use. Consumers import from here and nowhere else.
 */

export {
  getReviewAwards,
  getReviewYearCovers,
  getReviewYearTypeTotals,
  getReviewNote,
} from "./review/queries";

export {
  buildReviewContext,
  selectBookends,
  selectComparison,
  selectYearTotals,
  type ReviewContextInput,
} from "./review/context";

export {
  assembleReel,
  reelNeedsNote,
  REEL_CHAPTERS,
  REEL_UNLOCKS,
} from "./review/chapters";

export {
  REEL_CHAPTER_IDS,
  type AssembledChapter,
  type AssembledReel,
  type AssembledTile,
  type BackdropPicker,
  type ChapterTileState,
  type PosterData,
  type ReelChapterId,
  type ReelChapterSpec,
  type ReviewAward,
  type ReviewBookends,
  type ReviewComparison,
  type ReviewContext,
  type ReviewYearCoverRow,
  type ReviewYearTotal,
  type ReviewYearTypeRow,
} from "./review/types";

export {
  buildPosterData,
  renderReviewPoster,
  revealPoster,
  saveReviewPoster,
  type PosterSaveResult,
} from "./review/poster";

export { type ReviewParams } from "./review/types";
