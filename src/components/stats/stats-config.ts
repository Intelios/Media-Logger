import type { ReactNode } from "react";
import type { ActiveFilterPresetKey, MediaFilterPreset } from "../../lib/media-config";
import type { FullStats } from "../../lib/stats-logic";

export const SUMMARY_WIDGET_IDS = [
  "total-entries",
  "average-score",
  "rewatches",
  "perfect-tens",
  "this-month",
  "genres-count",
] as const;

export const MAIN_WIDGET_IDS = [
  "monthly-activity",
  "rating-distribution",
  "top-genres",
  "content-type-breakdown",
  "multi-log-days",
  "score-trend",
  "average-score-by-type",
  "platforms",
  "franchises",
  "studios",
  "authors",
  "actresses",
  "most-replayed",
  "completion-heatmap",
] as const;

export const STATS_DASHBOARD_VIEW_IDS = ["dashboard"] as const;
export const DISPLAY_MODE_WIDGET_IDS = ["platforms", "franchises", "studios", "authors", "actresses"] as const;

export type SummaryWidgetId = (typeof SUMMARY_WIDGET_IDS)[number];
export type MainWidgetId = (typeof MAIN_WIDGET_IDS)[number];
export type StatsWidgetId = SummaryWidgetId | MainWidgetId;
export type StatsWidgetZone = "summary" | "main";
export type StatsWidgetSection = "scores" | "activity" | "library";
export type StatsWidgetSize = "summary" | "small" | "half" | "full";
export type StatsWidgetLayoutRole = "summary" | "hero" | "feature" | "supporting" | "list";
export type StatsWidgetHeightPreset = "summary" | "compact" | "standard" | "tall" | "hero";
export type StatsDashboardViewId = (typeof STATS_DASHBOARD_VIEW_IDS)[number];
export type DisplayModeWidgetId = (typeof DISPLAY_MODE_WIDGET_IDS)[number];
export type StatsWidgetDisplayMode = "bars" | "donut";

export const STATS_WIDGET_SECTION_LABELS: Record<StatsWidgetSection, string> = {
  scores: "Scores",
  activity: "Activity",
  library: "Library",
};

export const STATS_WIDGET_SECTION_ORDER: StatsWidgetSection[] = ["scores", "activity", "library"];

export const DEFAULT_STATS_WIDGET_DISPLAY_MODE: StatsWidgetDisplayMode = "bars";

export interface StatsDashboardViewDefinition {
  id: StatsDashboardViewId;
  label: string;
  defaultHidden: StatsWidgetId[];
}

export interface StatsDashboardRenderContext {
  activeYear: string;
  selectedTypes: string[];
  profileKeys: Set<string>;
  profileKeysReady: boolean;
  displayModes: Partial<Record<DisplayModeWidgetId, StatsWidgetDisplayMode>>;
  data: FullStats;
  // Specific years selectable for the per-widget "Compare year" overlay (excludes "All Time"
  // and the active year). Empty when there is nothing to compare against.
  comparisonYearOptions: string[];
  onPerfect10Click: () => void;
  onThisMonthClick: () => void;
  onViewAllGenres: () => void;
  onGenreClick: (genreName: string) => void;
  onMultiLogDayClick: (date: string) => void;
  onHeatmapDateClick: (date: string) => void;
}

export interface StatsWidgetMeta {
  id: StatsWidgetId;
  zone: StatsWidgetZone;
  section?: StatsWidgetSection;
  title: string;
  description: string;
  defaultSize: StatsWidgetSize;
  layoutRole: StatsWidgetLayoutRole;
  heightPreset: StatsWidgetHeightPreset;
  defaultVisible: boolean;
  defaultOrder: number;
  supportsEmptyState: boolean;
  displayModeOptions?: readonly StatsWidgetDisplayMode[];
}

export interface StatsWidgetDefinition extends StatsWidgetMeta {
  isAvailable?: (context: StatsDashboardRenderContext) => boolean;
  render: (context: StatsDashboardRenderContext) => ReactNode;
}

