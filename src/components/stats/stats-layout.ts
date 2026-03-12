import {
  STATS_DASHBOARD_VIEW_DEFINITIONS,
  type MainWidgetId,
  type StatsDashboardViewId,
  type StatsWidgetDefinition,
  type StatsWidgetId,
  type SummaryWidgetId,
} from "./stats-config";
import { getStatsWidgetDefinitionsForZone, STATS_WIDGET_DEFINITIONS } from "./stats-registry";

export const LEGACY_STATS_DASHBOARD_LAYOUT_KEY = "stats-dashboard-layout-v1";
export const LEGACY_STATS_DASHBOARD_LAYOUT_VERSION = 1 as const;
export const STATS_DASHBOARD_PREFERENCES_KEY = "stats-dashboard-preferences-v2";
export const STATS_DASHBOARD_PREFERENCES_VERSION = 2 as const;

export interface LegacyStatsDashboardLayoutV1 {
  version: typeof LEGACY_STATS_DASHBOARD_LAYOUT_VERSION;
  summaryOrder: SummaryWidgetId[];
  mainOrder: MainWidgetId[];
  hidden: StatsWidgetId[];
}

export interface StatsDashboardViewLayout {
  summaryOrder: SummaryWidgetId[];
  mainOrder: MainWidgetId[];
  hidden: StatsWidgetId[];
}

export interface StatsDashboardPreferencesV2 {
  version: typeof STATS_DASHBOARD_PREFERENCES_VERSION;
  activeView: StatsDashboardViewId;
  views: Record<StatsDashboardViewId, StatsDashboardViewLayout>;
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
    ? value.filter(
        (widgetId): widgetId is StatsWidgetId => typeof widgetId === "string" && validWidgetIds.has(widgetId as StatsWidgetId)
      )
    : [];

  const dedupedProvidedIds = dedupeWidgetIds(providedIds) as T[];
  const missingIds = defaultOrder.filter((widgetId) => !dedupedProvidedIds.includes(widgetId));

  return [...dedupedProvidedIds, ...missingIds];
}

function getHiddenIdsForView(
  viewId: StatsDashboardViewId,
  definitions: Record<StatsWidgetId, StatsWidgetDefinition>
) {
  const defaultHidden = Object.values(definitions)
    .filter((definition) => !definition.defaultVisible)
    .sort((left, right) => left.defaultOrder - right.defaultOrder)
    .map((definition) => definition.id);

  return dedupeWidgetIds([...defaultHidden, ...STATS_DASHBOARD_VIEW_DEFINITIONS[viewId].defaultHidden]);
}

function getZoneIdSets() {
  const summaryIds = new Set(getStatsWidgetDefinitionsForZone("summary").map((definition) => definition.id));
  const mainIds = new Set(getStatsWidgetDefinitionsForZone("main").map((definition) => definition.id));
  const allIds = new Set<StatsWidgetId>([...summaryIds, ...mainIds]);

  return { summaryIds, mainIds, allIds };
}

export function createDefaultStatsDashboardViewLayout(
  viewId: StatsDashboardViewId,
  definitions: Record<StatsWidgetId, StatsWidgetDefinition> = STATS_WIDGET_DEFINITIONS
): StatsDashboardViewLayout {
  return {
    summaryOrder: getDefaultOrderForZone<SummaryWidgetId>(definitions, "summary"),
    mainOrder: getDefaultOrderForZone<MainWidgetId>(definitions, "main"),
    hidden: getHiddenIdsForView(viewId, definitions),
  };
}

export function createDefaultStatsDashboardPreferences(
  definitions: Record<StatsWidgetId, StatsWidgetDefinition> = STATS_WIDGET_DEFINITIONS
): StatsDashboardPreferencesV2 {
  return {
    version: STATS_DASHBOARD_PREFERENCES_VERSION,
    activeView: "overview",
    views: {
      overview: createDefaultStatsDashboardViewLayout("overview", definitions),
      dashboard: createDefaultStatsDashboardViewLayout("dashboard", definitions),
    },
  };
}

export function normalizeStatsDashboardViewLayout(
  value: unknown,
  viewId: StatsDashboardViewId,
  definitions: Record<StatsWidgetId, StatsWidgetDefinition> = STATS_WIDGET_DEFINITIONS
): StatsDashboardViewLayout {
  const defaultLayout = createDefaultStatsDashboardViewLayout(viewId, definitions);

  if (!value || typeof value !== "object") {
    return defaultLayout;
  }

  const candidate = value as Partial<Record<keyof StatsDashboardViewLayout, unknown>>;
  const { summaryIds, mainIds, allIds } = getZoneIdSets();

  const providedHidden = Array.isArray(candidate.hidden)
    ? dedupeWidgetIds(
        candidate.hidden.filter(
          (widgetId): widgetId is StatsWidgetId => typeof widgetId === "string" && allIds.has(widgetId as StatsWidgetId)
        )
      )
    : [];

  const defaultHidden = defaultLayout.hidden.filter((widgetId) => !providedHidden.includes(widgetId));

  return {
    summaryOrder: normalizeZoneOrder<SummaryWidgetId>(candidate.summaryOrder, summaryIds, defaultLayout.summaryOrder),
    mainOrder: normalizeZoneOrder<MainWidgetId>(candidate.mainOrder, mainIds, defaultLayout.mainOrder),
    hidden: [...defaultHidden, ...providedHidden],
  };
}

