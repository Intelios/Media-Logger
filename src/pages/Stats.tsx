import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  derivePlateSelection,
  isAllTime,
  type PlateData,
  type StatsRange,
} from "../components/stats/plate/plate-data";
import { getAvailableNavigationYears, NAVIGATION_YEARS_UPDATED_EVENT } from "../lib/navigation-years";
import { dbService, type MediaEntry, type StatsEntry } from "../lib/db";
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
import { mediaQueryKeys, queryClient } from "../lib/query-client";
import type {
  StatsWorkerRequest,
  StatsWorkerResponse,
  StatsWorkerResultMessage,
} from "../workers/stats-worker-protocol";

const STATS_YEAR_KEY = "stats-active-year";
const STATS_TYPES_KEY = "stats-selected-types";
const STATS_PRESET_KEY = "stats-active-preset";

type StatsModalSource =
  | { kind: "perfect10s" }
  | { kind: "thisMonth" }
  | { kind: "genre"; value: string }
  | { kind: "date"; value: string }
  | null;

type OpenStatsModalSource = Exclude<StatsModalSource, null>;

interface LoadedStatsDataset {
  version: number;
  year: string;
  entries: StatsEntry[];
}

interface PlatePresentation {
  year: string;
  plate: PlateData;
  comparison: StatsWorkerResultMessage["comparison"];
  typeCounts: Map<string, number>;
}

type StatsWorkerMode = "initializing" | "worker" | "synchronous";

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

function selectModalCandidates(source: OpenStatsModalSource, entries: StatsEntry[]): StatsEntry[] {
  switch (source.kind) {
    case "perfect10s":
      return entries.filter((entry) => entry.review_score === 10);
    case "thisMonth": {
      const now = new Date();
      const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      return entries.filter((entry) => entry.completion_date?.startsWith(prefix));
    }
    case "genre":
      return entries.filter((entry) => splitDelimited(entry.genre).includes(source.value));
    case "date":
      return entries.filter((entry) => entry.completion_date === source.value);
  }
}