export type StatsPresetKey = ActiveFilterPresetKey;
export type StatsFilterPreset = MediaFilterPreset;

export const STATS_DASHBOARD_VIEW_DEFINITIONS: Record<StatsDashboardViewId, StatsDashboardViewDefinition> = {
  dashboard: {
    id: "dashboard",
    label: "Dashboard",
    defaultHidden: [],
  },
};

const DISPLAY_MODE_WIDGET_ID_SET = new Set<StatsWidgetId>(DISPLAY_MODE_WIDGET_IDS);

export function supportsStatsWidgetDisplayMode(widgetId: StatsWidgetId): widgetId is DisplayModeWidgetId {
  return DISPLAY_MODE_WIDGET_ID_SET.has(widgetId);
}

export const STATS_WIDGET_META: Record<StatsWidgetId, StatsWidgetMeta> = {
  "total-entries": {
    id: "total-entries",
    zone: "summary",
    title: "Total Entries",
    description: "Total entries for the active filters.",
    defaultSize: "summary",
    layoutRole: "summary",
    heightPreset: "summary",
    defaultVisible: true,
    defaultOrder: 0,
    supportsEmptyState: false,
  },
  "average-score": {
    id: "average-score",
    zone: "summary",
    title: "Avg Score",
    description: "Average review score for rated entries.",
    defaultSize: "summary",
    layoutRole: "summary",
    heightPreset: "summary",
    defaultVisible: true,
    defaultOrder: 1,
    supportsEmptyState: false,
  },
  "rewatches": {
    id: "rewatches",
    zone: "summary",
    title: "Rewatches",
    description: "Entries marked as rewatches.",
    defaultSize: "summary",
    layoutRole: "summary",
    heightPreset: "summary",
    defaultVisible: true,
    defaultOrder: 2,
    supportsEmptyState: false,
  },
  "perfect-tens": {
    id: "perfect-tens",
    zone: "summary",
    title: "Perfect 10s",
    description: "Entries with a perfect review score.",
    defaultSize: "summary",
    layoutRole: "summary",
    heightPreset: "summary",
    defaultVisible: true,
    defaultOrder: 3,
    supportsEmptyState: false,
  },
  "this-month": {
    id: "this-month",
    zone: "summary",
    title: "This Month",
    description: "Entries completed this month.",
    defaultSize: "summary",
    layoutRole: "summary",
    heightPreset: "summary",
    defaultVisible: true,
    defaultOrder: 4,
    supportsEmptyState: false,
  },
  "genres-count": {
    id: "genres-count",
    zone: "summary",
    title: "Genres",
    description: "Unique genres in the current result set.",
    defaultSize: "summary",
    layoutRole: "summary",
    heightPreset: "summary",
    defaultVisible: true,
    defaultOrder: 5,
    supportsEmptyState: false,
  },
  "monthly-activity": {
    id: "monthly-activity",
    zone: "main",
    section: "activity",
    title: "Monthly Activity",
    description: "Completion activity across the selected year.",
    defaultSize: "full",
    layoutRole: "hero",
    heightPreset: "hero",
    defaultVisible: true,
    defaultOrder: 3,
    supportsEmptyState: true,
  },
  "rating-distribution": {
    id: "rating-distribution",
    zone: "main",
    section: "scores",
    title: "Rating Distribution",
    description: "Breakdown of review scores from 1 to 10.",
    defaultSize: "half",
    layoutRole: "feature",
    heightPreset: "standard",
    defaultVisible: true,
    defaultOrder: 0,
    supportsEmptyState: true,
  },
  "top-genres": {
    id: "top-genres",
    zone: "main",
    section: "library",
    title: "Top Genres",
    description: "Most common genres for the current filters.",
    defaultSize: "half",
    layoutRole: "feature",
    heightPreset: "tall",
    defaultVisible: true,
    defaultOrder: 9,
    supportsEmptyState: true,
  },
  "content-type-breakdown": {
    id: "content-type-breakdown",
    zone: "main",
    section: "library",
    title: "Content Type Breakdown",
    description: "Share of entries by content type.",
    defaultSize: "full",
    layoutRole: "supporting",
    heightPreset: "compact",
    defaultVisible: true,
    defaultOrder: 8,
    supportsEmptyState: true,
  },
  "multi-log-days": {
    id: "multi-log-days",
    zone: "main",
    section: "activity",
    title: "Multiple Logs Per Day",
    description: "Days where you logged more than one entry for the current filters.",
    defaultSize: "full",
    layoutRole: "supporting",
    heightPreset: "standard",
    defaultVisible: true,
    defaultOrder: 6,
    supportsEmptyState: true,
  },
  "score-trend": {
    id: "score-trend",
    zone: "main",
    section: "scores",
    title: "Score Trend",
    description: "Average score trend over time for the current filters.",
    defaultSize: "half",
    layoutRole: "feature",
    heightPreset: "standard",
    defaultVisible: true,
    defaultOrder: 1,
    supportsEmptyState: true,
  },
  "average-score-by-type": {
    id: "average-score-by-type",
    zone: "main",
    section: "scores",
    title: "Average Score by Type",
    description: "How different content types score against each other.",
    defaultSize: "half",
    layoutRole: "feature",
    heightPreset: "standard",
    defaultVisible: true,
    defaultOrder: 2,
    supportsEmptyState: true,
  },
  platforms: {
    id: "platforms",
    zone: "main",
    section: "library",
    title: "Platforms",
    description: "Most common platforms for the current filters.",
    defaultSize: "half",
    layoutRole: "list",
    heightPreset: "standard",
    defaultVisible: true,
    defaultOrder: 10,
    supportsEmptyState: true,
    displayModeOptions: ["bars", "donut"],
  },
  franchises: {
    id: "franchises",
    zone: "main",
    section: "library",
    title: "Franchises",
    description: "Most common franchises for the current filters.",
    defaultSize: "half",
    layoutRole: "list",
    heightPreset: "standard",
    defaultVisible: true,
    defaultOrder: 11,
    supportsEmptyState: true,
    displayModeOptions: ["bars", "donut"],
  },
  studios: {
    id: "studios",
    zone: "main",
    section: "library",
    title: "Studios",
    description: "Most common studios for the current filters.",
    defaultSize: "half",
    layoutRole: "list",
    heightPreset: "standard",
    defaultVisible: true,
    defaultOrder: 12,
    supportsEmptyState: true,
    displayModeOptions: ["bars", "donut"],
  },
  authors: {
    id: "authors",
    zone: "main",
    section: "library",
    title: "Authors",
    description: "Most common authors for the current filters.",
    defaultSize: "half",
    layoutRole: "list",
    heightPreset: "standard",
    defaultVisible: true,
    defaultOrder: 13,
    supportsEmptyState: true,
    displayModeOptions: ["bars", "donut"],
  },
  actresses: {
    id: "actresses",
    zone: "main",
    section: "library",
    title: "Actresses",
    description: "Most common actresses for the current filters.",
    defaultSize: "half",
    layoutRole: "list",
    heightPreset: "standard",
    defaultVisible: true,
    defaultOrder: 14,
    supportsEmptyState: true,
    displayModeOptions: ["bars", "donut"],
  },
  "most-replayed": {
    id: "most-replayed",
    zone: "main",
    section: "activity",
    title: "Most Replayed",
    description: "Entries you have logged the most times — ranked by total completions.",
    defaultSize: "half",
    layoutRole: "list",
    heightPreset: "standard",
    defaultVisible: true,
    defaultOrder: 5,
    supportsEmptyState: true,
  },
  "completion-heatmap": {
    id: "completion-heatmap",
    zone: "main",
    section: "activity",
    title: "Completion Heatmap",
    description: "GitHub-style contribution heatmap showing daily completion activity.",
    defaultSize: "full",
    layoutRole: "hero",
    heightPreset: "standard",
    defaultVisible: false,
    defaultOrder: 7,
    supportsEmptyState: true,
  },
};
