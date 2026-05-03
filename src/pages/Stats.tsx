import { useEffect, useState } from "react";
import { Film, Gamepad2, Heart } from "lucide-react";
import { StatsEntriesModal } from "../components/StatsEntriesModal";
import { GenreBreakdownModal } from "../components/GenreBreakdownModal";
import { StatsDashboard } from "../components/stats/StatsDashboard";
import {
  MAIN_WIDGET_IDS,
  SUMMARY_WIDGET_IDS,
  type StatsDashboardViewId,
  type StatsFilterPreset,
  type StatsPresetKey,
  type StatsWidgetId,
} from "../components/stats/stats-config";
import {
  applyVisibleWidgetOrder,
  createDefaultStatsDashboardViewLayout,
  hideStatsDashboardWidget,
  loadStatsDashboardPreferences,
  saveStatsDashboardPreferences,
  setStatsDashboardWidgetDisplayMode,
  showStatsDashboardWidget,
  type StatsDashboardPreferences,
} from "../components/stats/stats-layout";
import { getAvailableNavigationYears, NAVIGATION_YEARS_UPDATED_EVENT } from "../lib/navigation-years";
import { type MediaEntry } from "../lib/db";
import { profilesLogic } from "../lib/profiles-logic";
import { getNavigationYears } from "../lib/settings";
import { statsLogic, type FullStats } from "../lib/stats-logic";

const ENTRY_TYPES = ["Movie", "Show", "Anime", "Book", "Album", "K-Drama", "JAV", "Hentai", "Game", "Adult Visual Novel", "Other"];
const PRESET_KEYS: Exclude<StatsPresetKey, null>[] = ["gaming", "media", "adult"];

const FILTER_PRESETS: Record<Exclude<StatsPresetKey, null>, StatsFilterPreset> = {
  gaming: {
    key: "gaming",
    label: "Gaming",
    icon: Gamepad2,
    types: ["Game"],
    gradient: "from-green-500 to-emerald-600",
  },
  media: {
    key: "media",
    label: "Media",
    icon: Film,
    types: ["K-Drama", "Anime", "Show", "Movie", "Book", "Album"],
    gradient: "from-blue-500 to-purple-600",
  },
  adult: {
    key: "adult",
    label: "Adult",
    icon: Heart,
    types: ["JAV", "Hentai", "Adult Visual Novel"],
    gradient: "from-pink-500 to-rose-600",
  },
};

const STATS_YEAR_KEY = "stats-active-year";
const STATS_TYPES_KEY = "stats-selected-types";
const STATS_PRESET_KEY = "stats-active-preset";

const loadPersistedPreset = (): StatsPresetKey => {
  try {
    const stored = localStorage.getItem(STATS_PRESET_KEY);
    if (stored && PRESET_KEYS.includes(stored as Exclude<StatsPresetKey, null>)) {
      return stored as StatsPresetKey;
    }
  } catch {
    // Fall back to default state.
  }

  return null;
};

const loadPersistedYear = (): string => {
  try {
    const stored = localStorage.getItem(STATS_YEAR_KEY);
    if (stored) {
      return stored;
    }
  } catch {
    // Fall back to the default year.
  }

  return "All Time";
};

const loadPersistedTypes = (): string[] => {
  try {
    const stored = localStorage.getItem(STATS_TYPES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.every((type) => ENTRY_TYPES.includes(type))) {
        return parsed;
      }
    }
  } catch {
    // Fall back to the full type list.
  }

  return [...ENTRY_TYPES];
};

