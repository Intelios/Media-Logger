import { useCallback, useEffect, useMemo, useState } from "react";
import { StatsEntriesModal } from "../components/StatsEntriesModal";
import { GenreBreakdownModal } from "../components/GenreBreakdownModal";
import { StatsPlate } from "../components/stats/plate/StatsPlate";
import {
  DEFAULT_PLATE_PREFERENCES,
  loadPlatePreferences,
  savePlatePreferences,
  type PlateFigureId,
  type PlatePanelId,
  type PlatePreferences,
  type TimelineLayerId,
} from "../components/stats/plate/plate-config";
import {
  countEntriesByType,
  derivePlateData,
  deriveComparison,
  filterEntriesByTypes,
  isAllTime,
  type StatsRange,
} from "../components/stats/plate/plate-data";
import { getAvailableNavigationYears, NAVIGATION_YEARS_UPDATED_EVENT } from "../lib/navigation-years";
import { type MediaEntry } from "../lib/db";
import {
  ENTRY_TYPES,
  FILTER_PRESETS,
  FILTER_PRESET_KEYS,
  getVisibleEntryTypes,
  getVisiblePresetKeys,
  useAdultMediaEnabled,
  type FilterPresetKey,
} from "../lib/media-config";
import { getNavigationYears } from "../lib/settings";
import { statsLogic } from "../lib/stats-logic";

const STATS_YEAR_KEY = "stats-active-year";
const STATS_TYPES_KEY = "stats-selected-types";
const STATS_PRESET_KEY = "stats-active-preset";

type StatsModalSource =
  | { kind: "perfect10s" }
  | { kind: "thisMonth" }
  | { kind: "genre"; value: string }
  | { kind: "date"; value: string }
  | null;

function loadPersistedPreset(): FilterPresetKey | null {
  try {
    const stored = localStorage.getItem(STATS_PRESET_KEY);
    if (stored && FILTER_PRESET_KEYS.includes(stored as FilterPresetKey)) {
      return stored as FilterPresetKey;
    }
  } catch {
    // Fall back to no preset.
  }

  return null;
}

// The preset and the type selection are stored separately and can drift apart
// (change types, and the old preset key is still on disk). A preset badge that
// does not describe the actual selection is worse than no badge.
function loadConsistentPreset(): FilterPresetKey | null {
  const preset = loadPersistedPreset();
  if (!preset) {
    return null;
  }

  const selected = loadPersistedTypes();
  const presetTypes = FILTER_PRESETS[preset].types;
  const matches =
    presetTypes.length === selected.length && presetTypes.every((type) => selected.includes(type));

  return matches ? preset : null;
}

function loadPersistedYear(): string {
  try {
    return localStorage.getItem(STATS_YEAR_KEY) ?? "All Time";
  } catch {
    return "All Time";
  }
}

function loadPersistedTypes(): string[] {
  try {
    const stored = localStorage.getItem(STATS_TYPES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.every((type) => ENTRY_TYPES.includes(type))) {
        const visible = getVisibleEntryTypes();
        const filtered = parsed.filter((type) => visible.includes(type));
        if (filtered.length > 0) {
          return filtered;
        }
      }
    }
  } catch {
    // Fall back to the full type list.
  }

  return getVisibleEntryTypes();
}

