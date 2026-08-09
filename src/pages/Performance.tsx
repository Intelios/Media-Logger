import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Activity,
  Copy,
  DatabaseZap,
  FlaskConical,
  Gauge,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  clearImagePrewarmMarkers,
  clearImageServiceCache,
  prewarmImageCache,
  refreshImageServiceStatus,
  useImageServiceStatus,
} from "../lib/image-service";
import { dbService } from "../lib/db";
import { IS_PERFORMANCE_BUILD } from "../lib/performance-mode";
import { requestMediaQueryInvalidation } from "../lib/query-client";
import {
  buildSanitizedPerformanceReport,
  clearPerformanceCapture,
  getPerformanceDiagnosticsSnapshot,
  startPerformanceCapture,
  stopPerformanceCapture,
  type PerformanceCategory,
  type PerformanceSummary,
} from "../lib/performance-diagnostics";
import type { XAxisTickContentProps, YAxisTickContentProps } from "recharts";

const SERIES_COLOR = "var(--color-primary)";
const SERIES_COLOR_SECONDARY = "var(--color-secondary)";
const GRID_COLOR = "rgba(255, 255, 255, 0.06)";
const AXIS_COLOR = "var(--color-text-subtle)";

function formatBytes(value: number | null): string {
  if (value == null) return "Unavailable";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(amount >= 100 ? 0 : 1)} ${units[unit]}`;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function elapsedFromLabel(value: unknown, firstTimestamp: number | undefined): string {
  const numeric = typeof value === "number" ? value : Number(value);
  const anchor = typeof firstTimestamp === "number" ? firstTimestamp : numeric;
  return formatElapsed(Math.max(0, (numeric - anchor) / 1000));
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-text-subtle">{label}</div>
      <div className="mt-1 text-lg font-semibold text-text">{value}</div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  empty,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-black/15 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        {subtitle && <span className="text-xs text-text-subtle">{subtitle}</span>}
      </div>
      {empty ? (
        <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-white/10 text-xs text-text-subtle">
          Start a capture to see live data
        </div>
      ) : (
        children
      )}
    </section>
  );
}

const CATEGORY_LABELS: Record<PerformanceCategory, string> = {
  launch: "Launch",
  route: "Routes",
  query: "Queries",
  mutation: "Mutations",
  search: "Search",
  stats: "Stats",
  image: "Images",
  react: "React commits",
  "long-task": "Long tasks",
  interaction: "Interactions",
};

const CATEGORY_ORDER: PerformanceCategory[] = [
  "route",
  "query",
  "mutation",
  "search",
  "stats",
  "image",
  "react",
  "launch",
  "interaction",
  "long-task",
];

interface ChartTooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: ChartTooltipEntry[];
  label?: string | number;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-tooltip rounded-xl px-3 py-2 text-xs">
      {label != null && (
        <div className="mb-1 font-semibold text-text">{String(label)}</div>
      )}
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 py-0.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: entry.color ?? "var(--color-primary)" }}
          />
          <span className="text-text-muted">{entry.name}</span>
          <span className="ml-auto pl-3 font-mono text-text">
            {formatter && typeof entry.value === "number"
              ? formatter(entry.value)
              : String(entry.value ?? "")}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChartAxisX({ x, y, payload }: XAxisTickContentProps) {
  return (
    <text x={x} y={y} dy={12} textAnchor="middle" fill={AXIS_COLOR} fontSize={10}>
      {String(payload.value)}
    </text>
  );
}

function ChartAxisY({ x, y, payload }: YAxisTickContentProps) {
  return (
    <text x={x} y={y} dy={3.5} textAnchor="end" fill={AXIS_COLOR} fontSize={10}>
      {String(payload.value)}
    </text>
  );
}

interface FixtureProgressEvent {
  phase: string;
  completed: number;
  total: number;
  message: string;
}

interface FixtureResult {
  preset: string;
  entries: number;
  distinctCovers: number;
  localImageFiles: number;
  missingImages: number;
  corruptImages: number;
  profiles: number;
  collections: number;
  collectionItems: number;
  awardCategories: number;
  backlogItems: number;
  bytesWritten: number;
  elapsedMs: number;
}

export default function Performance() {
  const imageStatus = useImageServiceStatus();
  const [diagnostics, setDiagnostics] = useState(() => getPerformanceDiagnosticsSnapshot());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<PerformanceCategory>("route");
  const [sortKey, setSortKey] = useState<"name" | "p50Ms" | "p95Ms" | "maximumMs" | "count" | "averageMs">("p95Ms");
  const [sortDescending, setSortDescending] = useState(true);
  const [fixtureProgress, setFixtureProgress] = useState<FixtureProgressEvent | null>(null);
  const [fixtureResult, setFixtureResult] = useState<FixtureResult | null>(null);

  // Poll the diagnostics snapshot instead of subscribing to it. The app-level
  // Profiler records a sample on every React commit; a subscription would
  // re-render this panel on each commit, which commits again — an infinite
  // update loop. Polling keeps the panel live without feeding back into the
  // commit cycle.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setDiagnostics(getPerformanceDiagnosticsSnapshot());
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void refreshImageServiceStatus().catch(() => {
      // App bootstrap may still be configuring the service. Its external store
      // will update this panel when ready.
    });
  }, []);

  // Live progress from the native fixture generator. The generator runs in
  // blocking workers and emits phase/completed/total events; the panel only
  // displays them, so this cannot feed back into the commit cycle.
  useEffect(() => {
    if (!IS_PERFORMANCE_BUILD) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<FixtureProgressEvent>("performance-fixture-progress", (event) => {
      if (!cancelled) setFixtureProgress(event.payload);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const run = async (key: string, operation: () => Promise<void>) => {
    setBusy(key);
    setMessage("");
    try {
      await operation();
    } catch (error) {
      console.error(`[Performance] ${key} failed:`, error);
      setMessage("The operation could not be completed. See the developer console for details.");
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    const report = buildSanitizedPerformanceReport({
      imageCache: imageStatus
        ? {
            recipeVersion: imageStatus.recipeVersion,
            generation: imageStatus.generation ?? null,
            memoryEntries: imageStatus.memoryEntries,
            memoryBytes: imageStatus.memoryBytes,
            diskEntries: imageStatus.diskEntries,
            diskBytes: imageStatus.diskBytes,
            diskLimitBytes: imageStatus.diskLimitBytes,
            stagedImports: imageStatus.stagedImports,
          }
        : null,
    });
    await navigator.clipboard.writeText(report);
    setMessage("Sanitized performance report copied. It contains no titles, notes, descriptions, or filesystem paths.");
  };

  const handleGenerateFixture = async (preset: "small" | "large") => {
    if (busy != null) return;
    setBusy(`fixture-${preset}`);
    setMessage("");
    setFixtureProgress(null);
    setFixtureResult(null);
    try {
      const db = await dbService.connect();
      const result = await invoke<FixtureResult>("generate_performance_fixture", {
        preset,
        databaseUrl: db.path,
      });
      setFixtureResult(result);
      // The generator writes directly to SQLite, so cached queries and the
      // prewarm marker must be refreshed for the new library to appear and
      // for derivatives to be prepared in the background.
      requestMediaQueryInvalidation();
      clearImagePrewarmMarkers();
      void dbService
        .getAllReferencedCoverPaths()
        .then(async (paths) => {
          for (let offset = 0; offset < paths.length; offset += 200) {
            const batch = paths.slice(offset, offset + 200);
            await prewarmImageCache(
              batch.flatMap((imagePath) => [
                { imagePath, variant: "small" as const },
                { imagePath, variant: "card" as const },
              ]),
            );
          }
        })
        .catch((error) => {
          console.warn("[Performance Lab] Background derivative prewarm failed:", error);
        });
      setMessage(
        `Synthetic ${preset} corpus ready: ${result.entries.toLocaleString()} entries, ` +
          `${result.distinctCovers.toLocaleString()} covers, ${result.localImageFiles.toLocaleString()} image files. ` +
          `Cached queries were invalidated; revisit a page to see the library.`,
      );
    } catch (error) {
      console.error("[Performance Lab] Fixture generation failed:", error);
      setMessage(`Fixture generation failed: ${String(error)}`);
    } finally {
      setBusy(null);
      setFixtureProgress(null);
    }
  };

  const groupedByCategory = useMemo(() => {
    const groups = new Map<PerformanceCategory, Array<[string, PerformanceSummary]>>();
    for (const [key, summary] of Object.entries(diagnostics.summaries)) {
      const category = key.slice(0, key.indexOf(":")) as PerformanceCategory;
      const name = key.slice(key.indexOf(":") + 1);
      const list = groups.get(category) ?? [];
      list.push([name, summary]);
      groups.set(category, list);
    }
    return groups;
  }, [diagnostics.summaries]);

  const visibleOperations = useMemo(() => {
    const list = groupedByCategory.get(selectedCategory) ?? [];
    return [...list].sort(([leftName, left], [rightName, right]) => {
      if (sortKey === "name") {
        const difference = leftName.localeCompare(rightName);
        return sortDescending ? -difference : difference;
      }
      const difference = right[sortKey] - left[sortKey];
      if (difference !== 0) return sortDescending ? difference : -difference;
      return sortDescending ? leftName.localeCompare(rightName) : rightName.localeCompare(leftName);
    });
  }, [groupedByCategory, selectedCategory, sortKey, sortDescending]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<PerformanceCategory, number>();
    for (const [key] of Object.entries(diagnostics.summaries)) {
      const category = key.slice(0, key.indexOf(":")) as PerformanceCategory;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return counts;
  }, [diagnostics.summaries]);

  const selectedCategoryTotals = useMemo(() => {
    const list = groupedByCategory.get(selectedCategory) ?? [];
    if (list.length === 0) return null;
    return {
      operations: list.length,
      samples: list.reduce((sum, [, summary]) => sum + summary.count, 0),
      p95Max: Math.max(...list.map(([, summary]) => summary.p95Ms)),
    };
  }, [groupedByCategory, selectedCategory]);

  const histogramRows = useMemo(() => {
    let maxCount = 0;
    const rows = diagnostics.frameHistogramBuckets.map((count, bucket) => {
      if (count > maxCount) maxCount = count;
      return {
        bucket: `${bucket}ms`,
        count,
      };
    });
    return { rows, maxCount };
  }, [diagnostics.frameHistogramBuckets]);

  const capturedSeconds =
    diagnostics.startedAt == null
      ? null
      : (Date.now() - new Date(diagnostics.startedAt).getTime()) / 1000;

  const droppedSamples = Object.entries(diagnostics.droppedSamples);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-lg"
          style={{
            background: "linear-gradient(to bottom right, var(--color-primary), var(--color-secondary))",
            boxShadow: "0 10px 15px -3px color-mix(in srgb, var(--color-primary) 20%, transparent)",
          }}
        >
          <Gauge size={24} style={{ color: "white" }} />
        </div>
        <div>
          <h1
            className="text-2xl font-bold bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(to right, var(--color-primary), var(--color-secondary))" }}
          >
            Performance
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {IS_PERFORMANCE_BUILD
              ? "Performance Lab instrumentation, capture controls, and derivative cache"
              : "Local-only timing, frame, React commit, and image-paint measurements. Reports are sanitized and never sent anywhere automatically."}
          </p>
        </div>
      </div>

      {/* Capture toolbar */}
      <section className="rounded-xl border border-white/10 bg-black/15 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {diagnostics.capturing ? (
            <button className="settings-btn settings-btn-secondary" onClick={stopPerformanceCapture}>
              <Square size={14} /> Stop capture
            </button>
          ) : (
            <button className="settings-btn settings-btn-primary" onClick={startPerformanceCapture}>
              <Play size={14} /> Start capture
            </button>
          )}
          <button className="settings-btn settings-btn-secondary" onClick={clearPerformanceCapture}>
            <RefreshCw size={14} /> Reset samples
          </button>
          <button className="settings-btn settings-btn-secondary" onClick={() => void handleCopy()}>
            <Copy size={14} /> Copy sanitized report
          </button>
          <div className="ml-auto flex items-center gap-2 text-xs text-text-subtle">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                background: diagnostics.capturing ? "#34d399" : "var(--color-text-subtle)",
                boxShadow: diagnostics.capturing ? "0 0 8px rgba(52, 211, 153, 0.8)" : undefined,
              }}
            />
            {diagnostics.capturing ? (
              <span className="text-emerald-400">
                Capturing{diagnostics.startedAt && capturedSeconds != null
                  ? ` · ${formatElapsed(capturedSeconds)}`
                  : ""}
              </span>
            ) : (
              <span>Capture stopped</span>
            )}
          </div>
        </div>

        {message && (
          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-text-muted">
            {message}
          </div>
        )}

        <div className="mt-3 text-xs text-text-subtle">
          {diagnostics.displayHz == null
            ? "Display cadence calibrates after ~120 frames."
            : `Display measured at ${diagnostics.displayHz} Hz — on an adaptive-refresh panel, idle stretches lower the ≤${diagnostics.displayIntervalMs}ms figure without any jank, so read it against the p95 interval.`}
          {diagnostics.ignoredFrameGapCount > 0 &&
            ` ${diagnostics.ignoredFrameGapCount} paused-compositor gap${diagnostics.ignoredFrameGapCount === 1 ? "" : "s"} excluded.`}
          {!diagnostics.capabilities.longTasks &&
            " This engine has no Long Tasks API — use long frames and interaction samples instead."}
          {!diagnostics.capabilities.jsHeap && " Heap size is unavailable in this engine."}
        </div>

        {droppedSamples.length > 0 && (
          <div className="mt-2 text-xs text-amber-300/80">
            Retention cap reached: {droppedSamples.map(([category, count]) => `${category} (−${count})`).join(", ")}.
            Those summaries cover a recent window, not the whole session.
          </div>
        )}
      </section>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Metric label="Samples" value={diagnostics.sampleCount} />
        <Metric label="Frames sampled" value={diagnostics.frameCount} />
        <Metric
          label="Frames ≤16.7ms"
          value={diagnostics.framesWithinBudgetPercent == null ? "—" : `${diagnostics.framesWithinBudgetPercent}%`}
        />
        <Metric
          label={diagnostics.displayIntervalMs == null ? "Frames ≤display" : `Frames ≤${diagnostics.displayIntervalMs}ms`}
          value={
            diagnostics.framesWithinDisplayIntervalPercent == null
              ? "Calibrating"
              : `${diagnostics.framesWithinDisplayIntervalPercent}%`
          }
        />
        <Metric
          label="Frame interval p95"
          value={diagnostics.frameIntervalP95Ms == null ? "—" : `${diagnostics.frameIntervalP95Ms}ms`}
        />
        <Metric label="Long frames >50ms" value={diagnostics.longFrameCount} />
        <Metric
          label="Long tasks"
          value={diagnostics.longTaskCount == null ? "Unavailable" : diagnostics.longTaskCount}
        />
        <Metric label="JS heap" value={formatBytes(diagnostics.memoryBytes)} />
      </div>

      {/* Live time-series */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Frame interval over time"
          subtitle="Throttled to ~10 Hz · capture only"
          empty={diagnostics.frameIntervalSeries.length < 2}
        >
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={diagnostics.frameIntervalSeries} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="frameIntervalFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES_COLOR} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={SERIES_COLOR} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t"
                  tick={ChartAxisX}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={40}
                  tickFormatter={(value: number) => formatElapsed(Math.max(0, (value - (diagnostics.frameIntervalSeries[0]?.t ?? value)) / 1000))}
                />
                <YAxis tick={ChartAxisY} tickLine={false} axisLine={false} width={42} />
                <Tooltip
                  content={<ChartTooltip formatter={(value) => `${value.toFixed(1)} ms`} />}
                  labelFormatter={(value) =>
                    elapsedFromLabel(value, diagnostics.frameIntervalSeries[0]?.t)
                  }
                  isAnimationActive={false}
                />
                <ReferenceLine
                  y={16.7}
                  stroke="rgba(251, 191, 36, 0.65)"
                  strokeDasharray="4 3"
                  label={{ value: "16.7 ms", fill: "rgba(251, 191, 36, 0.75)", fontSize: 10, position: "insideTopRight" }}
                />
                {diagnostics.displayIntervalMs != null && (
                  <ReferenceLine
                    y={diagnostics.displayIntervalMs}
                    stroke="rgba(52, 211, 153, 0.65)"
                    strokeDasharray="4 3"
                    label={{
                      value: `${diagnostics.displayIntervalMs} ms`,
                      fill: "rgba(52, 211, 153, 0.75)",
                      fontSize: 10,
                      position: "insideTopLeft",
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="intervalMs"
                  name="Frame interval"
                  stroke={SERIES_COLOR}
                  strokeWidth={1.5}
                  fill="url(#frameIntervalFill)"
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="JS heap over time"
          subtitle={diagnostics.capabilities.jsHeap ? "Throttled to ~10 Hz · capture only" : "Unavailable in this engine"}
          empty={diagnostics.memorySeries.length < 2}
        >
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={diagnostics.memorySeries} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t"
                  tick={ChartAxisX}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={40}
                  tickFormatter={(value: number) => formatElapsed(Math.max(0, (value - (diagnostics.memorySeries[0]?.t ?? value)) / 1000))}
                />
                <YAxis
                  tick={ChartAxisY}
                  tickLine={false}
                  axisLine={false}
                  width={46}
                  tickFormatter={(value: number) => formatBytes(value)}
                />
                <Tooltip
                  content={<ChartTooltip formatter={(value) => formatBytes(value)} />}
                  labelFormatter={(value) => elapsedFromLabel(value, diagnostics.memorySeries[0]?.t)}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="bytes"
                  name="JS heap"
                  stroke={SERIES_COLOR_SECONDARY}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Frame-interval histogram */}
      <ChartCard
        title="Frame-interval histogram"
        subtitle="1 ms buckets · 0–255 ms · log scale"
        empty={diagnostics.frameCount === 0}
      >
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogramRows.rows} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bucket" tick={ChartAxisX} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis
                tick={ChartAxisY}
                tickLine={false}
                axisLine={false}
                width={44}
                scale="log"
                domain={[1, Math.max(2, histogramRows.maxCount)]}
                tickFormatter={(value: number) => (value >= 1 ? String(Math.round(value)) : "")}
              />
              <Tooltip
                content={<ChartTooltip formatter={(value) => value.toLocaleString()} />}
                isAnimationActive={false}
              />
              <Bar
                dataKey="count"
                name="Frames"
                fill={SERIES_COLOR}
                fillOpacity={0.75}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-text-subtle">
          Each bucket counts frames with an interval of that many milliseconds. The log scale keeps the long
          jank tail visible next to the 16.7 ms cadence peak.
        </p>
      </ChartCard>

      {/* Per-operation analysis */}
      <section className="rounded-xl border border-white/10 bg-black/15 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-text">Operation timings</h2>
            <p className="text-xs text-text-subtle">
              {selectedCategoryTotals
                ? `${selectedCategoryTotals.operations} operations · ${selectedCategoryTotals.samples.toLocaleString()} samples · worst p95 ${selectedCategoryTotals.p95Max.toFixed(1)} ms`
                : "No operations captured in this category yet"}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_ORDER.map((category) => {
              const count = categoryCounts.get(category) ?? 0;
              const active = selectedCategory === category;
              return (
                <button
                  key={category}
                  className={`settings-btn px-2.5 py-1.5 text-xs ${
                    active ? "settings-btn-primary" : "settings-btn-secondary"
                  }`}
                  onClick={() => setSelectedCategory(category)}
                >
                  {CATEGORY_LABELS[category]}
                  {count > 0 && (
                    <span className={`ml-1 ${active ? "text-white/80" : "text-text-subtle"}`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {selectedCategoryTotals ? (
          <>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={visibleOperations
                    .slice(0, 12)
                    .map(([name, summary]) => ({
                      name,
                      "p50 ms": summary.p50Ms,
                      "p95 ms": summary.p95Ms,
                      "max ms": summary.maximumMs,
                    }))}
                  margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
                  layout="vertical"
                >
                  <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={ChartAxisX} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={({ x, y, payload }) => (
                      <text x={Number(x) - 8} y={y} dy={4} textAnchor="end" fill={AXIS_COLOR} fontSize={10}>
                        {String(payload.value).length > 28
                          ? `${String(payload.value).slice(0, 27)}…`
                          : String(payload.value)}
                      </text>
                    )}
                    tickLine={false}
                    axisLine={false}
                    width={190}
                  />
                  <Tooltip content={<ChartTooltip formatter={(value) => `${value.toFixed(1)} ms`} />} isAnimationActive={false} />
                  <Bar dataKey="p50 ms" fill="var(--color-primary)" fillOpacity={0.55} isAnimationActive={false} />
                  <Bar dataKey="p95 ms" fill="var(--color-primary)" isAnimationActive={false} />
                  <Bar dataKey="max ms" fill="rgba(251, 191, 36, 0.8)" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
              <div className="grid grid-cols-[minmax(0,1fr)_56px_56px_56px_56px_56px] gap-3 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-wider text-text-subtle">
                <button
                  className="text-left"
                  onClick={() => {
                    if (sortKey === "name") setSortDescending((value) => !value);
                    else {
                      setSortKey("name");
                      setSortDescending(true);
                    }
                  }}
                >
                  Operation{sortKey === "name" ? (sortDescending ? " ↓" : " ↑") : ""}
                </button>
                {(["count", "averageMs", "p50Ms", "p95Ms", "maximumMs"] as const).map((key) => (
                  <button
                    key={key}
                    className={`text-right ${sortKey === key ? "text-text" : ""}`}
                    onClick={() => {
                      if (sortKey === key) setSortDescending((value) => !value);
                      else {
                        setSortKey(key);
                        setSortDescending(true);
                      }
                    }}
                  >
                    {key === "count" ? "Count" : key === "averageMs" ? "Avg" : key === "p50Ms" ? "P50" : key === "p95Ms" ? "P95" : "Max"}
                    {sortKey === key ? (sortDescending ? " ↓" : " ↑") : ""}
                  </button>
                ))}
              </div>
              <div className="max-h-64 overflow-y-auto custom-scrollbar">
                {visibleOperations.map(([name, summary]) => (
                  <div
                    key={name}
                    className="grid grid-cols-[minmax(0,1fr)_56px_56px_56px_56px_56px] gap-3 border-t border-white/5 px-3 py-2 text-xs text-text-muted"
                  >
                    <span className="truncate font-mono text-text">
                      {name}
                    </span>
                    <span className="text-right">{summary.count}</span>
                    <span className="text-right">{summary.averageMs} ms</span>
                    <span className="text-right">{summary.p50Ms} ms</span>
                    <span className="text-right">{summary.p95Ms} ms</span>
                    <span className="text-right">{summary.maximumMs} ms</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs text-text-subtle">
            Start a capture, then navigate, search, scroll, and open image-heavy screens.
          </div>
        )}
      </section>

      {/* Synthetic data generator — Performance Lab only */}
      {IS_PERFORMANCE_BUILD && (
        <section className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400">
              <FlaskConical size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="settings-card-header mb-1 p-0">Synthetic Data Generator</div>
              <p className="text-sm text-text-muted">
                The Performance Lab starts empty on purpose. Generate a deterministic synthetic library
                (entries, covers, profiles, collections, awards, backlog) so measurements reflect a
                real-sized collection. This writes only to the isolated Performance Lab data directory.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  className="settings-btn settings-btn-primary"
                  disabled={busy != null}
                  onClick={() => void handleGenerateFixture("small")}
                >
                  {busy === "fixture-small" ? <Loader2 size={14} className="spin" /> : <FlaskConical size={14} />}
                  Generate 1,000 entries
                </button>
                <button
                  className="settings-btn settings-btn-secondary"
                  disabled={busy != null}
                  onClick={() => void handleGenerateFixture("large")}
                >
                  {busy === "fixture-large" ? <Loader2 size={14} className="spin" /> : <FlaskConical size={14} />}
                  Generate 10,000 entries
                </button>
              </div>
              {fixtureProgress && (
                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-xs text-text-muted">
                    <span>{fixtureProgress.message}</span>
                    <span>
                      {fixtureProgress.completed.toLocaleString()} / {fixtureProgress.total.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-orange-400 transition-[width] duration-200"
                      style={{
                        width:
                          fixtureProgress.total > 0
                            ? `${Math.min(100, (fixtureProgress.completed / fixtureProgress.total) * 100)}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
              )}
              {fixtureResult && (
                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric label="Entries" value={fixtureResult.entries.toLocaleString()} />
                  <Metric label="Distinct covers" value={fixtureResult.distinctCovers.toLocaleString()} />
                  <Metric label="Image files" value={fixtureResult.localImageFiles.toLocaleString()} />
                  <Metric label="Generated in" value={`${(fixtureResult.elapsedMs / 1000).toFixed(1)} s`} />
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Derivative image cache operations */}
      <section className="rounded-xl border border-white/10 bg-black/15 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
            <DatabaseZap size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="settings-card-header mb-1 p-0">Derivative Image Cache</div>
            <p className="text-sm text-text-muted">
              Versioned high-quality derivatives are served directly by the native image service. Originals
              remain untouched and are not counted here. The disk-size limit lives in Settings → Data.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Disk usage" value={formatBytes(imageStatus?.diskBytes ?? null)} />
          <Metric label="Disk entries" value={imageStatus?.diskEntries ?? "—"} />
          <Metric label="Memory usage" value={formatBytes(imageStatus?.memoryBytes ?? null)} />
          <Metric label="Memory entries" value={imageStatus?.memoryEntries ?? "—"} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            className="settings-btn settings-btn-secondary"
            disabled={busy != null}
            onClick={() => void run("refresh-cache", async () => { await refreshImageServiceStatus(); })}
          >
            {busy === "refresh-cache" ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
          <button
            className="settings-btn settings-btn-secondary"
            disabled={busy != null}
            onClick={() =>
              void run("rebuild-cache", async () => {
                clearImagePrewarmMarkers();
                const paths = await dbService.getAllReferencedCoverPaths();
                let failed = 0;
                for (let offset = 0; offset < paths.length; offset += 200) {
                  const batch = paths.slice(offset, offset + 200);
                  const result = await prewarmImageCache(
                    batch.flatMap((imagePath) => [
                      { imagePath, variant: "small" as const },
                      { imagePath, variant: "card" as const },
                    ]),
                  );
                  failed += result.failed;
                }
                await refreshImageServiceStatus();
                setMessage(
                  failed === 0
                    ? `Prepared small and card derivatives for ${paths.length} local covers.`
                    : `Derivative rebuild completed with ${failed} unavailable or corrupt source variants.`,
                );
              })
            }
          >
            {busy === "rebuild-cache" ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            Rebuild derivatives
          </button>
          <button
            className="settings-btn settings-btn-danger"
            disabled={busy != null}
            onClick={() =>
              void run("clear-cache", async () => {
                await clearImageServiceCache();
                clearImagePrewarmMarkers();
                setMessage("Derivative cache cleared. Originals were not changed.");
              })
            }
          >
            {busy === "clear-cache" ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
            Clear derivatives
          </button>
        </div>
      </section>

      <p className="flex items-center gap-2 pb-2 text-xs text-text-subtle">
        <Activity size={13} />
        All measurements are local to this machine and session. The sanitized report contains no titles, notes,
        descriptions, or filesystem paths.
      </p>
    </div>
  );
}
