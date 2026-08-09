import { useState } from "react";
import { Layers } from "lucide-react";
import { cn } from "../../../../lib/utils_ui";
import type { StatItem } from "../../../../lib/stats-logic";
import { BarRow, PanelEmptyState, PanelFrame } from "../plate-ui";
import { TooltipDetail, TooltipTitle, useHoverTooltip } from "../PlateTooltip";

export const CATALOGUE_KINDS = ["platforms", "franchises", "series", "studios", "authors", "actresses"] as const;
export type CatalogueKind = (typeof CATALOGUE_KINDS)[number];

const KIND_LABELS: Record<CatalogueKind, string> = {
  platforms: "Platforms",
  franchises: "Franchises",
  series: "Series",
  studios: "Studios",
  authors: "Authors",
  actresses: "Actresses",
};

interface CataloguePanelProps {
  items: Record<CatalogueKind, StatItem[]>;
  comparisonItems: Record<CatalogueKind, StatItem[]> | null;
  total: number;
  variant: "compact" | "expanded";
  onExpand?: () => void;
}

export function CataloguePanel({ items, comparisonItems, total, variant, onExpand }: CataloguePanelProps) {
  const { bindTooltip, tooltip } = useHoverTooltip();
  const isExpanded = variant === "expanded";
  const [requestedKind, setRequestedKind] = useState<CatalogueKind>("platforms");

  const availableKinds = CATALOGUE_KINDS.filter((kind) => items[kind].length > 0);
  // Falling back at render time keeps the tab valid when a filter change empties
  // the category that was selected, without an effect round-trip.
  const activeKind = availableKinds.includes(requestedKind) ? requestedKind : availableKinds[0];

  if (!activeKind) {
    return (
      <PanelFrame
        title="Catalogue"
        accent="blue"
        icon={<Layers size={13} />}
        onExpand={onExpand}
      >
        <PanelEmptyState message="No platforms, franchises or credits in the current selection." />
      </PanelFrame>
    );
  }

  const activeItems = items[activeKind];
  const maxCount = activeItems[0]?.count ?? 0;
  const comparisonList = comparisonItems?.[activeKind] ?? null;
  const comparisonMax = comparisonList?.[0]?.count ?? 0;
  const comparisonByName = new Map((comparisonList ?? []).map((item) => [item.name, item.count]));
  const visible = isExpanded ? activeItems : activeItems.slice(0, 6);

  return (
    <PanelFrame
      title="Catalogue"
      subtitle={isExpanded ? `${activeItems.length} ${KIND_LABELS[activeKind].toLowerCase()}` : undefined}
      accent="blue"
      icon={<Layers size={13} />}
      onExpand={onExpand}
      bodyClassName="gap-2"
    >
      {tooltip}
      <div className={cn("flex shrink-0 gap-1", !isExpanded && "overflow-x-auto")}>
        {availableKinds.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setRequestedKind(kind)}
            className={cn(
              "shrink-0 rounded-md border px-2 py-0.5 text-[10px] transition-colors",
              kind === activeKind
                ? "border-sky-400/40 bg-sky-500/15 font-semibold text-sky-200"
                : "border-transparent bg-white/[0.05] text-gray-500 hover:text-gray-300"
            )}
          >
            {KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      <div className={cn("flex min-h-0 flex-1 flex-col", isExpanded ? "gap-1.5 overflow-y-auto pr-1" : "gap-2")}>
        {visible.map((item) => (
          <BarRow
            key={item.name}
            name={item.name}
            value={item.count}
            fraction={maxCount > 0 ? item.count / maxCount : 0}
            ghostFraction={
              comparisonList && comparisonMax > 0 ? (comparisonByName.get(item.name) ?? 0) / comparisonMax : undefined
            }
            share={total > 0 ? item.count / total : undefined}
            color="#38bdf8"
            nameWidth={isExpanded ? "11rem" : "4.5rem"}
            hoverProps={bindTooltip(
              <>
                <TooltipTitle>{item.name}</TooltipTitle>
                <TooltipDetail>
                  {item.count} {item.count === 1 ? "entry" : "entries"}
                  {total > 0 ? ` · ${((item.count / total) * 100).toFixed(1)}% of selection` : ""}
                  {item.avgScore !== undefined ? ` · avg ${item.avgScore.toFixed(1)}` : ""}
                </TooltipDetail>
              </>
            )}
          />
        ))}
      </div>
    </PanelFrame>
  );
}
