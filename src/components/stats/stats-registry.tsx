import {
  Calendar,
  Hash,
  PieChart as PieIcon,
  RefreshCw,
  Star,
  Trophy,
} from "lucide-react";
import { StatsSummaryCard } from "./StatsSummaryCard";
import {
  DEFAULT_STATS_WIDGET_DISPLAY_MODE,
  STATS_WIDGET_META,
  type StatsWidgetDefinition,
  type StatsWidgetId,
  type StatsWidgetZone,
} from "./stats-config";
import { AverageScoreByTypeWidget } from "./widgets/AverageScoreByTypeWidget";
import { TopListsWidget } from "./widgets/TopListsWidget";
import { CompletionHeatmapWidget } from "./widgets/CompletionHeatmapWidget";
import { ContentTypeBreakdownWidget } from "./widgets/ContentTypeBreakdownWidget";
import { MostReplayedWidget } from "./widgets/MostReplayedWidget";
import { MultiLogDaysWidget } from "./widgets/MultiLogDaysWidget";
import { MonthlyActivityWidget } from "./widgets/MonthlyActivityWidget";
import { RatingDistributionWidget } from "./widgets/RatingDistributionWidget";
import { ScoreTrendWidget } from "./widgets/ScoreTrendWidget";
import { TopGenresWidget } from "./widgets/TopGenresWidget";

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
  "top-lists": createStatsWidgetDefinition("top-lists", {
    render: (context) => (
      <TopListsWidget
        items={{
          platforms: context.data.platforms.filter((item) =>
            shouldIncludeProfileBackedItem(item.count, item.name, "platform", context.profileKeys, context.profileKeysReady)
          ),
          franchises: context.data.franchises.filter((item) =>
            shouldIncludeProfileBackedItem(item.count, item.name, "franchise", context.profileKeys, context.profileKeysReady)
          ),
          studios: context.data.studios.filter((item) =>
            shouldIncludeProfileBackedItem(item.count, item.name, "director", context.profileKeys, context.profileKeysReady)
          ),
          authors: context.data.authors.filter((item) =>
            shouldIncludeProfileBackedItem(item.count, item.name, "author", context.profileKeys, context.profileKeysReady)
          ),
          actresses: context.data.actresses.filter((item) =>
            shouldIncludeProfileBackedItem(item.count, item.name, "actress", context.profileKeys, context.profileKeysReady)
          ),
        }}
        displayMode={context.displayModes["top-lists"] ?? DEFAULT_STATS_WIDGET_DISPLAY_MODE}
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