import {
  DEFAULT_STATS_WIDGET_DISPLAY_MODE,
  DISPLAY_MODE_WIDGET_IDS,
  STATS_DASHBOARD_VIEW_DEFINITIONS,
  supportsStatsWidgetDisplayMode,
  type DisplayModeWidgetId,
  type MainWidgetId,
  type StatsDashboardViewId,
  type StatsWidgetDefinition,
  type StatsWidgetDisplayMode,
  type StatsWidgetId,
  type SummaryWidgetId,
} from "./stats-config";
import { getStatsWidgetDefinitionsForZone, STATS_WIDGET_DEFINITIONS } from "./stats-registry";

export const LEGACY_STATS_DASHBOARD_LAYOUT_KEY = "stats-dashboard-layout-v1";
export const LEGACY_STATS_DASHBOARD_LAYOUT_VERSION = 1 as const;
export const LEGACY_STATS_DASHBOARD_PREFERENCES_KEY = "stats-dashboard-preferences-v2";
export const LEGACY_STATS_DASHBOARD_PREFERENCES_VERSION = 2 as const;
export const STATS_DASHBOARD_PREFERENCES_KEY = "stats-dashboard-preferences-v3";
export const STATS_DASHBOARD_PREFERENCES_VERSION = 3 as const;

export interface LegacyStatsDashboardLayoutV1 {
  version: typeof LEGACY_STATS_DASHBOARD_LAYOUT_VERSION;
  summaryOrder: SummaryWidgetId[];
  mainOrder: MainWidgetId[];
  hidden: StatsWidgetId[];
}

export interface LegacyStatsDashboardViewLayoutV2 {
  summaryOrder: SummaryWidgetId[];
  mainOrder: MainWidgetId[];
  hidden: StatsWidgetId[];
}

export interface LegacyStatsDashboardPreferencesV2 {
  version: typeof LEGACY_STATS_DASHBOARD_PREFERENCES_VERSION;
  activeView: StatsDashboardViewId;
  views: Record<StatsDashboardViewId, LegacyStatsDashboardViewLayoutV2>;
}

export interface StatsDashboardViewPreferences {
  summaryOrder: SummaryWidgetId[];
  mainOrder: MainWidgetId[];
  hidden: StatsWidgetId[];
  displayModes: Partial<Record<DisplayModeWidgetId, StatsWidgetDisplayMode>>;
}

export type StatsDashboardViewLayout = StatsDashboardViewPreferences;

export interface StatsDashboardPreferencesV3 {
  version: typeof STATS_DASHBOARD_PREFERENCES_VERSION;
  activeView: StatsDashboardViewId;
  views: Record<StatsDashboardViewId, StatsDashboardViewPreferences>;
}

export type StatsDashboardPreferences = StatsDashboardPreferencesV3;

function getDefaultOrderForZone<T extends SummaryWidgetId | MainWidgetId>(
  definitions: Record<StatsWidgetId, StatsWidgetDefinition>,
  zone: "summary" | "main"
) {
  return Object.values(definitions)
    .filter((definition) => definition.zone === zone)
    .sort((left, right) => left.defaultOrder - right.defaultOrder)
    .map((definition) => definition.id) as T[];
}

