import { Lock } from "lucide-react";
import { useHoverTooltip, TooltipTitle, TooltipDetail } from "../HoverTooltip";
import { CHAPTER_UI } from "./chapter-ui";
import { IconChip, ReviewCard } from "./review-ui";
import type { AssembledTile } from "../../lib/review-logic";

/**
 * The chapter list, up front. Locked tiles show what unlocks them — the one
 * thing that gives the page a reason to be opened in June rather than only in
 * December.
 *
 * Tiles are derived from the same assembleReel() call the player uses, so a
 * tile can never promise a chapter that will not play.
 */
export function ChapterTileGrid({
  tiles,
  periodNoun,
  onPlayFrom,
}: {
  tiles: AssembledTile[];
  /** "year" or "month" — whichever the current selection is. */
  periodNoun: string;
  onPlayFrom: (index: number) => void;
}) {
  const { bindTooltip } = useHoverTooltip();
  const readyCount = tiles.filter((tile) => tile.state === "ready").length;
  const lockedCount = tiles.length - readyCount;

  // Playable index counts only unlocked tiles, matching the reel's order.
  let playIndex = -1;

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <div className="flex items-baseline justify-between">
        <span
          className="text-[13px] font-semibold uppercase text-text-muted"
          style={{ letterSpacing: "0.05em" }}
        >
          This {periodNoun}&rsquo;s chapters
        </span>
        <span className="text-xs text-text-subtle">
          {readyCount} unlocked
          {lockedCount > 0 ? ` · ${lockedCount} to go` : ""}
        </span>
      </div>

      {tiles.length === 0 ? (
        <ReviewCard className="px-4 py-6">
          <p className="m-0 text-sm text-text-muted">
            Nothing to show for this selection yet. Try a different year, or widen the media types.
          </p>
        </ReviewCard>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {tiles.map((tile) => {
            const ui = CHAPTER_UI[tile.id];
            const Icon = ui.icon;
            const locked = tile.state === "locked";
            if (!locked) playIndex += 1;
            const index = playIndex;

            const tooltip = locked ? (
              <>
                <TooltipTitle>{tile.spec.label}</TooltipTitle>
                <TooltipDetail>{tile.condition}</TooltipDetail>
              </>
            ) : (
              <>
                <TooltipTitle>{tile.spec.label}</TooltipTitle>
                <TooltipDetail>Play from here</TooltipDetail>
              </>
            );

            return (
              <button
                key={tile.id}
                type="button"
                disabled={locked}
                onClick={locked ? undefined : () => onPlayFrom(index)}
                {...bindTooltip(tooltip)}
                className="flex items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left transition-colors disabled:cursor-default"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  borderColor: "rgba(255,255,255,0.06)",
                  opacity: locked ? 0.42 : 1,
                  minHeight: 60,
                }}
              >
                <IconChip tint={locked ? "rgba(255,255,255,0.05)" : ui.tint}>
                  {locked ? (
                    <Lock size={16} color="#6B7280" strokeWidth={2} />
                  ) : (
                    <Icon size={16} color={ui.color} strokeWidth={2} />
                  )}
                </IconChip>
                <span className="flex min-w-0 flex-col gap-px">
                  <span className="truncate text-[13px] font-semibold text-text">
                    {tile.spec.label}
                  </span>
                  {locked && tile.condition && (
                    <span className="truncate text-[11px] text-text-subtle">{tile.condition}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
