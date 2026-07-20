import {
  Building2,
  Calendar,
  Gamepad2,
  Hash,
  Heart,
  PieChart as PieIcon,
  RefreshCw,
  Sparkles,
  Star,
  Trophy,
  User,
} from "lucide-react";
import { StatsSummaryCard } from "./StatsSummaryCard";
import {
  DEFAULT_STATS_WIDGET_DISPLAY_MODE,
  STATS_WIDGET_META,
  type StatsDashboardRenderContext,
  type StatsWidgetDefinition,
  type StatsWidgetId,
  type StatsWidgetZone,
} from "./stats-config";
import { AverageScoreByTypeWidget } from "./widgets/AverageScoreByTypeWidget";
import { BreakdownListWidget } from "./widgets/BreakdownListWidget";
import { CompletionHeatmapWidget } from "./widgets/CompletionHeatmapWidget";
import { ContentTypeBreakdownWidget } from "./widgets/ContentTypeBreakdownWidget";
import { MostReplayedWidget } from "./widgets/MostReplayedWidget";
import { MultiLogDaysWidget } from "./widgets/MultiLogDaysWidget";
import { MonthlyActivityWidget } from "./widgets/MonthlyActivityWidget";
import { RatingDistributionWidget } from "./widgets/RatingDistributionWidget";
import { ScoreTrendWidget } from "./widgets/ScoreTrendWidget";
import { TopGenresWidget } from "./widgets/TopGenresWidget";

function isRelevantToEntryTypes(selectedTypes: string[], relevantTypes: string[]) {
  if (selectedTypes.length === 0) {
    return true;
  }

  return selectedTypes.some((entryType) => relevantTypes.includes(entryType));
}

function shouldIncludeProfileBackedItem(itemCount: number, itemName: string, profileType: string, profileKeys: Set<string>, profileKeysReady: boolean) {
  if (!profileKeysReady) return true;
  return itemCount >= 3 || profileKeys.has(`${profileType}:${itemName}`);
}

const createStatsWidgetDefinition = (
  widgetId: StatsWidgetId,
  definition: Pick<StatsWidgetDefinition, "render" | "isAvailable">
): StatsWidgetDefinition => ({
  ...STATS_WIDGET_META[widgetId],
  ...definition,
});

