import { useState } from "react";
import { Layers } from "lucide-react";
import { ResponsiveContainer, Treemap } from "recharts";
import type { TreemapNode } from "recharts";
import { cn } from "../../../../lib/utils_ui";
import type { StatItem } from "../../../../lib/stats-logic";
import { BarRow, CATEGORY_PALETTE, PanelEmptyState, PanelFrame } from "../plate-ui";
import { TooltipDetail, TooltipTitle, useHoverTooltip } from "../../../HoverTooltip";

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

// A treemap eats long tails better than a donut, but a few dozen slivers read
// as noise. Cap the visual at the top cells and fold the rest into one bucket;
// the row list below stays complete and scrollable either way.
const TREEMAP_CELL_CAP = 16;

function buildTreemapData(items: StatItem[]) {
  const meaningful = items.filter((item) => item.count > 0);
  const top = meaningful.slice(0, TREEMAP_CELL_CAP);
  const rest = meaningful.slice(TREEMAP_CELL_CAP);

  if (rest.length === 0) {
    return top.map((item) => ({ name: item.name, value: item.count }));
  }

  return [
    ...top.map((item) => ({ name: item.name, value: item.count })),
    { name: `${rest.length} more`, value: rest.reduce((sum, item) => sum + item.count, 0) },
  ];
}

export function CataloguePanel({ items, comparisonItems, total, variant, onExpand }: CataloguePanelProps) {
  const { bindTooltip } = useHoverTooltip();
  const isExpanded = variant === "expanded";
  const [requestedKind, setRequestedKind] = useState<CatalogueKind>("platforms");
  // Mirrors the genres donut: a shared hovered name dims the non-matching
  // treemap cells and rows, so hovering either surface highlights the other.
  const [hoveredName, setHoveredName] = useState<string | null>(null);

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
  const treemapData = isExpanded ? buildTreemapData(activeItems) : [];

  const renderTreemapCell = (node: TreemapNode) => {
    const { x, y, width, height, index, name, value } = node;
    const color = CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
    const dimmed = hoveredName !== null && name !== hoveredName;
    // Name + value labels only on cells big enough to hold them; slivers stay
    // clean and let the rectangle's size carry the proportion.
    const showName = width > 34 && height > 18;
    const showValue = showName && height > 34;

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={2}
          fill={color}
          stroke="rgba(15,15,20,0.45)"
          strokeWidth={1}
          opacity={dimmed ? 0.28 : 1}
          style={{ transition: "opacity 120ms ease-out" }}
        />
        {showName ? (
          <text x={x + 7} y={y + 15} fontSize={11} fontWeight={600} fill="rgba(255,255,255,0.95)">
            {name}
          </text>
        ) : null}
        {showValue ? (
          <text x={x + 7} y={y + 29} fontSize={10} fill="rgba(255,255,255,0.7)">
            {value}
          </text>
        ) : null}
      </g>
    );
  };

  return (
    <PanelFrame
      title="Catalogue"
      subtitle={isExpanded ? `${activeItems.length} ${KIND_LABELS[activeKind].toLowerCase()}` : undefined}
      accent="blue"
      icon={<Layers size={13} />}
      onExpand={onExpand}
      bodyClassName="gap-2"
    >
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

      {isExpanded && treemapData.length > 0 ? (
        // The expanded view's landing visual. The compact panel is dense on
        // purpose, so the treemap only lives here — it gives the eye somewhere
        // to land and makes the long tail legible at a glance.
       <div
          className="mb-4 h-64 shrink-0 w-full overflow-hidden rounded-lg border border-white/5"
         onPointerLeave={() => setHoveredName(null)}
       >
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <Treemap
              data={treemapData}
              dataKey="value"
              nameKey="name"
              aspectRatio={1.6}
              nodeGap={2}
              content={renderTreemapCell}
              isAnimationActive={false}
              onMouseEnter={(node) => setHoveredName(node.name)}
            />
          </ResponsiveContainer>
        </div>
      ) : null}

      <div
        className={cn("flex min-h-0 flex-1 flex-col", isExpanded ? "gap-1.5 overflow-y-auto pr-1" : "gap-2")}
        onPointerLeave={() => setHoveredName(null)}
      >
        {visible.map((item) => (
          <div
            key={item.name}
            onPointerEnter={() => setHoveredName(item.name)}
            style={{
              opacity: hoveredName === null || hoveredName === item.name ? 1 : 0.4,
              transition: "opacity 120ms ease-out",
            }}
          >
            <BarRow
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
          </div>
        ))}
      </div>
    </PanelFrame>
  );
}
