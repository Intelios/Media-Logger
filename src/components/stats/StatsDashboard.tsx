import { Fragment, useEffect, useState } from "react";
import type { FullStats } from "../../lib/stats-logic";
import { StatsPageHeader } from "./StatsPageHeader";
import { StatsSummaryRibbon } from "./StatsSummaryRibbon";
import { StatsWidgetGrid } from "./StatsWidgetGrid";
import { loadStatsDashboardLayout, saveStatsDashboardLayout } from "./stats-layout";
import { getVisibleStatsWidgetDefinitions, STATS_WIDGET_DEFINITIONS } from "./stats-registry";
import type { MainWidgetId, StatsDashboardRenderContext, StatsFilterPreset, StatsPresetKey, StatsWidgetSize } from "./stats-config";

interface StatsDashboardProps {
  activeYear: string;
  yearOptions: string[];
  entryTypes: string[];
  selectedTypes: string[];
  onSelectedTypesChange: (types: string[]) => void;
  presets: StatsFilterPreset[];
  activePreset: StatsPresetKey;
  onPresetClick: (presetKey: Exclude<StatsPresetKey, null>) => void;
  onResetPreset: () => void;
  onActiveYearChange: (year: string) => void;
  data: FullStats;
  onPerfect10Click: () => void;
  onThisMonthClick: () => void;
  onViewAllGenres: () => void;
  onGenreClick: (genreName: string) => void;
}

export function StatsDashboard({
  activeYear,
  yearOptions,
  entryTypes,
  selectedTypes,
  onSelectedTypesChange,
  presets,
  activePreset,
  onPresetClick,
  onResetPreset,
  onActiveYearChange,
  data,
  onPerfect10Click,
  onThisMonthClick,
  onViewAllGenres,
  onGenreClick,
}: StatsDashboardProps) {
  const [layout] = useState(() => loadStatsDashboardLayout(STATS_WIDGET_DEFINITIONS));

  useEffect(() => {
    saveStatsDashboardLayout(layout);
  }, [layout]);

  const renderContext: StatsDashboardRenderContext = {
    activeYear,
    data,
    onPerfect10Click,
    onThisMonthClick,
    onViewAllGenres,
    onGenreClick,
  };

  const summaryWidgets = getVisibleStatsWidgetDefinitions("summary", layout.summaryOrder, renderContext);
  const mainWidgets = getVisibleStatsWidgetDefinitions("main", layout.mainOrder, renderContext).filter(
    (definition) => !layout.hidden.includes(definition.id)
  );
  const visibleSummaryWidgets = summaryWidgets.filter((definition) => !layout.hidden.includes(definition.id));

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-20">
      <StatsPageHeader
        title="Statistics"
        subtitle={`Deep dive analytics for ${activeYear}`}
        entryTypes={entryTypes}
        selectedTypes={selectedTypes}
        onSelectedTypesChange={onSelectedTypesChange}
        yearOptions={yearOptions}
        activeYear={activeYear}
        onActiveYearChange={onActiveYearChange}
        presets={presets}
        activePreset={activePreset}
        onPresetClick={onPresetClick}
        onResetPreset={onResetPreset}
      />

      <StatsSummaryRibbon>
        {visibleSummaryWidgets.map((definition) => (
          <Fragment key={definition.id}>{definition.render(renderContext)}</Fragment>
        ))}
      </StatsSummaryRibbon>

      <StatsWidgetGrid
        items={mainWidgets.map((definition) => ({
          widgetId: definition.id as MainWidgetId,
          size: definition.defaultSize as Exclude<StatsWidgetSize, "summary">,
          content: definition.render(renderContext),
        }))}
      />
    </div>
  );
}