export default function StatsPage() {
  const [years, setYears] = useState<string[]>(() => getNavigationYears());
  const [activeYear, setActiveYear] = useState(loadPersistedYear);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(loadPersistedTypes);
  const [activePreset, setActivePreset] = useState<StatsPresetKey>(loadPersistedPreset);
  const [dashboardPreferences, setDashboardPreferences] = useState<StatsDashboardPreferences>(loadStatsDashboardPreferences);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [data, setData] = useState<FullStats | null>(null);
  const [profileKeys, setProfileKeys] = useState<Set<string>>(new Set());
  const [profileKeysReady, setProfileKeysReady] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalEntries, setModalEntries] = useState<MediaEntry[]>([]);
  const [genreModalOpen, setGenreModalOpen] = useState(false);

  const handleTypesChange = (types: string[]) => {
    setSelectedTypes(types);
    setActivePreset(null);
    localStorage.removeItem(STATS_PRESET_KEY);
  };

  const handleResetPreset = () => {
    setActivePreset(null);
    setSelectedTypes([...ENTRY_TYPES]);
    localStorage.removeItem(STATS_PRESET_KEY);
  };

  const handlePresetClick = (presetKey: Exclude<StatsPresetKey, null>) => {
    if (activePreset === presetKey) {
      handleResetPreset();
      return;
    }

    setActivePreset(presetKey);
    setSelectedTypes([...FILTER_PRESETS[presetKey].types]);
    localStorage.setItem(STATS_PRESET_KEY, presetKey);
  };

  useEffect(() => {
    localStorage.setItem(STATS_YEAR_KEY, activeYear);
  }, [activeYear]);

  useEffect(() => {
    localStorage.setItem(STATS_TYPES_KEY, JSON.stringify(selectedTypes));
  }, [selectedTypes]);

  useEffect(() => {
    saveStatsDashboardPreferences(dashboardPreferences);
  }, [dashboardPreferences]);

  useEffect(() => {
    const refreshYears = async () => {
      const availableYears = await getAvailableNavigationYears();
      setYears(availableYears);
    };

    const handleYearsChanged = () => {
      void refreshYears();
    };

    void refreshYears();

    window.addEventListener(NAVIGATION_YEARS_UPDATED_EVENT, handleYearsChanged);
    window.addEventListener("entry-added", handleYearsChanged as EventListener);

    return () => {
      window.removeEventListener(NAVIGATION_YEARS_UPDATED_EVENT, handleYearsChanged);
      window.removeEventListener("entry-added", handleYearsChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    const refreshProfileKeys = async () => {
      const keys = await profilesLogic.getProfileKeys();
      setProfileKeys(keys);
      setProfileKeysReady(true);
    };

    const handleEntryAdded = () => {
      void refreshProfileKeys();
    };

    void refreshProfileKeys();

    window.addEventListener("entry-added", handleEntryAdded as EventListener);

    return () => {
      window.removeEventListener("entry-added", handleEntryAdded as EventListener);
    };
  }, []);

  useEffect(() => {
    if (activeYear !== "All Time" && !years.includes(activeYear)) {
      setActiveYear("All Time");
    }
  }, [activeYear, years]);

  useEffect(() => {
    void statsLogic.getStats(activeYear, selectedTypes).then(setData);
  }, [activeYear, selectedTypes]);

  const handlePerfect10Click = async () => {
    const entries = await statsLogic.getPerfect10Entries(activeYear, selectedTypes);
    setModalTitle("Perfect 10s");
    setModalEntries(entries);
    setModalOpen(true);
  };

  const handleThisMonthClick = async () => {
    const entries = await statsLogic.getThisMonthEntries(activeYear, selectedTypes);
    setModalTitle("This Month");
    setModalEntries(entries);
    setModalOpen(true);
  };

  const handleGenreClick = async (genreName: string) => {
    const entries = await statsLogic.getEntriesByGenre(genreName, activeYear, selectedTypes);
    setModalTitle(`Genre: ${genreName}`);
    setModalEntries(entries);
    setGenreModalOpen(false);
    setModalOpen(true);
  };

  const handleMultiLogDayClick = async (date: string) => {
    const entries = await statsLogic.getEntriesByCompletionDate(date, activeYear, selectedTypes);
    setModalTitle(`Logged on: ${date}`);
    setModalEntries(entries);
    setModalOpen(true);
  };

  const handleHeatmapDateClick = async (date: string) => {
    const entries = await statsLogic.getEntriesByCompletionDate(date, activeYear, selectedTypes);
    setModalTitle(`Completed on: ${date}`);
    setModalEntries(entries);
    setModalOpen(true);
  };

  const handleModalEntriesChange = () => {
    void statsLogic.getStats(activeYear, selectedTypes).then(setData);
    void profilesLogic.getProfileKeys().then(setProfileKeys);

    if (modalTitle === "Perfect 10s") {
      void statsLogic.getPerfect10Entries(activeYear, selectedTypes).then(setModalEntries);
    } else if (modalTitle === "This Month") {
      void statsLogic.getThisMonthEntries(activeYear, selectedTypes).then(setModalEntries);
    } else if (modalTitle.startsWith("Genre: ")) {
      const genreName = modalTitle.replace("Genre: ", "");
      void statsLogic.getEntriesByGenre(genreName, activeYear, selectedTypes).then(setModalEntries);
    } else if (modalTitle.startsWith("Logged on: ")) {
      const date = modalTitle.replace("Logged on: ", "");
      void statsLogic.getEntriesByCompletionDate(date, activeYear, selectedTypes).then(setModalEntries);
    } else if (modalTitle.startsWith("Completed on: ")) {
      const date = modalTitle.replace("Completed on: ", "");
      void statsLogic.getEntriesByCompletionDate(date, activeYear, selectedTypes).then(setModalEntries);
    }
  };

  const activeView = dashboardPreferences.activeView;
  const activeLayout = dashboardPreferences.views[activeView];

  const updateActiveViewLayout = (
    updater: (layout: StatsDashboardPreferences["views"][StatsDashboardViewId]) => StatsDashboardPreferences["views"][StatsDashboardViewId]
  ) => {
    setDashboardPreferences((currentPreferences) => ({
      ...currentPreferences,
      views: {
        ...currentPreferences.views,
        [currentPreferences.activeView]: updater(currentPreferences.views[currentPreferences.activeView]),
      },
    }));
  };

  const handleActiveViewChange = (viewId: StatsDashboardViewId) => {
    setDashboardPreferences((currentPreferences) => ({
      ...currentPreferences,
      activeView: viewId,
    }));
  };

  const handleSummaryOrderChange = (nextVisibleOrder: (typeof SUMMARY_WIDGET_IDS)[number][]) => {
    updateActiveViewLayout((layout) => ({
      ...layout,
      summaryOrder: applyVisibleWidgetOrder(layout.summaryOrder, nextVisibleOrder),
    }));
  };

  const handleMainOrderChange = (nextVisibleOrder: (typeof MAIN_WIDGET_IDS)[number][]) => {
    updateActiveViewLayout((layout) => ({
      ...layout,
      mainOrder: applyVisibleWidgetOrder(layout.mainOrder, nextVisibleOrder),
    }));
  };

  const handleHideWidget = (widgetId: StatsWidgetId) => {
    updateActiveViewLayout((layout) => hideStatsDashboardWidget(layout, widgetId));
  };

  const handleShowWidget = (widgetId: StatsWidgetId) => {
    updateActiveViewLayout((layout) => showStatsDashboardWidget(layout, widgetId));
  };

  const handleDisplayModeChange = (widgetId: StatsWidgetId, displayMode: "bars" | "donut") => {
    updateActiveViewLayout((layout) => setStatsDashboardWidgetDisplayMode(layout, widgetId, displayMode));
  };

  const handleResetActiveView = () => {
    setDashboardPreferences((currentPreferences) => ({
      ...currentPreferences,
      views: {
        ...currentPreferences.views,
        [currentPreferences.activeView]: createDefaultStatsDashboardViewLayout(currentPreferences.activeView),
      },
    }));
  };

  if (!data) {
    return <div className="p-10 text-gray-400">Calculating analytics...</div>;
  }

  return (
    <>
      <StatsDashboard
        activeYear={activeYear}
        yearOptions={["All Time", ...years]}
        entryTypes={ENTRY_TYPES}
        selectedTypes={selectedTypes}
        profileKeys={profileKeys}
        profileKeysReady={profileKeysReady}
        onSelectedTypesChange={handleTypesChange}
        presets={PRESET_KEYS.map((key) => FILTER_PRESETS[key])}
        activePreset={activePreset}
        onPresetClick={handlePresetClick}
        onResetPreset={handleResetPreset}
        onActiveYearChange={setActiveYear}
        activeView={activeView}
        onActiveViewChange={handleActiveViewChange}
        isCustomizing={isCustomizing}
        onToggleCustomize={() => setIsCustomizing((current) => !current)}
        layout={activeLayout}
        onSummaryOrderChange={handleSummaryOrderChange}
        onMainOrderChange={handleMainOrderChange}
        onHideWidget={handleHideWidget}
        onShowWidget={handleShowWidget}
        onDisplayModeChange={handleDisplayModeChange}
        onResetActiveView={handleResetActiveView}
        data={data}
        onPerfect10Click={handlePerfect10Click}
        onThisMonthClick={handleThisMonthClick}
        onViewAllGenres={() => setGenreModalOpen(true)}
        onGenreClick={handleGenreClick}
        onMultiLogDayClick={handleMultiLogDayClick}
        onHeatmapDateClick={handleHeatmapDateClick}
      />

      <GenreBreakdownModal
        isOpen={genreModalOpen}
        onClose={() => setGenreModalOpen(false)}
        genres={data.genres}
        totalEntries={data.total}
        onGenreClick={handleGenreClick}
      />

      <StatsEntriesModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        entries={modalEntries}
        onEntriesChange={handleModalEntriesChange}
      />
    </>
  );
}