function dedupeWidgetIds<T extends StatsWidgetId>(widgetIds: T[]) {
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

function getDefaultDisplayModes(): Partial<Record<DisplayModeWidgetId, StatsWidgetDisplayMode>> {
  const displayModes: Partial<Record<DisplayModeWidgetId, StatsWidgetDisplayMode>> = {};

  for (const widgetId of DISPLAY_MODE_WIDGET_IDS) {
    displayModes[widgetId] = DEFAULT_STATS_WIDGET_DISPLAY_MODE;
  }

  return displayModes;
}

function normalizeDisplayModes(value: unknown) {
  const defaultDisplayModes = getDefaultDisplayModes();

  if (!value || typeof value !== "object") {
    return defaultDisplayModes;
  }

  const normalizedDisplayModes: Partial<Record<DisplayModeWidgetId, StatsWidgetDisplayMode>> = {
    ...defaultDisplayModes,
  };

  for (const [widgetId, displayMode] of Object.entries(value)) {
    if (!supportsStatsWidgetDisplayMode(widgetId as StatsWidgetId)) {
      continue;
    }

    if (displayMode === "bars" || displayMode === "donut") {
      normalizedDisplayModes[widgetId as DisplayModeWidgetId] = displayMode;
    }
  }

  return normalizedDisplayModes;
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
): StatsDashboardViewPreferences {
  return {
    summaryOrder: getDefaultOrderForZone<SummaryWidgetId>(definitions, "summary"),
    mainOrder: getDefaultOrderForZone<MainWidgetId>(definitions, "main"),
    hidden: getHiddenIdsForView(viewId, definitions),
    displayModes: getDefaultDisplayModes(),
  };
}

export function createDefaultStatsDashboardPreferences(
  definitions: Record<StatsWidgetId, StatsWidgetDefinition> = STATS_WIDGET_DEFINITIONS
): StatsDashboardPreferencesV3 {
  return {
    version: STATS_DASHBOARD_PREFERENCES_VERSION,
    activeView: "dashboard",
    views: {
      dashboard: createDefaultStatsDashboardViewLayout("dashboard", definitions),
    },
  };
}

export function normalizeStatsDashboardViewLayout(
  value: unknown,
  viewId: StatsDashboardViewId,
  definitions: Record<StatsWidgetId, StatsWidgetDefinition> = STATS_WIDGET_DEFINITIONS
): StatsDashboardViewPreferences {
  const defaultLayout = createDefaultStatsDashboardViewLayout(viewId, definitions);

  if (!value || typeof value !== "object") {
    return defaultLayout;
  }

  const candidate = value as Partial<Record<keyof StatsDashboardViewPreferences, unknown>>;
  const { summaryIds, mainIds, allIds } = getZoneIdSets();
  const providedHiddenIds = Array.isArray(candidate.hidden) ? (candidate.hidden as unknown[]) : undefined;

  const providedHidden = providedHiddenIds
    ? dedupeWidgetIds(
        providedHiddenIds.filter(
          (widgetId): widgetId is StatsWidgetId => typeof widgetId === "string" && allIds.has(widgetId as StatsWidgetId)
        )
      )
    : [];

  return {
    summaryOrder: normalizeZoneOrder<SummaryWidgetId>(candidate.summaryOrder, summaryIds, defaultLayout.summaryOrder),
    mainOrder: normalizeZoneOrder<MainWidgetId>(candidate.mainOrder, mainIds, defaultLayout.mainOrder),
    hidden: providedHiddenIds ? providedHidden : defaultLayout.hidden,
    displayModes: normalizeDisplayModes(candidate.displayModes),
  };
}

export function normalizeStatsDashboardPreferences(
  value: unknown,
  definitions: Record<StatsWidgetId, StatsWidgetDefinition> = STATS_WIDGET_DEFINITIONS
): StatsDashboardPreferencesV3 {
  const defaults = createDefaultStatsDashboardPreferences(definitions);

  if (!value || typeof value !== "object") {
    return defaults;
  }

  const candidate = value as Partial<Record<keyof StatsDashboardPreferencesV3, unknown>>;
  if (candidate.version !== STATS_DASHBOARD_PREFERENCES_VERSION) {
    return defaults;
  }

  const views = candidate.views && typeof candidate.views === "object" ? candidate.views : {};

  return {
    version: STATS_DASHBOARD_PREFERENCES_VERSION,
    activeView: "dashboard",
    views: {
      dashboard: normalizeStatsDashboardViewLayout(
        (views as Partial<Record<StatsDashboardViewId, unknown>>).dashboard,
        "dashboard",
        definitions
      ),
    },
  };
}

function normalizeLegacyStatsDashboardPreferencesV2(
  value: unknown,
  definitions: Record<StatsWidgetId, StatsWidgetDefinition> = STATS_WIDGET_DEFINITIONS
): StatsDashboardPreferencesV3 {
  const defaults = createDefaultStatsDashboardPreferences(definitions);

  if (!value || typeof value !== "object") {
    return defaults;
  }

  const candidate = value as Partial<Record<keyof LegacyStatsDashboardPreferencesV2, unknown>>;
  if (candidate.version !== LEGACY_STATS_DASHBOARD_PREFERENCES_VERSION) {
    return defaults;
  }

  const views = candidate.views && typeof candidate.views === "object" ? candidate.views : {};

  return {
    version: STATS_DASHBOARD_PREFERENCES_VERSION,
    activeView: "dashboard",
    views: {
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
      summaryOrder: defaultLayout.summaryOrder,
      mainOrder: defaultLayout.mainOrder,
      hidden: defaultLayout.hidden,
    };
  }

  const candidate = value as Partial<Record<keyof LegacyStatsDashboardLayoutV1, unknown>>;
  if (candidate.version !== LEGACY_STATS_DASHBOARD_LAYOUT_VERSION) {
    return {
      version: LEGACY_STATS_DASHBOARD_LAYOUT_VERSION,
      summaryOrder: defaultLayout.summaryOrder,
      mainOrder: defaultLayout.mainOrder,
      hidden: defaultLayout.hidden,
    };
  }

  const normalized = normalizeStatsDashboardViewLayout(candidate, "dashboard", definitions);

  return {
    version: LEGACY_STATS_DASHBOARD_LAYOUT_VERSION,
    summaryOrder: normalized.summaryOrder,
    mainOrder: normalized.mainOrder,
    hidden: normalized.hidden,
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

    const legacyPreferencesValue = localStorage.getItem(LEGACY_STATS_DASHBOARD_PREFERENCES_KEY);
    if (legacyPreferencesValue) {
      return normalizeLegacyStatsDashboardPreferencesV2(JSON.parse(legacyPreferencesValue), definitions);
    }

    const legacyRawValue = localStorage.getItem(LEGACY_STATS_DASHBOARD_LAYOUT_KEY);
    if (legacyRawValue) {
      const legacyLayout = normalizeLegacyStatsDashboardLayout(JSON.parse(legacyRawValue), definitions);

      return normalizeStatsDashboardPreferences(
        {
          version: STATS_DASHBOARD_PREFERENCES_VERSION,
          activeView: "dashboard",
          views: {
            dashboard: {
              ...legacyLayout,
              displayModes: getDefaultDisplayModes(),
            },
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

export function saveStatsDashboardPreferences(preferences: StatsDashboardPreferencesV3) {
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

export function getStatsDashboardWidgetDisplayMode(
  displayModes: Partial<Record<DisplayModeWidgetId, StatsWidgetDisplayMode>>,
  widgetId: StatsWidgetId
) {
  if (!supportsStatsWidgetDisplayMode(widgetId)) {
    return undefined;
  }

  return displayModes[widgetId] ?? DEFAULT_STATS_WIDGET_DISPLAY_MODE;
}

export function setStatsDashboardWidgetDisplayMode(
  layout: StatsDashboardViewPreferences,
  widgetId: StatsWidgetId,
  displayMode: StatsWidgetDisplayMode
): StatsDashboardViewPreferences {
  if (!supportsStatsWidgetDisplayMode(widgetId)) {
    return layout;
  }

  return {
    ...layout,
    displayModes: {
      ...layout.displayModes,
      [widgetId]: displayMode,
    },
  };
}

export function hideStatsDashboardWidget(
  layout: StatsDashboardViewPreferences,
  widgetId: StatsWidgetId
): StatsDashboardViewPreferences {
  if (layout.hidden.includes(widgetId)) {
    return layout;
  }

  return {
    ...layout,
    hidden: [...layout.hidden, widgetId],
  };
}

export function showStatsDashboardWidget(
  layout: StatsDashboardViewPreferences,
  widgetId: StatsWidgetId
): StatsDashboardViewPreferences {
  return {
    ...layout,
    hidden: layout.hidden.filter((hiddenWidgetId) => hiddenWidgetId !== widgetId),
  };
}