function splitDelimited(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function sortByCompletionDesc(entries: MediaEntry[]): MediaEntry[] {
  return [...entries].sort((left, right) => (right.completion_date ?? "").localeCompare(left.completion_date ?? ""));
}

export default function StatsPage() {
  const adultEnabled = useAdultMediaEnabled();
  const [years, setYears] = useState<string[]>(() => getNavigationYears());
  const [activeYear, setActiveYear] = useState(loadPersistedYear);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(loadPersistedTypes);
  const [activePreset, setActivePreset] = useState<FilterPresetKey | null>(loadConsistentPreset);
  const [preferences, setPreferences] = useState<PlatePreferences>(loadPlatePreferences);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [range, setRange] = useState<StatsRange | null>(null);

  // Every stat on the page is derived from this one row set. Brushing, type
  // toggles and comparison all re-derive in memory rather than re-querying.
  const [yearEntries, setYearEntries] = useState<MediaEntry[] | null>(null);
  const [comparisonEntries, setComparisonEntries] = useState<MediaEntry[] | null>(null);

  const [modalSource, setModalSource] = useState<StatsModalSource>(null);
  const [genreModalOpen, setGenreModalOpen] = useState(false);

  const loadYearEntries = useCallback(async () => {
    // Fetched without a type filter so the toolbar can count every chip, including
    // the types currently switched off. Adult exclusion still applies in SQL.
    const entries = await statsLogic.getFilteredEntries(activeYear);
    setYearEntries(entries);
  }, [activeYear]);

  useEffect(() => {
    void loadYearEntries();
  }, [loadYearEntries, adultEnabled]);

  useEffect(() => {
    localStorage.setItem(STATS_YEAR_KEY, activeYear);
  }, [activeYear]);

  useEffect(() => {
    localStorage.setItem(STATS_TYPES_KEY, JSON.stringify(selectedTypes));
  }, [selectedTypes]);

  useEffect(() => {
    savePlatePreferences(preferences);
  }, [preferences]);

  // A range is expressed in dates of the active year, so it cannot survive a
  // year change.
  useEffect(() => {
    setRange(null);
  }, [activeYear]);

  useEffect(() => {
    const refreshYears = async () => {
      setYears(await getAvailableNavigationYears());
    };

    const handleYearsChanged = () => {
      void refreshYears();
      void loadYearEntries();
    };

    void refreshYears();

    window.addEventListener(NAVIGATION_YEARS_UPDATED_EVENT, handleYearsChanged);
    window.addEventListener("entry-added", handleYearsChanged as EventListener);

    return () => {
      window.removeEventListener(NAVIGATION_YEARS_UPDATED_EVENT, handleYearsChanged);
      window.removeEventListener("entry-added", handleYearsChanged as EventListener);
    };
  }, [loadYearEntries]);

  useEffect(() => {
    if (activeYear !== "All Time" && !years.includes(activeYear)) {
      setActiveYear("All Time");
    }
  }, [activeYear, years]);

  // When Adult Media is toggled off, drop hidden types and clear the adult preset
  // so the visible selection and the fetched data stay consistent.
  useEffect(() => {
    const visible = getVisibleEntryTypes();
    setSelectedTypes((current) => {
      const filtered = current.filter((type) => visible.includes(type));
      return filtered.length === current.length ? current : filtered.length > 0 ? filtered : visible;
    });
    setActivePreset((current) => (current === "adult" ? null : current));
  }, [adultEnabled]);

  const yearOptions = useMemo(() => ["All Time", ...years], [years]);

  // Comparison only makes sense against a specific year, so All Time offers none.
  const comparisonYearOptions = useMemo(
    () => (isAllTime(activeYear) ? [] : years.filter((year) => year !== activeYear)),
    [years, activeYear]
  );

  const typeCounts = useMemo(() => countEntriesByType(yearEntries ?? []), [yearEntries]);

  const typedEntries = useMemo(
    () => filterEntriesByTypes(yearEntries ?? [], selectedTypes),
    [yearEntries, selectedTypes]
  );

  const plate = useMemo(
    () => derivePlateData(typedEntries, activeYear, range),
    [typedEntries, activeYear, range]
  );

  const comparison = useMemo(() => {
    if (!preferences.compareEnabled || !preferences.compareYear || !comparisonEntries) {
      return null;
    }

    return deriveComparison(
      filterEntriesByTypes(comparisonEntries, selectedTypes),
      preferences.compareYear,
      range
    );
  }, [preferences.compareEnabled, preferences.compareYear, comparisonEntries, selectedTypes, range]);

  // Keep the comparison year valid for the current options: pick one when compare
  // is on but nothing is chosen (or the choice became the active year), and clear
  // it when compare is off. Without this the picker can display a year that is not
  // actually selected, and no comparison is ever fetched.
  useEffect(() => {
    setPreferences((current) => {
      if (current.compareYear !== null && comparisonYearOptions.includes(current.compareYear)) {
        return current;
      }

      const nextYear = current.compareEnabled ? (comparisonYearOptions[0] ?? null) : null;
      return nextYear === current.compareYear ? current : { ...current, compareYear: nextYear };
    });
  }, [comparisonYearOptions]);

  useEffect(() => {
    const compareYear = preferences.compareYear;
    if (!preferences.compareEnabled || !compareYear) {
      setComparisonEntries(null);
      return;
    }

    let cancelled = false;
    void statsLogic.getFilteredEntries(compareYear).then((entries) => {
      if (!cancelled) {
        setComparisonEntries(entries);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [preferences.compareEnabled, preferences.compareYear, adultEnabled]);

  const handleTypesChange = (types: string[]) => {
    setSelectedTypes(types);
    setActivePreset(null);
    localStorage.removeItem(STATS_PRESET_KEY);
  };

  const handlePresetClick = (presetKey: string) => {
    const key = presetKey as FilterPresetKey;

    if (activePreset === key) {
      setActivePreset(null);
      setSelectedTypes(getVisibleEntryTypes());
      localStorage.removeItem(STATS_PRESET_KEY);
      return;
    }

    setActivePreset(key);
    setSelectedTypes([...FILTER_PRESETS[key].types]);
    localStorage.setItem(STATS_PRESET_KEY, key);
  };

  const handleSlotChange = (slotIndex: number, panelId: PlatePanelId) => {
    setPreferences((current) => {
      const slots = [...current.slots];
      const existingIndex = slots.indexOf(panelId);

      // Swap rather than duplicate when the chosen panel already occupies a slot.
      if (existingIndex !== -1) {
        slots[existingIndex] = slots[slotIndex];
      }

      slots[slotIndex] = panelId;
      return { ...current, slots };
    });
  };

  const handleToggleFigure = (figureId: PlateFigureId) => {
    setPreferences((current) => ({
      ...current,
      figures: current.figures.includes(figureId)
        ? current.figures.filter((candidate) => candidate !== figureId)
        : [...current.figures, figureId],
    }));
  };

  const handleToggleLayer = (layerId: TimelineLayerId) => {
    setPreferences((current) => ({
      ...current,
      layers: current.layers.includes(layerId)
        ? current.layers.filter((candidate) => candidate !== layerId)
        : [...current.layers, layerId],
    }));
  };

  const handleToggleCompare = () => {
    setPreferences((current) => ({
      ...current,
      compareEnabled: !current.compareEnabled,
      compareYear: current.compareYear ?? comparisonYearOptions[0] ?? null,
    }));
  };

  const handleCompareYearChange = (year: string) => {
    setPreferences((current) => ({ ...current, compareYear: year }));
  };

  const handleResetPreferences = () => {
    setPreferences({ ...DEFAULT_PLATE_PREFERENCES, slots: [...DEFAULT_PLATE_PREFERENCES.slots] });
  };

  const handleGenreClick = (genre: string) => {
    setGenreModalOpen(false);
    setModalSource({ kind: "genre", value: genre });
  };

  // Modal contents are derived from the same in-memory rows as the plate, so a
  // brushed selection narrows them too and an edit refreshes them for free.
  const modalEntries = useMemo(() => {
    if (!modalSource) {
      return [];
    }

    switch (modalSource.kind) {
      case "perfect10s":
        return sortByCompletionDesc(plate.rangedEntries.filter((entry) => entry.review_score === 10));
      case "thisMonth": {
        const now = new Date();
        const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        return sortByCompletionDesc(plate.rangedEntries.filter((entry) => entry.completion_date?.startsWith(prefix)));
      }
      case "genre":
        return sortByCompletionDesc(
          plate.rangedEntries.filter((entry) => splitDelimited(entry.genre).includes(modalSource.value))
        );
      case "date":
        return plate.rangedEntries.filter((entry) => entry.completion_date === modalSource.value);
    }
  }, [modalSource, plate.rangedEntries]);

  const modalTitle = useMemo(() => {
    switch (modalSource?.kind) {
      case "perfect10s":
        return "Perfect 10s";
      case "thisMonth":
        return "This Month";
      case "genre":
        return `Genre: ${modalSource.value}`;
      case "date":
        return `Logged on: ${modalSource.value}`;
      default:
        return "";
    }
  }, [modalSource]);

  if (!yearEntries) {
    return <div className="p-10 text-gray-400">Calculating analytics...</div>;
  }

  return (
    <>
      <StatsPlate
        activeYear={activeYear}
        yearOptions={yearOptions}
        onActiveYearChange={setActiveYear}
        entryTypes={getVisibleEntryTypes()}
        typeCounts={typeCounts}
        selectedTypes={selectedTypes}
        onSelectedTypesChange={handleTypesChange}
        presets={getVisiblePresetKeys().map((key) => FILTER_PRESETS[key])}
        activePreset={activePreset}
        onPresetClick={handlePresetClick}
        preferences={preferences}
        onSlotChange={handleSlotChange}
        onToggleFigure={handleToggleFigure}
        onToggleLayer={handleToggleLayer}
        onResetPreferences={handleResetPreferences}
        onToggleCompare={handleToggleCompare}
        onCompareYearChange={handleCompareYearChange}
        comparisonYearOptions={comparisonYearOptions}
        isCustomizing={isCustomizing}
        onToggleCustomize={() => setIsCustomizing((current) => !current)}
        plate={plate}
        comparison={comparison}
        range={range}
        onRangeChange={setRange}
        onGenreClick={handleGenreClick}
        onPerfectClick={() => setModalSource({ kind: "perfect10s" })}
        onThisMonthClick={() => setModalSource({ kind: "thisMonth" })}
        onDateClick={(date) => setModalSource({ kind: "date", value: date })}
      />

      <GenreBreakdownModal
        isOpen={genreModalOpen}
        onClose={() => setGenreModalOpen(false)}
        genres={plate.stats.genres}
        totalEntries={plate.stats.total}
        onGenreClick={handleGenreClick}
      />

      <StatsEntriesModal
        isOpen={modalSource !== null}
        onClose={() => setModalSource(null)}
        title={modalTitle}
        entries={modalEntries}
        onEntriesChange={() => void loadYearEntries()}
      />
    </>
  );
}
