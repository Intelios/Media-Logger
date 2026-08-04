import type { ReactNode } from "react";
import { Activity, BookOpen, Star } from "lucide-react";
import { cn } from "../../lib/utils_ui";
import {
  STATS_WIDGET_META,
  STATS_WIDGET_SECTION_LABELS,
  STATS_WIDGET_SECTION_ORDER,
  type MainWidgetId,
  type StatsWidgetHeightPreset,
  type StatsWidgetLayoutRole,
  type StatsWidgetSection,
  type StatsWidgetSize,
} from "./stats-config";
import { StatsWidgetGrid } from "./StatsWidgetGrid";

interface StatsWidgetGridItem {
  widgetId: MainWidgetId;
  size: Exclude<StatsWidgetSize, "summary">;
  heightPreset: Exclude<StatsWidgetHeightPreset, "summary">;
  layoutRole: Exclude<StatsWidgetLayoutRole, "summary">;
  content: ReactNode;
}

interface StatsSectionGridProps {
  items: StatsWidgetGridItem[];
  isCustomizing: boolean;
  onReorder: (nextVisibleOrder: MainWidgetId[]) => void;
  onHideWidget: (widgetId: MainWidgetId) => void;
}

const SECTION_ICONS: Record<StatsWidgetSection, ReactNode> = {
  scores: <Star size={14} />,
  activity: <Activity size={14} />,
  library: <BookOpen size={14} />,
};

const SECTION_ACCENTS: Record<StatsWidgetSection, { icon: string; divider: string }> = {
  scores: {
    icon: "bg-amber-500/15 text-amber-300 border-amber-500/25",
    divider: "from-amber-500/60 via-white/20 to-transparent",
  },
  activity: {
    icon: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
    divider: "from-emerald-500/60 via-white/20 to-transparent",
  },
  library: {
    icon: "bg-purple-500/15 text-purple-300 border-purple-500/25",
    divider: "from-purple-500/60 via-white/20 to-transparent",
  },
};

function SectionHeader({ section }: { section: StatsWidgetSection }) {
  const accent = SECTION_ACCENTS[section];

  return (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border",
          accent.icon
        )}
      >
        {SECTION_ICONS[section]}
      </div>
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-white">
          {STATS_WIDGET_SECTION_LABELS[section]}
        </h2>
        <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-gray-500">
          {section} section
        </span>
      </div>
      <div className={cn("h-px min-w-0 flex-1 bg-gradient-to-r to-transparent", accent.divider)} />
    </div>
  );
}

function EmptyMainCanvasState({ isCustomizing }: { isCustomizing: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-12 text-center">
      <p className="text-base font-semibold text-white">No main widgets are visible.</p>
      <p className="mt-2 text-sm text-gray-400">
        {isCustomizing ? "Restore widgets from the Customize panel." : "Open Customize to add widgets back to this view."}
      </p>
    </div>
  );
}

export function StatsSectionGrid({
  items,
  isCustomizing,
  onReorder,
  onHideWidget,
}: StatsSectionGridProps) {
  const visibleOrderBySection = new Map<StatsWidgetSection, StatsWidgetGridItem[]>();

  for (const item of items) {
    const section = STATS_WIDGET_META[item.widgetId].section;
    if (!section) {
      continue;
    }

    const sectionItems = visibleOrderBySection.get(section) ?? [];
    sectionItems.push(item);
    visibleOrderBySection.set(section, sectionItems);
  }

  const handleSectionReorder = (section: StatsWidgetSection, nextVisibleOrder: MainWidgetId[]) => {
    const nextFullOrder = STATS_WIDGET_SECTION_ORDER.flatMap((sectionId) => {
      if (sectionId === section) {
        return nextVisibleOrder;
      }

      return (visibleOrderBySection.get(sectionId) ?? []).map((item) => item.widgetId);
    });

    onReorder(nextFullOrder);
  };

  if (items.length === 0) {
    return <EmptyMainCanvasState isCustomizing={isCustomizing} />;
  }

  return (
    <div className="space-y-10">
      {STATS_WIDGET_SECTION_ORDER.map((section) => {
        const sectionItems = visibleOrderBySection.get(section);
        if (!sectionItems || sectionItems.length === 0) {
          return null;
        }

        return (
          <section key={section} className="space-y-5">
            <SectionHeader section={section} />
            <StatsWidgetGrid
              items={sectionItems}
              isCustomizing={isCustomizing}
              onReorder={(nextVisibleOrder) => handleSectionReorder(section, nextVisibleOrder)}
              onHideWidget={onHideWidget}
            />
          </section>
        );
      })}
    </div>
  );
}
