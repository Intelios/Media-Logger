import { cn } from "../../lib/utils_ui";
import type { FullStats } from "../../lib/stats-logic";
import { StatsCustomizePanel } from "./StatsCustomizePanel";
import { StatsPageHeader } from "./StatsPageHeader";
import { StatsSummaryRibbon } from "./StatsSummaryRibbon";
import { StatsWidgetGrid } from "./StatsWidgetGrid";
import {
  STATS_CUSTOMIZE_WORKSPACE_CLASSNAME,
  STATS_DASHBOARD_VIEW_DEFINITIONS,
  type MainWidgetId,
  type StatsDashboardRenderContext,
  type StatsDashboardViewId,
  type StatsFilterPreset,
  type StatsPresetKey,
  type StatsWidgetDefinition,
  type StatsWidgetDisplayMode,
  type StatsWidgetHeightPreset,
  type StatsWidgetId,
  type StatsWidgetLayoutRole,
  type StatsWidgetSize,
  type SummaryWidgetId,
} from "./stats-config";
import { getStatsDashboardWidgetDisplayMode, type StatsDashboardViewLayout } from "./stats-layout";
import { getOrderedStatsWidgetDefinitions } from "./stats-registry";

interface StatsDashboardProps {
  activeYear: string;
  yearOptions: string[];
  entryTypes: string[];
  selectedTypes: string[];
  profileKeys: Set<string>;
  onSelectedTypesChange: (types: string[]) => void;
  presets: StatsFilterPreset[];
  activePreset: StatsPresetKey;
  onPresetClick: (presetKey: Exclude<StatsPresetKey, null>) => void;
  onResetPreset: () => void;
  onActiveYearChange: (year: string) => void;
  activeView: StatsDashboardViewId;
  onActiveViewChange: (viewId: StatsDashboardViewId) => void;
  isCustomizing: boolean;
  onToggleCustomize: () => void;
  layout: StatsDashboardViewLayout;
  onSummaryOrderChange: (nextVisibleOrder: SummaryWidgetId[]) => void;
  onMainOrderChange: (nextVisibleOrder: MainWidgetId[]) => void;
  onHideWidget: (widgetId: StatsWidgetId) => void;
  onShowWidget: (widgetId: StatsWidgetId) => void;
  onDisplayModeChange: (widgetId: StatsWidgetId, displayMode: StatsWidgetDisplayMode) => void;
  onResetActiveView: () => void;
  data: FullStats;
  onPerfect10Click: () => void;
  onThisMonthClick: () => void;
  onViewAllGenres: () => void;
  onGenreClick: (genreName: string) => void;
  onMultiLogDayClick: (date: string) => void;
  onHeatmapDateClick: (date: string) => void;
}

function isWidgetAvailable(definition: StatsWidgetDefinition, context: StatsDashboardRenderContext) {
  return definition.isAvailable?.(context) ?? true;
}

function toCustomizePanelItem(definition: StatsWidgetDefinition, layout: StatsDashboardViewLayout) {
  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    zone: definition.zone,
    displayModeOptions: definition.displayModeOptions,
    displayMode: getStatsDashboardWidgetDisplayMode(layout.displayModes, definition.id),
  };
}

