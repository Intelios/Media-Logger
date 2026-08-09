import type { ReactNode } from "react";
import type { MediaEntry } from "../../../lib/db";
import type { FullStats, StatItem } from "../../../lib/stats-logic";
import { PLATE_PANEL_DEFINITIONS, type PlatePanelId } from "./plate-config";
import { CataloguePanel, type CatalogueKind } from "./panels/CataloguePanel";
import { ContentTypesPanel } from "./panels/ContentTypesPanel";
import { GenresPanel } from "./panels/GenresPanel";
import { MultiLogDaysPanel } from "./panels/MultiLogDaysPanel";
import { ScoresPanel } from "./panels/ScoresPanel";
import { StandoutsPanel } from "./panels/StandoutsPanel";

export interface PlatePanelContext {
  stats: FullStats;
  comparisonStats: FullStats | null;
  genreCount: number;
  rangedEntries: MediaEntry[];
  onGenreClick: (genre: string) => void;
  onPerfectClick: () => void;
  onDateClick: (date: string) => void;
}

function toCatalogueItems(stats: FullStats): Record<CatalogueKind, StatItem[]> {
  return {
    platforms: stats.platforms,
    franchises: stats.franchises,
    series: stats.series,
    studios: stats.studios,
    authors: stats.authors,
    actresses: stats.actresses,
  };
}

function selectPerfectEntries(entries: MediaEntry[]): MediaEntry[] {
  return entries
    .filter((entry) => entry.review_score === 10)
    .sort((left, right) => (right.completion_date ?? "").localeCompare(left.completion_date ?? ""));
}

export function getPlatePanelTitle(panelId: PlatePanelId): string {
  return PLATE_PANEL_DEFINITIONS[panelId].label;
}

export function renderPlatePanel(
  panelId: PlatePanelId,
  context: PlatePanelContext,
  variant: "compact" | "expanded",
  onExpand?: () => void
): ReactNode {
  const { stats, comparisonStats, genreCount, rangedEntries, onGenreClick, onPerfectClick, onDateClick } = context;

  switch (panelId) {
    case "genres":
      return (
        <GenresPanel
          genres={stats.genres}
          comparisonGenres={comparisonStats?.genres ?? null}
          genreCount={genreCount}
          total={stats.total}
          variant={variant}
          onGenreClick={onGenreClick}
          onExpand={onExpand}
        />
      );
    case "scores":
      return (
        <ScoresPanel
          ratings={stats.ratings}
          averageScoreByType={stats.averageScoreByType}
          averageScore={stats.average_score}
          comparisonAverage={comparisonStats?.average_score ?? null}
          comparisonRatings={comparisonStats?.ratings ?? null}
          variant={variant}
          onExpand={onExpand}
        />
      );
    case "catalogue":
      return (
        <CataloguePanel
          items={toCatalogueItems(stats)}
          comparisonItems={comparisonStats ? toCatalogueItems(comparisonStats) : null}
          variant={variant}
          onExpand={onExpand}
        />
      );
    case "standouts":
      return (
        <StandoutsPanel
          mostReplayed={stats.mostReplayed}
          perfectEntries={selectPerfectEntries(rangedEntries)}
          variant={variant}
          onPerfectClick={onPerfectClick}
          onExpand={onExpand}
        />
      );
    case "content-types":
      return (
        <ContentTypesPanel
          mediaTypeBreakdown={stats.mediaTypeBreakdown}
          total={stats.total}
          variant={variant}
          onExpand={onExpand}
        />
      );
    case "multi-log-days":
      return (
        <MultiLogDaysPanel
          multiLogDays={stats.multiLogDays}
          variant={variant}
          onDateClick={onDateClick}
          onExpand={onExpand}
        />
      );
  }
}
