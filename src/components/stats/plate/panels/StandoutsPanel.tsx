import { Trophy } from "lucide-react";
import { cn } from "../../../../lib/utils_ui";
import type { MediaEntry } from "../../../../lib/db";
import type { MostReplayedItem } from "../../../../lib/stats-logic";
import { formatShortDate } from "../../../../lib/dates";
import { CoverImage, PanelEmptyState, PanelFrame } from "../plate-ui";
import { TooltipDetail, TooltipTitle, useHoverTooltip } from "../PlateTooltip";

interface StandoutsPanelProps {
  mostReplayed: MostReplayedItem[];
  perfectEntries: MediaEntry[];
  /** Every entry in the selection — used to find cover art for replayed titles. */
  rangedEntries: MediaEntry[];
  variant: "compact" | "expanded";
  onPerfectClick: () => void;
  onExpand?: () => void;
}

interface Standout {
  key: string;
  name: string;
  imagePath: string | null;
  badge: string;
  tone: "replay" | "perfect";
  detail: string;
  tooltip: { title: string; lines: string[] };
  onClick?: () => void;
}

const TONE_CLASSES: Record<Standout["tone"], string> = {
  replay: "bg-pink-500/85 text-white",
  perfect: "bg-amber-400/90 text-black",
};

function StandoutCover({ standout, compact }: { standout: Standout; compact: boolean }) {
  const { bindTooltip, tooltip } = useHoverTooltip();

  const body = (
    <>
      <span className="relative block w-full overflow-hidden rounded-md border border-white/10 bg-white/[0.04]">
        <CoverImage
          path={standout.imagePath}
          className="aspect-[3/4] w-full transition-transform duration-200 group-hover:scale-[1.04]"
        />
        <span
          className={cn(
            "absolute right-1 top-1 rounded px-1.5 py-px text-[9px] font-bold tabular-nums shadow-sm",
            TONE_CLASSES[standout.tone]
          )}
        >
          {standout.badge}
        </span>
      </span>
      <span className="mt-1 block truncate text-left text-[10px] leading-tight text-gray-400">{standout.name}</span>
      {!compact ? (
        <span className="block truncate text-left text-[9px] leading-tight text-gray-600">{standout.detail}</span>
      ) : null}
    </>
  );

  return (
    <>
      {tooltip}
      <button
        type="button"
        onClick={standout.onClick}
        disabled={!standout.onClick}
        {...bindTooltip(
          <>
            <TooltipTitle>{standout.tooltip.title}</TooltipTitle>
            {standout.tooltip.lines.map((line) => (
              <TooltipDetail key={line}>{line}</TooltipDetail>
            ))}
          </>
        )}
        className={cn(
          "group block min-w-0 rounded-lg p-0.5 text-left transition-colors",
          standout.onClick ? "cursor-pointer hover:bg-white/5" : "cursor-default"
        )}
      >
        {body}
      </button>
    </>
  );
}

export function StandoutsPanel({
  mostReplayed,
  perfectEntries,
  rangedEntries,
  variant,
  onPerfectClick,
  onExpand,
}: StandoutsPanelProps) {
  const isExpanded = variant === "expanded";

  // MostReplayedItem is grouped by name and carries no artwork, so pair it back
  // up with any logged entry of the same name to get a cover.
  const coverByName = new Map<string, string | null>();
  for (const entry of rangedEntries) {
    if (entry.image_url && !coverByName.has(entry.name)) {
      coverByName.set(entry.name, entry.image_url);
    }
  }

  const replayStandouts: Standout[] = mostReplayed.map((item) => ({
    key: `replay-${item.name}`,
    name: item.name,
    imagePath: coverByName.get(item.name) ?? null,
    badge: `${item.total_completions}×`,
    tone: "replay",
    detail: item.avg_score !== null ? `avg ${item.avg_score.toFixed(1)}` : "unrated",
    tooltip: {
      title: item.name,
      lines: [
        `${item.total_completions} completions · ${item.rewatch_count} marked as rewatch`,
        item.avg_score !== null ? `Average score ${item.avg_score.toFixed(1)}` : "No score recorded",
        item.logs
          .map((log) => (log.completion_date ? formatShortDate(log.completion_date) : "undated"))
          .join(" · "),
      ],
    },
  }));

  const shownReplayNames = new Set(
    (isExpanded ? replayStandouts : replayStandouts.slice(0, 3)).map((item) => item.name)
  );

  const perfectStandouts: Standout[] = perfectEntries
    .filter((entry) => !shownReplayNames.has(entry.name))
    .map((entry) => ({
      key: `perfect-${entry.id}`,
      name: entry.name,
      imagePath: entry.image_url,
      badge: "10",
      tone: "perfect",
      detail: entry.completion_date ? formatShortDate(entry.completion_date) : "undated",
      tooltip: {
        title: entry.name,
        lines: [
          `Perfect score${entry.entry_type ? ` · ${entry.entry_type}` : ""}`,
          entry.completion_date ? `Completed ${formatShortDate(entry.completion_date)}` : "No completion date",
          "Click to open all perfect scores",
        ],
      },
      onClick: onPerfectClick,
    }));

  const isEmpty = replayStandouts.length === 0 && perfectStandouts.length === 0;

  // Six covers fill a quarter-width panel as two rows of three.
  const compactStandouts = [...replayStandouts.slice(0, 3), ...perfectStandouts].slice(0, 6);
  const visible = isExpanded ? [...replayStandouts, ...perfectStandouts] : compactStandouts;

  return (
    <PanelFrame
      title="Standouts"
      subtitle={
        isEmpty ? undefined : `${mostReplayed.length} replayed · ${perfectEntries.length} perfect`
      }
      accent="pink"
      icon={<Trophy size={13} />}
      onExpand={onExpand}
      bodyClassName="gap-2"
    >
      {isEmpty ? (
        <PanelEmptyState message="No replays or perfect scores in the current selection." />
      ) : (
        <div
          className={cn(
            "grid min-h-0 auto-rows-min gap-x-2 gap-y-1",
            isExpanded ? "grid-cols-6 overflow-y-auto pr-1" : "grid-cols-3"
          )}
        >
          {visible.map((standout) => (
            <StandoutCover key={standout.key} standout={standout} compact={!isExpanded} />
          ))}
        </div>
      )}
    </PanelFrame>
  );
}