async function loadModalEntryDetails(candidates: StatsEntry[]): Promise<MediaEntry[]> {
  const entries = await dbService.getEntriesByIds(candidates.map((entry) => entry.id));
  return sortByCompletionDesc(entries);
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

  // The main thread retains thin rows for cover/id lookup. Each version is sent
  // to the worker exactly once; brush/type changes send only tiny request data.
  const [activeDataset, setActiveDataset] = useState<LoadedStatsDataset | null>(null);
  const [comparisonDataset, setComparisonDataset] = useState<LoadedStatsDataset | null>(null);
  const activeDatasetRef = useRef<LoadedStatsDataset | null>(null);
  const comparisonDatasetRef = useRef<LoadedStatsDataset | null>(null);
  const datasetVersionRef = useRef(0);
  const activeLoadRef = useRef(0);
  const comparisonLoadRef = useRef(0);

  const workerRef = useRef<Worker | null>(null);
  const [workerMode, setWorkerMode] = useState<StatsWorkerMode>("initializing");
  const derivationSequenceRef = useRef(0);
  const latestDerivationRef = useRef(0);
  const [derivedResult, setDerivedResult] = useState<StatsWorkerResultMessage | null>(null);
  const lastPresentationRef = useRef<PlatePresentation | null>(null);

  const [modalSource, setModalSource] = useState<StatsModalSource>(null);
  const [modalEntries, setModalEntries] = useState<MediaEntry[]>([]);
  const [modalEntriesLoading, setModalEntriesLoading] = useState(false);
  const modalRequestRef = useRef(0);
  const [genreModalOpen, setGenreModalOpen] = useState(false);

  const loadYearEntries = useCallback(async () => {
    const loadId = ++activeLoadRef.current;

    // Fetched without a type filter so the toolbar can count every chip, including
    // the types currently switched off. Adult exclusion still applies in SQL,
    // while prose/version-note fields are omitted from this StatsEntry projection.
    try {
      const entries = await queryClient.fetchQuery({
        queryKey: mediaQueryKeys.statsForYear(activeYear),
        queryFn: () => dbService.getStatsEntries(activeYear),
      });
      if (loadId !== activeLoadRef.current) return;
      const dataset = {
        version: ++datasetVersionRef.current,
        year: activeYear,
        entries,
      };
      activeDatasetRef.current = dataset;
      setActiveDataset(dataset);
    } catch (error) {
      if (loadId === activeLoadRef.current) {
        console.error("Failed to load the Stats dataset:", error);
      }
    }
  }, [activeYear]);

  useEffect(() => {
    void loadYearEntries();
  }, [loadYearEntries, adultEnabled]);

  const useSynchronousWorkerFallback = useCallback((reason: unknown) => {
    console.warn("[Stats] Worker unavailable; using synchronous derivation.", reason);
    workerRef.current?.terminate();
    workerRef.current = null;
    setWorkerMode("synchronous");
  }, []);

  useEffect(() => {
    let disposed = false;
    let worker: Worker | null = null;

    const useSynchronousFallback = (reason: unknown) => {
      if (disposed) return;
      useSynchronousWorkerFallback(reason);
    };

    try {
      worker = new Worker(new URL("../workers/stats-worker.ts", import.meta.url), {
        type: "module",
        name: "media-logger-stats",
      });
      workerRef.current = worker;

      worker.addEventListener("message", (event: MessageEvent<StatsWorkerResponse>) => {
        const message = event.data;
        if (message.requestId !== latestDerivationRef.current) return;

        if (message.type === "error") {
          // A worker-posted error is a per-request derivation failure caught
          // inside the worker (e.g. a malformed date tripping
          // derivePlateSelection), not a worker crash. The worker is still
          // alive and retaining its datasets, so terminating it here would
          // permanently sacrifice off-main-thread derivation for the rest of
          // the session over a single recoverable exception. Log and keep the
          // last good result visible; the next input change re-derives on the
          // worker. Truly fatal failures surface through the Worker "error"
          // event below, which still falls back synchronously.
          console.error("[Stats] Worker derivation failed (recoverable):", message.message);
          return;
        }

        const active = activeDatasetRef.current;
        if (!active || active.version !== message.activeVersion) return;
        if (message.comparisonVersion !== null) {
          const comparison = comparisonDatasetRef.current;
          if (!comparison || comparison.version !== message.comparisonVersion) return;
        }
        setDerivedResult(message);
      });
      worker.addEventListener("error", (event) => {
        event.preventDefault();
        useSynchronousFallback(event.message || "Stats worker failed to load.");
      });
      setWorkerMode("worker");
    } catch (error) {
      useSynchronousFallback(error);
    }

    return () => {
      disposed = true;
      worker?.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, [useSynchronousWorkerFallback]);

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
      comparisonLoadRef.current += 1;
      comparisonDatasetRef.current = null;
      setComparisonDataset(null);
      return;
    }

    const loadId = ++comparisonLoadRef.current;
    comparisonDatasetRef.current = null;
    setComparisonDataset(null);
    void dbService.getStatsEntries(compareYear).then(
      (entries) => {
        if (loadId !== comparisonLoadRef.current) return;
        const dataset = {
          version: ++datasetVersionRef.current,
          year: compareYear,
          entries,
        };
        comparisonDatasetRef.current = dataset;
        setComparisonDataset(dataset);
      },
      (error) => {
        if (loadId === comparisonLoadRef.current) {
          console.error("Failed to load the comparison Stats dataset:", error);
        }
      }
    );
  }, [preferences.compareEnabled, preferences.compareYear, adultEnabled]);

  // Dataset messages are isolated from selection messages: each thin row set
  // crosses to the worker once, then remains retained there until its version
  // is replaced or the comparison slot is cleared.
  useEffect(() => {
    if (workerMode !== "worker" || !activeDataset || !workerRef.current) return;
    const message: StatsWorkerRequest = {
      type: "set-dataset",
      slot: "active",
      version: activeDataset.version,
      year: activeDataset.year,
      entries: activeDataset.entries,
    };
    try {
      workerRef.current.postMessage(message);
    } catch (error) {
      useSynchronousWorkerFallback(error);
    }
  }, [activeDataset, useSynchronousWorkerFallback, workerMode]);

  useEffect(() => {
    if (workerMode !== "worker" || !workerRef.current) return;
    const message: StatsWorkerRequest = comparisonDataset
      ? {
          type: "set-dataset",
          slot: "comparison",
          version: comparisonDataset.version,
          year: comparisonDataset.year,
          entries: comparisonDataset.entries,
        }
      : { type: "clear-dataset", slot: "comparison" };
    try {
      workerRef.current.postMessage(message);
    } catch (error) {
      useSynchronousWorkerFallback(error);
    }
  }, [comparisonDataset, useSynchronousWorkerFallback, workerMode]);

  // Every change is coalesced at the animation-frame boundary. Brush movement
  // can therefore enqueue at most one tiny derive request per painted frame;
  // it never performs SQL and never retransfers the retained dataset.
  useEffect(() => {
    if (!activeDataset || workerMode === "initializing") return;

    const requestId = ++derivationSequenceRef.current;
    latestDerivationRef.current = requestId;
    const compareYear = preferences.compareEnabled ? preferences.compareYear : null;
    const usableComparison =
      compareYear && comparisonDataset?.year === compareYear ? comparisonDataset : null;

    const frame = requestAnimationFrame(() => {
      const request: StatsWorkerRequest = {
        type: "derive",
        requestId,
        activeVersion: activeDataset.version,
        comparisonVersion: usableComparison?.version ?? null,
        activeYear: activeDataset.year,
        comparisonYear: usableComparison?.year ?? null,
        selectedTypes,
        range,
      };

      if (workerMode === "worker" && workerRef.current) {
        try {
          workerRef.current.postMessage(request);
        } catch (error) {
          useSynchronousWorkerFallback(error);
        }
        return;
      }

      try {
        const result = derivePlateSelection(
          activeDataset.entries,
          activeDataset.year,
          selectedTypes,
          range,
          usableComparison
            ? { entries: usableComparison.entries, year: usableComparison.year }
            : null,
        );
        if (requestId !== latestDerivationRef.current) return;
        setDerivedResult({
          type: "result",
          requestId,
          activeVersion: activeDataset.version,
          comparisonVersion: usableComparison?.version ?? null,
          plate: result.plate,
          comparison: result.comparison,
        });
      } catch (error) {
        console.error("Failed to derive Stats synchronously:", error);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [
    activeDataset,
    comparisonDataset,
    preferences.compareEnabled,
    preferences.compareYear,
    range,
    selectedTypes,
    useSynchronousWorkerFallback,
    workerMode,
  ]);

  const currentPresentation = useMemo<PlatePresentation | null>(() => {
    if (!activeDataset || !derivedResult || derivedResult.activeVersion !== activeDataset.version) {
      return null;
    }
    const entriesById = new Map(activeDataset.entries.map((entry) => [entry.id, entry]));
    const rangedEntries = derivedResult.plate.rangedEntryIds
      .map((id) => entriesById.get(id))
      .filter((entry): entry is StatsEntry => entry !== undefined);
    return {
      year: activeDataset.year,
      plate: {
        stats: derivedResult.plate.stats,
        timeline: derivedResult.plate.timeline,
        granularity: derivedResult.plate.granularity,
        brushCells: derivedResult.plate.brushCells,
        rangedEntries,
        genreCount: derivedResult.plate.genreCount,
      },
      comparison: derivedResult.comparison,
      // Chip counts are the only O(n) work kept on the main thread, and run
      // once per fetched dataset rather than on brush/type requests.
      typeCounts: countEntriesByType(activeDataset.entries),
    };
  }, [activeDataset, derivedResult]);

  if (currentPresentation) {
    lastPresentationRef.current = currentPresentation;
  }
  const presentation = currentPresentation ?? lastPresentationRef.current;
  const plate = presentation?.plate ?? null;

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

  const openStatsModal = useCallback((source: OpenStatsModalSource) => {
    if (!plate) return;
    const requestId = ++modalRequestRef.current;
    const candidates = selectModalCandidates(source, plate.rangedEntries);
    setModalSource(source);
    setModalEntries([]);
    setModalEntriesLoading(true);

    // The worker/main caches intentionally hold thin rows. Full prose fields
    // are fetched only for this explicit modal action, never from a range/type
    // derivation or brush event.
    void loadModalEntryDetails(candidates).then(
      (entries) => {
        if (requestId !== modalRequestRef.current) return;
        setModalEntries(entries);
        setModalEntriesLoading(false);
      },
      (error) => {
        if (requestId !== modalRequestRef.current) return;
        console.error("Failed to load Stats modal entry details:", error);
        setModalEntries([]);
        setModalEntriesLoading(false);
      },
    );
  }, [plate]);

  const closeStatsModal = () => {
    modalRequestRef.current += 1;
    setModalSource(null);
    setModalEntries([]);
    setModalEntriesLoading(false);
  };

  const handleGenreClick = (genre: string) => {
    setGenreModalOpen(false);
    openStatsModal({ kind: "genre", value: genre });
  };

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

  if (!presentation || !plate) {
    return <div className="p-10 text-gray-400">Calculating analytics...</div>;
  }

  return (
    <>
      <StatsPlate
        activeYear={activeYear}
        displayedYear={presentation.year}
        yearOptions={yearOptions}
        onActiveYearChange={setActiveYear}
        entryTypes={getVisibleEntryTypes()}
        typeCounts={presentation.typeCounts}
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
        comparison={presentation.comparison}
        range={range}
        onRangeChange={setRange}
        onGenreClick={handleGenreClick}
        onPerfectClick={() => openStatsModal({ kind: "perfect10s" })}
        onThisMonthClick={() => openStatsModal({ kind: "thisMonth" })}
        onDateClick={(date) => openStatsModal({ kind: "date", value: date })}
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
        onClose={closeStatsModal}
        title={modalTitle}
        entries={modalEntries}
        isLoading={modalEntriesLoading}
        onEntriesChange={() => {
          void loadYearEntries();
          if (modalSource) openStatsModal(modalSource);
        }}
      />
    </>
  );
}