export function normalizeStatsDashboardPreferences(
  value: unknown,
  definitions: Record<StatsWidgetId, StatsWidgetDefinition> = STATS_WIDGET_DEFINITIONS
): StatsDashboardPreferencesV2 {
  const defaults = createDefaultStatsDashboardPreferences(definitions);

  if (!value || typeof value !== "object") {
    return defaults;
  }

  const candidate = value as Partial<Record<keyof StatsDashboardPreferencesV2, unknown>>;
  if (candidate.version !== STATS_DASHBOARD_PREFERENCES_VERSION) {
    return defaults;
  }

  const activeView =
    candidate.activeView === "overview" || candidate.activeView === "dashboard" ? candidate.activeView : defaults.activeView;

  const views = candidate.views && typeof candidate.views === "object" ? candidate.views : {};

  return {
    version: STATS_DASHBOARD_PREFERENCES_VERSION,
    activeView,
    views: {
      overview: normalizeStatsDashboardViewLayout(
        (views as Partial<Record<StatsDashboardViewId, unknown>>).overview,
        "overview",
        definitions
      ),
      dashboard: normalizeStatsDashboardViewLayout(
        (views as Partial<Record<StatsDashboardViewId, unknown>>).dashboard,
        "dashboard",
        definitions
      ),
    },
  };
}

export function normalizeLegacyStatsDashboardLayout(
  value: unknown,
  definitions: Record<StatsWidgetId, StatsWidgetDefinition> = STATS_WIDGET_DEFINITIONS
): LegacyStatsDashboardLayoutV1 {
  const defaultLayout = createDefaultStatsDashboardViewLayout("dashboard", definitions);

  if (!value || typeof value !== "object") {
    return {
      version: LEGACY_STATS_DASHBOARD_LAYOUT_VERSION,
      ...defaultLayout,
    };
  }

  const candidate = value as Partial<Record<keyof LegacyStatsDashboardLayoutV1, unknown>>;
  if (candidate.version !== LEGACY_STATS_DASHBOARD_LAYOUT_VERSION) {
    return {
      version: LEGACY_STATS_DASHBOARD_LAYOUT_VERSION,
      ...defaultLayout,
    };
  }

  const normalized = normalizeStatsDashboardViewLayout(candidate, "dashboard", definitions);

  return {
    version: LEGACY_STATS_DASHBOARD_LAYOUT_VERSION,
    ...normalized,
  };
}

export function loadStatsDashboardPreferences(
  definitions: Record<StatsWidgetId, StatsWidgetDefinition> = STATS_WIDGET_DEFINITIONS
) {
  try {
    const rawValue = localStorage.getItem(STATS_DASHBOARD_PREFERENCES_KEY);
    if (rawValue) {
      return normalizeStatsDashboardPreferences(JSON.parse(rawValue), definitions);
    }

    const legacyRawValue = localStorage.getItem(LEGACY_STATS_DASHBOARD_LAYOUT_KEY);
    if (legacyRawValue) {
      const legacyLayout = normalizeLegacyStatsDashboardLayout(JSON.parse(legacyRawValue), definitions);

      return normalizeStatsDashboardPreferences(
        {
          version: STATS_DASHBOARD_PREFERENCES_VERSION,
          activeView: "overview",
          views: {
            overview: legacyLayout,
            dashboard: createDefaultStatsDashboardViewLayout("dashboard", definitions),
          },
        },
        definitions
      );
    }

    return createDefaultStatsDashboardPreferences(definitions);
  } catch {
    return createDefaultStatsDashboardPreferences(definitions);
  }
}

export function saveStatsDashboardPreferences(preferences: StatsDashboardPreferencesV2) {
  localStorage.setItem(STATS_DASHBOARD_PREFERENCES_KEY, JSON.stringify(preferences));
}

export function applyVisibleWidgetOrder<T extends SummaryWidgetId | MainWidgetId>(
  currentOrder: T[],
  nextVisibleOrder: T[]
) {
  const validIds = new Set(currentOrder);
  const sanitizedVisibleOrder = dedupeWidgetIds(nextVisibleOrder as StatsWidgetId[]).filter((widgetId) =>
    validIds.has(widgetId as T)
  ) as T[];

  if (sanitizedVisibleOrder.length === 0) {
    return currentOrder;
  }

  const visibleIdSet = new Set(sanitizedVisibleOrder);
  const currentVisibleOrder = currentOrder.filter((widgetId) => visibleIdSet.has(widgetId));
  if (currentVisibleOrder.length !== sanitizedVisibleOrder.length) {
    return currentOrder;
  }

  let visibleIndex = 0;

  return currentOrder.map((widgetId) =>
    visibleIdSet.has(widgetId) ? sanitizedVisibleOrder[visibleIndex++] : widgetId
  );
}

export function hideStatsDashboardWidget(layout: StatsDashboardViewLayout, widgetId: StatsWidgetId): StatsDashboardViewLayout {
  if (layout.hidden.includes(widgetId)) {
    return layout;
  }

  return {
    ...layout,
    hidden: [...layout.hidden, widgetId],
  };
}

export function showStatsDashboardWidget(layout: StatsDashboardViewLayout, widgetId: StatsWidgetId): StatsDashboardViewLayout {
  return {
    ...layout,
    hidden: layout.hidden.filter((hiddenWidgetId) => hiddenWidgetId !== widgetId),
  };
}
