import { PieChart as PieIcon } from "lucide-react";
import type { StatItem } from "../../../../lib/stats-logic";
import { BarRow, CATEGORY_PALETTE, PanelEmptyState, PanelFrame } from "../plate-ui";
import { TooltipDetail, TooltipTitle, useHoverTooltip } from "../../../HoverTooltip";

interface ContentTypesPanelProps {
  mediaTypeBreakdown: StatItem[];
  total: number;
  variant: "compact" | "expanded";
  onExpand?: () => void;
}

export function ContentTypesPanel({ mediaTypeBreakdown, total, variant, onExpand }: ContentTypesPanelProps) {
  const { bindTooltip } = useHoverTooltip();
  const isExpanded = variant === "expanded";
  const maxCount = mediaTypeBreakdown[0]?.count ?? 0;
  const visible = isExpanded ? mediaTypeBreakdown : mediaTypeBreakdown.slice(0, 5);

  return (
    <PanelFrame
      title="Content Types"
      subtitle={`${mediaTypeBreakdown.length} in selection`}
      accent="green"
      icon={<PieIcon size={13} />}
      onExpand={onExpand}
      bodyClassName="gap-1.5"
    >
      {mediaTypeBreakdown.length === 0 ? (
        <PanelEmptyState message="No entries in the current selection." />
      ) : (
        visible.map((type, index) => (
          <BarRow
            key={type.name}
            name={type.name}
            value={type.count}
            fraction={maxCount > 0 ? type.count / maxCount : 0}
            share={total > 0 ? type.count / total : undefined}
            color={CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]}
            nameWidth={isExpanded ? "9rem" : "5rem"}
            hoverProps={bindTooltip(
              <>
                <TooltipTitle>{type.name}</TooltipTitle>
                <TooltipDetail>
                  {type.count} {type.count === 1 ? "entry" : "entries"}
                  {total > 0 ? ` · ${((type.count / total) * 100).toFixed(1)}% of selection` : ""}
                  {type.avgScore !== undefined ? ` · avg ${type.avgScore.toFixed(1)}` : ""}
                </TooltipDetail>
              </>
            )}
          />
        ))
      )}
    </PanelFrame>
  );
}