export function StatsDashboard({
  activeYear,
  yearOptions,
  entryTypes,
  selectedTypes,
  profileKeys,
  onSelectedTypesChange,
  presets,
  activePreset,
  onPresetClick,
  onResetPreset,
  onActiveYearChange,
  activeView,
  onActiveViewChange,
  isCustomizing,
  onToggleCustomize,
  layout,
  onSummaryOrderChange,
  onMainOrderChange,
  onHideWidget,
  onShowWidget,
  onDisplayModeChange,
  onResetActiveView,
  data,
  onPerfect10Click,
  onThisMonthClick,
  onViewAllGenres,
  onGenreClick,
  onMultiLogDayClick,
  onHeatmapDateClick,
}: StatsDashboardProps) {
  const renderContext: StatsDashboardRenderContext = {
    activeYear,
    selectedTypes,
    profileKeys,
    displayModes: layout.displayModes,
    data,
    onPerfect10Click,
    onThisMonthClick,
    onViewAllGenres,
    onGenreClick,
    onMultiLogDayClick,
    onHeatmapDateClick,
  };
  const hiddenSet = new Set(layout.hidden);
  const activeViewDefinition = STATS_DASHBOARD_VIEW_DEFINITIONS[activeView];
  const orderedSummaryWidgets = getOrderedStatsWidgetDefinitions("summary", layout.summaryOrder);
  const orderedMainWidgets = getOrderedStatsWidgetDefinitions("main", layout.mainOrder);

  const availableSummaryWidgets = orderedSummaryWidgets.filter((definition) => isWidgetAvailable(definition, renderContext));
  const unavailableSummaryWidgets = orderedSummaryWidgets.filter((definition) => !isWidgetAvailable(definition, renderContext));
  const visibleSummaryWidgets = availableSummaryWidgets.filter((definition) => !hiddenSet.has(definition.id));
  const hiddenSummaryWidgets = availableSummaryWidgets.filter((definition) => hiddenSet.has(definition.id));

  const availableMainWidgets = orderedMainWidgets.filter((definition) => isWidgetAvailable(definition, renderContext));
  const unavailableMainWidgets = orderedMainWidgets.filter((definition) => !isWidgetAvailable(definition, renderContext));
  const visibleMainWidgets = availableMainWidgets.filter((definition) => !hiddenSet.has(definition.id));
  const hiddenMainWidgets = availableMainWidgets.filter((definition) => hiddenSet.has(definition.id));

  const visiblePanelItems = [...visibleSummaryWidgets, ...visibleMainWidgets].map((definition) =>
    toCustomizePanelItem(definition, layout)
  );
  const hiddenPanelItems = [...hiddenSummaryWidgets, ...hiddenMainWidgets].map((definition) =>
    toCustomizePanelItem(definition, layout)
  );
  const unavailablePanelItems = [...unavailableSummaryWidgets, ...unavailableMainWidgets].map((definition) =>
    toCustomizePanelItem(definition, layout)
  );

  const containerClassName = isCustomizing
    ? STATS_CUSTOMIZE_WORKSPACE_CLASSNAME
    : activeViewDefinition.containerClassName;

  return (
    <div className={cn("mx-auto pb-20", containerClassName)}>
      <StatsPageHeader
        title="Statistics"
        subtitle={`Deep dive analytics for ${activeYear}`}
        views={Object.values(STATS_DASHBOARD_VIEW_DEFINITIONS)}
        activeView={activeView}
        onActiveViewChange={onActiveViewChange}
        isCustomizing={isCustomizing}
        onToggleCustomize={onToggleCustomize}
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

      <div className={cn("mt-8", isCustomizing && "flex items-start gap-6")}>
        <div className={cn("min-w-0 space-y-8", isCustomizing && "flex-1")}>
          <StatsSummaryRibbon
            items={visibleSummaryWidgets.map((definition) => ({
              widgetId: definition.id as SummaryWidgetId,
              content: definition.render(renderContext),
            }))}
            isCustomizing={isCustomizing}
            onReorder={onSummaryOrderChange}
            onHideWidget={(widgetId) => onHideWidget(widgetId)}
          />

          <StatsWidgetGrid
            items={visibleMainWidgets.map((definition) => ({
              widgetId: definition.id as MainWidgetId,
              size: definition.defaultSize as Exclude<StatsWidgetSize, "summary">,
              heightPreset: definition.heightPreset as Exclude<StatsWidgetHeightPreset, "summary">,
              layoutRole: definition.layoutRole as Exclude<StatsWidgetLayoutRole, "summary">,
              content: definition.render(renderContext),
            }))}
            isCustomizing={isCustomizing}
            onReorder={onMainOrderChange}
            onHideWidget={(widgetId) => onHideWidget(widgetId)}
          />
        </div>

        {isCustomizing ? (
          <StatsCustomizePanel
            activeView={activeViewDefinition}
            visibleWidgets={visiblePanelItems}
            hiddenWidgets={hiddenPanelItems}
            unavailableWidgets={unavailablePanelItems}
            onHideWidget={onHideWidget}
            onShowWidget={onShowWidget}
            onDisplayModeChange={onDisplayModeChange}
            onResetView={onResetActiveView}
          />
        ) : null}
      </div>
    </div>
  );
}