export const STATS_WIDGET_DEFINITIONS: Record<StatsWidgetId, StatsWidgetDefinition> = {
  "total-entries": createStatsWidgetDefinition("total-entries", {
    render: (context) => (
      <StatsSummaryCard
        widgetId="total-entries"
        icon={<Hash />}
        label={STATS_WIDGET_META["total-entries"].title}
        value={context.data.total}
        color="blue"
      />
    ),
  }),
  "average-score": createStatsWidgetDefinition("average-score", {
    render: (context) => (
      <StatsSummaryCard
        widgetId="average-score"
        icon={<Star />}
        label={STATS_WIDGET_META["average-score"].title}
        value={context.data.average_score.toFixed(1)}
        color="amber"
      />
    ),
  }),
  rewatches: createStatsWidgetDefinition("rewatches", {
    render: (context) => (
      <StatsSummaryCard
        widgetId="rewatches"
        icon={<RefreshCw />}
        label={STATS_WIDGET_META.rewatches.title}
        value={context.data.rewatch_count}
        color="green"
      />
    ),
  }),
  "perfect-tens": createStatsWidgetDefinition("perfect-tens", {
    render: (context) => (
      <StatsSummaryCard
        widgetId="perfect-tens"
        icon={<Trophy />}
        label={STATS_WIDGET_META["perfect-tens"].title}
        value={context.data.perfectTenCount}
        color="pink"
        onClick={context.onPerfect10Click}
      />
    ),
  }),
  "this-month": createStatsWidgetDefinition("this-month", {
    render: (context) => (
      <StatsSummaryCard
        widgetId="this-month"
        icon={<Calendar />}
        label={STATS_WIDGET_META["this-month"].title}
        value={context.data.entriesThisMonth}
        color="cyan"
        onClick={context.onThisMonthClick}
      />
    ),
  }),
  "genres-count": createStatsWidgetDefinition("genres-count", {
    render: (context) => (
      <StatsSummaryCard
        widgetId="genres-count"
        icon={<PieIcon />}
        label={STATS_WIDGET_META["genres-count"].title}
        value={context.data.genres.length}
        color="purple"
      />
    ),
  }),
  "monthly-activity": createStatsWidgetDefinition("monthly-activity", {
    isAvailable: (context) => context.activeYear !== "All Time",
    render: (context) => (
      <MonthlyActivityWidget
        monthlyCompletions={context.data.monthlyCompletions}
        activeYear={context.activeYear}
        selectedTypes={context.selectedTypes}
        comparisonYearOptions={context.comparisonYearOptions}
      />
    ),
  }),
  "rating-distribution": createStatsWidgetDefinition("rating-distribution", {
    render: (context) => <RatingDistributionWidget ratings={context.data.ratings} />,
  }),
  "top-genres": createStatsWidgetDefinition("top-genres", {
    render: (context) => (
      <TopGenresWidget
        genres={context.data.genres}
        totalFilteredEntries={context.data.total}
        onViewAllGenres={context.onViewAllGenres}
        onGenreClick={context.onGenreClick}
      />
    ),
  }),
  "content-type-breakdown": createStatsWidgetDefinition("content-type-breakdown", {
    render: (context) => (
      <ContentTypeBreakdownWidget items={context.data.mediaTypeBreakdown} totalEntries={context.data.total} />
    ),
  }),
  "multi-log-days": createStatsWidgetDefinition("multi-log-days", {
    render: (context) => (
      <MultiLogDaysWidget
        multiLogDays={context.data.multiLogDays}
        onDayClick={context.onMultiLogDayClick}
      />
    ),
  }),
  "score-trend": createStatsWidgetDefinition("score-trend", {
    render: (context) => (
      <ScoreTrendWidget
        timeline={context.data.scoreTimeline}
        granularity={context.data.scoreTimelineGranularity}
        activeYear={context.activeYear}
        selectedTypes={context.selectedTypes}
        comparisonYearOptions={context.comparisonYearOptions}
      />
    ),
  }),
  "average-score-by-type": createStatsWidgetDefinition("average-score-by-type", {
    render: (context) => <AverageScoreByTypeWidget items={context.data.averageScoreByType} />,
  }),
  platforms: createStatsWidgetDefinition("platforms", {
    isAvailable: (context) => isRelevantToEntryTypes(context.selectedTypes, ["Game"]),
    render: (context) => (
      <BreakdownListWidget
        widgetId="platforms"
        icon={<Gamepad2 size={18} />}
        items={context.data.platforms.filter((item) =>
          shouldIncludeProfileBackedItem(item.count, item.name, "platform", context.profileKeys, context.profileKeysReady)
        )}
        accentColor="blue"
        displayMode={context.displayModes.platforms ?? DEFAULT_STATS_WIDGET_DISPLAY_MODE}
      />
    ),
  }),
  franchises: createStatsWidgetDefinition("franchises", {
    isAvailable: (context) => isRelevantToEntryTypes(context.selectedTypes, ["Game"]),
    render: (context) => (
      <BreakdownListWidget
        widgetId="franchises"
        icon={<Sparkles size={18} />}
        items={context.data.franchises.filter((item) =>
          shouldIncludeProfileBackedItem(item.count, item.name, "franchise", context.profileKeys, context.profileKeysReady)
        )}
        accentColor="cyan"
        displayMode={context.displayModes.franchises ?? DEFAULT_STATS_WIDGET_DISPLAY_MODE}
      />
    ),
  }),
  studios: createStatsWidgetDefinition("studios", {
    isAvailable: (context) => isRelevantToEntryTypes(context.selectedTypes, ["JAV", "Hentai"]),
    render: (context) => (
      <BreakdownListWidget
        widgetId="studios"
        icon={<Building2 size={18} />}
        items={context.data.studios.filter((item) =>
          shouldIncludeProfileBackedItem(item.count, item.name, "director", context.profileKeys, context.profileKeysReady)
        )}
        accentColor="purple"
        displayMode={context.displayModes.studios ?? DEFAULT_STATS_WIDGET_DISPLAY_MODE}
      />
    ),
  }),
  authors: createStatsWidgetDefinition("authors", {
    isAvailable: (context) => isRelevantToEntryTypes(context.selectedTypes, ["Book"]),
    render: (context) => (
      <BreakdownListWidget
        widgetId="authors"
        icon={<User size={18} />}
        items={context.data.authors.filter((item) =>
          shouldIncludeProfileBackedItem(item.count, item.name, "author", context.profileKeys, context.profileKeysReady)
        )}
        accentColor="green"
        displayMode={context.displayModes.authors ?? DEFAULT_STATS_WIDGET_DISPLAY_MODE}
      />
    ),
  }),
  actresses: createStatsWidgetDefinition("actresses", {
    isAvailable: (context) => isRelevantToEntryTypes(context.selectedTypes, ["JAV", "Hentai"]),
    render: (context) => (
      <BreakdownListWidget
        widgetId="actresses"
        icon={<Heart size={18} />}
        items={context.data.actresses.filter((item) =>
          shouldIncludeProfileBackedItem(item.count, item.name, "actress", context.profileKeys, context.profileKeysReady)
        )}
        accentColor="pink"
        displayMode={context.displayModes.actresses ?? DEFAULT_STATS_WIDGET_DISPLAY_MODE}
      />
    ),
  }),
  "most-replayed": createStatsWidgetDefinition("most-replayed", {
    render: (context) => <MostReplayedWidget items={context.data.mostReplayed} />,
  }),
  "completion-heatmap": createStatsWidgetDefinition("completion-heatmap", {
    render: (context) => (
      <CompletionHeatmapWidget
        dailyCompletions={context.data.dailyCompletions}
        activeYear={context.activeYear}
        onDateClick={context.onHeatmapDateClick}
      />
    ),
  }),
};

export function getStatsWidgetDefinitionsForZone(zone: StatsWidgetZone) {
  return Object.values(STATS_WIDGET_DEFINITIONS)
    .filter((definition) => definition.zone === zone)
    .sort((left, right) => left.defaultOrder - right.defaultOrder);
}

export function getOrderedStatsWidgetDefinitions(zone: StatsWidgetZone, widgetIds: StatsWidgetId[]) {
  return widgetIds
    .map((widgetId) => STATS_WIDGET_DEFINITIONS[widgetId])
    .filter((definition) => definition.zone === zone);
}

export function getVisibleStatsWidgetDefinitions(
  zone: StatsWidgetZone,
  widgetIds: StatsWidgetId[],
  context: StatsDashboardRenderContext
) {
  return widgetIds
    .map((widgetId) => STATS_WIDGET_DEFINITIONS[widgetId])
    .filter((definition) => definition.zone === zone)
    .filter((definition) => definition.isAvailable?.(context) ?? true);
}
