import { Trophy } from "lucide-react";
import { cn } from "../../../../lib/utils_ui";
import type { MediaEntry } from "../../../../lib/db";
import type { MostReplayedItem } from "../../../../lib/stats-logic";
import { formatShortDate } from "../../../../lib/dates";
import { PanelEmptyState, PanelFrame } from "../plate-ui";

interface StandoutsPanelProps {
  mostReplayed: MostReplayedItem[];
  perfectEntries: MediaEntry[];
  variant: "compact" | "expanded";
  onPerfectClick: () => void;
  onExpand?: () => void;
}

function StandoutRow({
  name,
  badge,
  badgeTone,
  detail,
  onClick,
}: {
  name: string;
  badge: string;
  badgeTone: "pink" | "amber";
  detail?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="min-w-0 flex-1 truncate text-left text-gray-300">{name}</span>
      {detail ? <span className="shrink-0 text-[9px] text-gray-600">{detail}</span> : null}
      <span
        className={cn(
          "shrink-0 rounded px-1.5 py-px text-[9px] font-semibold tabular-nums",
          badgeTone === "pink" ? "bg-pink-500/15 text-pink-300" : "bg-amber-500/15 text-amber-300"
        )}
      >
        {badge}
      </span>
    </>
  );

  if (!onClick) {
    return <div className="flex items-center gap-2 px-1 py-[3px] text-[11px]">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-1 py-[3px] text-[11px] transition-colors hover:bg-white/5"
    >
      {content}
    </button>
  );
}

export function StandoutsPanel({
  mostReplayed,
  perfectEntries,
  variant,
  onPerfectClick,
  onExpand,
}: StandoutsPanelProps) {
  const isExpanded = variant === "expanded";
  const replays = isExpanded ? mostReplayed : mostReplayed.slice(0, 3);

  // A replayed title that also scored 10 would otherwise appear twice in the
  // same short list; drop it from the perfect section only when it is on screen
  // above, so nothing vanishes in the compact form.
  const shownReplayNames = new Set(replays.map((item) => item.name));
  const dedupedPerfect = perfectEntries.filter((entry) => !shownReplayNames.has(entry.name));
  const perfect = isExpanded ? dedupedPerfect : dedupedPerfect.slice(0, Math.max(0, 7 - replays.length));
  const isEmpty = mostReplayed.length === 0 && perfectEntries.length === 0;

  return (
    <PanelFrame
      title="Standouts"
      subtitle={
        isEmpty
          ? undefined
          : `${mostReplayed.length} replayed · ${perfectEntries.length} perfect`
      }
      accent="pink"
      icon={<Trophy size={13} />}
      onExpand={onExpand}
      bodyClassName="gap-2"
    >
      {isEmpty ? (
        <PanelEmptyState message="No replays or perfect scores in the current selection." />
      ) : (
        <div className={cn("flex min-h-0 flex-1 flex-col gap-2", isExpanded && "overflow-y-auto pr-1")}>
          {replays.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {isExpanded ? (
                <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Most replayed
                </h4>
              ) : null}
              {replays.map((item) => (
                <StandoutRow
                  key={item.name}
                  name={item.name}
                  badge={`${item.total_completions}×`}
                  badgeTone="pink"
                  detail={
                    isExpanded
                      ? item.logs
                          .map((log) => (log.completion_date ? formatShortDate(log.completion_date) : "undated"))
                          .join(" · ")
                      : item.avg_score !== null
                        ? `avg ${item.avg_score.toFixed(1)}`
                        : undefined
                  }
                />
              ))}
            </div>
          ) : null}

          {perfect.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {isExpanded ? (
                <h4 className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Perfect scores
                </h4>
              ) : null}
              {perfect.map((entry) => (
                <StandoutRow
                  key={entry.id}
                  name={entry.name}
                  badge="10"
                  badgeTone="amber"
                  detail={entry.completion_date ? formatShortDate(entry.completion_date) : undefined}
                  onClick={onPerfectClick}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </PanelFrame>
  );
}
