import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
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
  "platforms",
  "franchises",
  "studios",
  "authors",
  "actresses",
] as const;

export type SummaryWidgetId = (typeof SUMMARY_WIDGET_IDS)[number];
export type MainWidgetId = (typeof MAIN_WIDGET_IDS)[number];
export type StatsWidgetId = SummaryWidgetId | MainWidgetId;
export type StatsWidgetZone = "summary" | "main";
export type StatsWidgetSize = "summary" | "small" | "half" | "full";

export interface StatsDashboardRenderContext {
  activeYear: string;
  data: FullStats;
  onPerfect10Click: () => void;
  onThisMonthClick: () => void;
  onViewAllGenres: () => void;
  onGenreClick: (genreName: string) => void;
}

export interface StatsWidgetMeta {
  id: StatsWidgetId;
  zone: StatsWidgetZone;
  title: string;
  description: string;
  defaultSize: StatsWidgetSize;
  defaultVisible: boolean;
  defaultOrder: number;
  supportsEmptyState: boolean;
}

export interface StatsWidgetDefinition extends StatsWidgetMeta {
  isAvailable?: (context: StatsDashboardRenderContext) => boolean;
  render: (context: StatsDashboardRenderContext) => ReactNode;
}

export type StatsPresetKey = "gaming" | "media" | "adult" | null;

export interface StatsFilterPreset {
  key: Exclude<StatsPresetKey, null>;
  label: string;
  icon: LucideIcon;
  types: string[];
  gradient: string;
}

export const STATS_WIDGET_META: Record<StatsWidgetId, StatsWidgetMeta> = {
  "total-entries": {
    id: "total-entries",
    zone: "summary",
    title: "Total Entries",
    description: "Total entries for the active filters.",
    defaultSize: "summary",
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
    defaultVisible: true,
    defaultOrder: 5,
    supportsEmptyState: false,
  },
  "monthly-activity": {
    id: "monthly-activity",
    zone: "main",
    title: "Monthly Activity",
    description: "Completion activity across the selected year.",
    defaultSize: "full",
    defaultVisible: true,
    defaultOrder: 0,
    supportsEmptyState: true,
  },
  "rating-distribution": {
    id: "rating-distribution",
    zone: "main",
    title: "Rating Distribution",
    description: "Breakdown of review scores from 1 to 10.",
    defaultSize: "half",
    defaultVisible: true,
    defaultOrder: 1,
    supportsEmptyState: true,
  },
  "top-genres": {
    id: "top-genres",
    zone: "main",
    title: "Top Genres",
    description: "Most common genres for the current filters.",
    defaultSize: "half",
    defaultVisible: true,
    defaultOrder: 2,
    supportsEmptyState: true,
  },
  "content-type-breakdown": {
    id: "content-type-breakdown",
    zone: "main",
    title: "Content Type Breakdown",
    description: "Share of entries by content type.",
    defaultSize: "full",
    defaultVisible: true,
    defaultOrder: 3,
    supportsEmptyState: true,
  },
  platforms: {
    id: "platforms",
    zone: "main",
    title: "Platforms",
    description: "Most common platforms for the current filters.",
    defaultSize: "half",
    defaultVisible: true,
    defaultOrder: 4,
    supportsEmptyState: true,
  },
  franchises: {
    id: "franchises",
    zone: "main",
    title: "Franchises",
    description: "Most common franchises for the current filters.",
    defaultSize: "half",
    defaultVisible: true,
    defaultOrder: 5,
    supportsEmptyState: true,
  },
  studios: {
    id: "studios",
    zone: "main",
    title: "Studios",
    description: "Most common studios for the current filters.",
    defaultSize: "half",
    defaultVisible: true,
    defaultOrder: 6,
    supportsEmptyState: true,
  },
  authors: {
    id: "authors",
    zone: "main",
    title: "Authors",
    description: "Most common authors for the current filters.",
    defaultSize: "half",
    defaultVisible: true,
    defaultOrder: 7,
    supportsEmptyState: true,
  },
  actresses: {
    id: "actresses",
    zone: "main",
    title: "Actresses",
    description: "Most common actresses for the current filters.",
    defaultSize: "half",
    defaultVisible: true,
    defaultOrder: 8,
    supportsEmptyState: true,
  },
};
