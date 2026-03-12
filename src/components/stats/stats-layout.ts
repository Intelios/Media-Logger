import { getStatsWidgetDefinitionsForZone, STATS_WIDGET_DEFINITIONS } from "./stats-registry";
import type { MainWidgetId, StatsWidgetDefinition, StatsWidgetId, SummaryWidgetId } from "./stats-config";

export const STATS_DASHBOARD_LAYOUT_KEY = "stats-dashboard-layout-v1";
export const STATS_DASHBOARD_LAYOUT_VERSION = 1 as const;

export interface StatsDashboardLayoutV1 {
  version: typeof STATS_DASHBOARD_LAYOUT_VERSION;
  summaryOrder: SummaryWidgetId[];
  mainOrder: MainWidgetId[];
  hidden: StatsWidgetId[];
}

function getDefaultOrderForZone<T extends SummaryWidgetId | MainWidgetId>(
  definitions: Record<StatsWidgetId, StatsWidgetDefinition>,
  zone: "summary" | "main"
) {
  return Object.values(definitions)
    .filter((definition) => definition.zone === zone)
    .sort((left, right) => left.defaultOrder - right.defaultOrder)
    .map((definition) => definition.id) as T[];
}

function dedupeWidgetIds(widgetIds: StatsWidgetId[]) {
  return [...new Set(widgetIds)];
}

function normalizeZoneOrder<T extends SummaryWidgetId | MainWidgetId>(
  value: unknown,
  validWidgetIds: ReadonlySet<StatsWidgetId>,
  defaultOrder: T[]
) {
  const providedIds = Array.isArray(value)
    ? value.filter((widgetId): widgetId is StatsWidgetId => typeof widgetId === "string" && validWidgetIds.has(widgetId as StatsWidgetId))
    : [];

  const dedupedProvidedIds = dedupeWidgetIds(providedIds) as T[];
  const missingIds = defaultOrder.filter((widgetId) => !dedupedProvidedIds.includes(widgetId));

  return [...dedupedProvidedIds, ...missingIds];
}

export function createDefaultStatsDashboardLayout(
  definitions: Record<StatsWidgetId, StatsWidgetDefinition> = STATS_WIDGET_DEFINITIONS
): StatsDashboardLayoutV1 {
  return {
    version: STATS_DASHBOARD_LAYOUT_VERSION,
    summaryOrder: getDefaultOrderForZone<SummaryWidgetId>(definitions, "summary"),
    mainOrder: getDefaultOrderForZone<MainWidgetId>(definitions, "main"),
    hidden: Object.values(definitions)
      .filter((definition) => !definition.defaultVisible)
      .sort((left, right) => left.defaultOrder - right.defaultOrder)
      .map((definition) => definition.id),
  };
}

export function normalizeStatsDashboardLayout(
  value: unknown,
  definitions: Record<StatsWidgetId, StatsWidgetDefinition> = STATS_WIDGET_DEFINITIONS
): StatsDashboardLayoutV1 {
  const defaultLayout = createDefaultStatsDashboardLayout(definitions);

  if (!value || typeof value !== "object") {
    return defaultLayout;
  }

  const candidate = value as Partial<Record<keyof StatsDashboardLayoutV1, unknown>>;
  if (candidate.version !== STATS_DASHBOARD_LAYOUT_VERSION) {
    return defaultLayout;
  }

  const summaryIds = new Set(getStatsWidgetDefinitionsForZone("summary").map((definition) => definition.id));
  const mainIds = new Set(getStatsWidgetDefinitionsForZone("main").map((definition) => definition.id));
  const allIds = new Set<StatsWidgetId>([...summaryIds, ...mainIds]);

  const providedHidden = Array.isArray(candidate.hidden)
    ? dedupeWidgetIds(
        candidate.hidden.filter(
          (widgetId): widgetId is StatsWidgetId => typeof widgetId === "string" && allIds.has(widgetId as StatsWidgetId)
        )
      )
    : [];

  const defaultHidden = defaultLayout.hidden.filter((widgetId) => !providedHidden.includes(widgetId));

  return {
    version: STATS_DASHBOARD_LAYOUT_VERSION,
    summaryOrder: normalizeZoneOrder<SummaryWidgetId>(candidate.summaryOrder, summaryIds, defaultLayout.summaryOrder),
    mainOrder: normalizeZoneOrder<MainWidgetId>(candidate.mainOrder, mainIds, defaultLayout.mainOrder),
    hidden: [...defaultHidden, ...providedHidden],
  };
}

export function loadStatsDashboardLayout(
  definitions: Record<StatsWidgetId, StatsWidgetDefinition> = STATS_WIDGET_DEFINITIONS
) {
  try {
    const rawValue = localStorage.getItem(STATS_DASHBOARD_LAYOUT_KEY);
    if (!rawValue) {
      return createDefaultStatsDashboardLayout(definitions);
    }

    return normalizeStatsDashboardLayout(JSON.parse(rawValue), definitions);
  } catch {
    return createDefaultStatsDashboardLayout(definitions);
  }
}

export function saveStatsDashboardLayout(layout: StatsDashboardLayoutV1) {
  localStorage.setItem(STATS_DASHBOARD_LAYOUT_KEY, JSON.stringify(layout));
}
