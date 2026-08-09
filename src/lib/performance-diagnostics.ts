export type PerformanceCategory =
  | 'launch'
  | 'route'
  | 'query'
  | 'mutation'
  | 'search'
  | 'stats'
  | 'image'
  | 'react'
  | 'long-task'
  | 'interaction';

export interface PerformanceSample {
  category: PerformanceCategory;
  name: string;
  durationMs: number;
  timestamp: number;
  /** Monotonic record order. Date.now() ties too coarsely to sort a report by. */
  sequence: number;
  detail?: Record<string, number | string | boolean | null>;
}

export interface PerformanceSummary {
  count: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  maximumMs: number;
}

export interface PerformanceCapabilities {
  /** Long Tasks API. Absent in WebKit, so `longTaskCount` is unmeasurable there. */
  longTasks: boolean;
  /** Event Timing API, the portable stand-in for interaction stalls. */
  eventTiming: boolean;
  /** Paint Timing API, the only first-paint signal available to the frontend. */
  paintTiming: boolean;
  /** `performance.memory`. Chromium-only, so heap size is unmeasurable elsewhere. */
  jsHeap: boolean;
}

export interface PerformanceDiagnosticsSnapshot {
  capturing: boolean;
  startedAt: string | null;
  sampleCount: number;
  /**
   * Samples evicted per category once its retention cap filled. Any non-zero
   * entry means that category's summary covers a recent window rather than the
   * whole session, while the frame counters always cover the whole session.
   */
  droppedSamples: Record<string, number>;
  /** `null` when the Long Tasks API is unavailable — never 0, which reads as a pass. */
  longTaskCount: number | null;
  /** rAF-derived stalls over 50 ms. Available in every engine. */
  longFrameCount: number;
  frameCount: number;
  /** Rolling per-frame interval series (~10 Hz while capturing), for live charts. */
  frameIntervalSeries: { t: number; intervalMs: number }[];
  /** Rolling JS-heap series (~10 Hz while capturing), when `performance.memory` exists. */
  memorySeries: { t: number; bytes: number }[];
  /** 1 ms buckets of every recorded frame interval, 0–255 ms; index is the interval. */
  frameHistogramBuckets: number[];
  /** Against the fixed 16.7 ms release gate. Comparable across machines. */
  framesWithinBudgetPercent: number | null;
  /**
   * Against the measured present interval, which catches a 120 Hz panel that a
   * fixed 16.7 ms budget would flatter. Adaptive-refresh displays (ProMotion)
   * step down to 60 Hz on static content, so idle stretches depress this number
   * without anything having janked — read it next to `frameIntervalP95Ms`.
   */
  framesWithinDisplayIntervalPercent: number | null;
  /** Interpretation-free frame pacing: the 95th-percentile rAF interval. */
  frameIntervalP95Ms: number | null;
  displayIntervalMs: number | null;
  displayHz: number | null;
  /** rAF gaps discarded as compositor parking (occlusion, blur) rather than jank. */
  ignoredFrameGapCount: number;
  memoryBytes: number | null;
  capabilities: PerformanceCapabilities;
  summaries: Record<string, PerformanceSummary>;
}

type Listener = () => void;

interface MemoryPerformance extends Performance {
  memory?: { usedJSHeapSize?: number };
}

interface EventTimingObserverInit extends PerformanceObserverInit {
  durationThreshold?: number;
}

/**
 * Retention is per category so a high-volume stream cannot evict a sparse one.
 * A single shared cap let image samples silently push out launch, route, and
 * query measurements, which then read as "never happened" in a report.
 */
const CATEGORY_SAMPLE_LIMITS: Record<PerformanceCategory, number> = {
  launch: 50,
  route: 400,
  query: 800,
  mutation: 400,
  search: 400,
  stats: 400,
  image: 2_000,
  react: 1_500,
  'long-task': 500,
  interaction: 500,
};

/** The release gate in the 4.0 plan is expressed as a fixed 16.7 ms budget. */
const FIXED_FRAME_BUDGET_MS = 16.7;
/** 1 ms buckets match the engine timer resolution, so p95 loses nothing. */
const FRAME_HISTOGRAM_BUCKETS = 256;
const FRAME_CALIBRATION_SAMPLES = 120;
const MINIMUM_FRAME_CALIBRATION_SAMPLES = 20;
const MINIMUM_DISPLAY_INTERVAL_MS = 6;
const MAXIMUM_DISPLAY_INTERVAL_MS = 34;
/** Above this an interval is compositor parking, not a frame the user waited on. */
const PARKED_COMPOSITOR_MS = 1_000;
const LONG_FRAME_MS = 50;
const INTERACTION_THRESHOLD_MS = 40;
/** Rolling series length for live charts. 300 points at ~10 Hz is a 30 s window. */
const SERIES_MAX_POINTS = 300;
/** Push one series point per N recorded frames — ~10 Hz at a 60 Hz display. */
const SERIES_FRAME_STRIDE = 6;

const listeners = new Set<Listener>();
const buckets = new Map<PerformanceCategory, PerformanceSample[]>();
const droppedByCategory = new Map<PerformanceCategory, number>();
let sequence = 0;
let capturing = false;
let startedAt: string | null = null;
let frameRequest: number | null = null;
let previousFrameAt = 0;
let frameCount = 0;
let onBudgetFrameCount = 0;
let onDisplayIntervalFrameCount = 0;
let longFrameCount = 0;
let ignoredFrameGapCount = 0;
let frameIntervals: number[] = [];
let frameHistogram = new Uint32Array(FRAME_HISTOGRAM_BUCKETS);
let frameIntervalSeries: { t: number; intervalMs: number }[] = [];
let memorySeries: { t: number; bytes: number }[] = [];
let framesSinceSeriesSample = 0;
let displayIntervalMs: number | null = null;
let longTaskObserver: PerformanceObserver | null = null;
let interactionObserver: PerformanceObserver | null = null;
let paintObserver: PerformanceObserver | null = null;
let snapshotVersion = 0;
let cachedSnapshotVersion = -1;
let cachedSnapshot: PerformanceDiagnosticsSnapshot | null = null;

/**
 * Frame counters advance without any sample being recorded, so the snapshot
 * cache needs its own invalidation hook. Without it a capture that is only
 * accumulating frames keeps serving a stale snapshot to the panel and the report.
 */
function invalidateSnapshot(): void {
  snapshotVersion += 1;
}

function emit(): void {
  invalidateSnapshot();
  // Defer notifications so a sample recorded during a React commit (Profiler
  // onRender) can never synchronously re-enter React through a store listener.
  // The diagnostics panel polls its snapshot instead of subscribing, so this
  // is defense-in-depth against the Profiler -> panel -> commit loop.
  queueMicrotask(() => {
    for (const listener of listeners) listener();
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentile(sorted: number[], portion: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * portion) - 1);
  return sorted[Math.max(0, index)];
}

function summarize(values: number[]): PerformanceSummary {
  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    averageMs: round(sorted.length > 0 ? total / sorted.length : 0),
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    maximumMs: round(sorted.length > 0 ? sorted[sorted.length - 1] : 0),
  };
}

function safeName(value: string): string {
  // Diagnostics labels are developer-defined operation names. Keep them short
  // and strip path-like fragments so reports cannot accidentally carry data.
  return value.replace(/[\\/]/gu, ':').replace(/\s+/gu, ' ').slice(0, 80);
}

function supportsEntryType(type: string): boolean {
  if (typeof PerformanceObserver === 'undefined') return false;
  return (PerformanceObserver.supportedEntryTypes ?? []).includes(type);
}

function allSamples(): PerformanceSample[] {
  const merged: PerformanceSample[] = [];
  for (const bucket of buckets.values()) merged.push(...bucket);
  merged.sort((left, right) => left.sequence - right.sequence);
  return merged;
}

export function recordPerformanceSample(
  category: PerformanceCategory,
  name: string,
  durationMs: number,
  detail?: PerformanceSample['detail'],
): void {
  if (!capturing && category !== 'launch') return;
  if (!Number.isFinite(durationMs) || durationMs < 0) return;

  const bucket = buckets.get(category) ?? [];
  if (bucket.length === 0) buckets.set(category, bucket);
  sequence += 1;
  bucket.push({
    category,
    name: safeName(name),
    durationMs: round(durationMs),
    timestamp: Date.now(),
    sequence,
    detail,
  });

  const limit = CATEGORY_SAMPLE_LIMITS[category];
  if (bucket.length > limit) {
    const excess = bucket.length - limit;
    bucket.splice(0, excess);
    droppedByCategory.set(category, (droppedByCategory.get(category) ?? 0) + excess);
  }
  emit();
}

export function beginPerformanceSpan(
  category: PerformanceCategory,
  name: string,
  detail?: PerformanceSample['detail'],
): (additionalDetail?: PerformanceSample['detail']) => number {
  const start = performance.now();
  return (additionalDetail) => {
    const duration = performance.now() - start;
    recordPerformanceSample(category, name, duration, { ...detail, ...additionalDetail });
    return duration;
  };
}

export function recordReactCommit(
  id: string,
  phase: 'mount' | 'update' | 'nested-update',
  actualDuration: number,
): void {
  recordPerformanceSample('react', `${id}:${phase}`, actualDuration);
}

export function recordRouteCommit(routeKey: string, startedAt?: number): void {
  // A commit with no navigation start — initial mount, or a programmatic
  // navigate() that never passed through the sidebar intent handler — has no
  // measurable click-to-content duration. Recording 0 would silently pull down
  // every percentile for that route.
  if (startedAt == null) return;
  const duration = Math.max(0, performance.now() - startedAt);
  recordPerformanceSample('route', routeKey.replace(/\d+/gu, ':id'), duration);
}

/**
 * Derive the display's present interval from observed rAF deltas. Jank only ever
 * lengthens an interval, so a low percentile recovers the native cadence — and a
 * 120 Hz panel gets an 8.3 ms budget instead of being flattered by a hardcoded
 * 16.7 ms one.
 */
function calibrateDisplayInterval(): void {
  if (displayIntervalMs != null || frameIntervals.length === 0) return;
  const sorted = [...frameIntervals].sort((left, right) => left - right);
  const estimate = percentile(sorted, 0.05);
  displayIntervalMs = Math.min(
    MAXIMUM_DISPLAY_INTERVAL_MS,
    Math.max(MINIMUM_DISPLAY_INTERVAL_MS, estimate || FIXED_FRAME_BUDGET_MS),
  );
  // Frames observed while calibrating still count; judge them retroactively so
  // this counter describes the same set of frames as frameCount.
  for (const interval of frameIntervals) {
    if (interval <= displayIntervalMs + 1) onDisplayIntervalFrameCount += 1;
  }
  frameIntervals = [];
}

function frameIntervalPercentile(portion: number): number | null {
  let total = 0;
  for (const count of frameHistogram) total += count;
  if (total === 0) return null;
  const target = Math.ceil(total * portion);
  let seen = 0;
  for (let bucket = 0; bucket < frameHistogram.length; bucket += 1) {
    seen += frameHistogram[bucket];
    if (seen >= target) return bucket;
  }
  return frameHistogram.length - 1;
}

function frameTick(now: number): void {
  if (!capturing) return;
  if (previousFrameAt > 0) {
    const elapsed = now - previousFrameAt;
    if (elapsed > PARKED_COMPOSITOR_MS) {
      // rAF stops while the window is occluded or blurred (see useAnimationPause).
      // Counting the resume delta would report a multi-second stall nobody saw.
      ignoredFrameGapCount += 1;
    } else {
      frameCount += 1;
      frameHistogram[Math.min(FRAME_HISTOGRAM_BUCKETS - 1, Math.round(elapsed))] += 1;
      if (elapsed >= LONG_FRAME_MS) longFrameCount += 1;
      if (elapsed <= FIXED_FRAME_BUDGET_MS + 1) onBudgetFrameCount += 1;
      if (displayIntervalMs == null) {
        frameIntervals.push(elapsed);
        if (frameIntervals.length >= FRAME_CALIBRATION_SAMPLES) calibrateDisplayInterval();
      } else if (elapsed <= displayIntervalMs + 1) {
        onDisplayIntervalFrameCount += 1;
      }
      framesSinceSeriesSample += 1;
      if (framesSinceSeriesSample >= SERIES_FRAME_STRIDE) {
        framesSinceSeriesSample = 0;
        frameIntervalSeries.push({ t: now, intervalMs: round(elapsed) });
        if (frameIntervalSeries.length > SERIES_MAX_POINTS) {
          frameIntervalSeries.splice(0, frameIntervalSeries.length - SERIES_MAX_POINTS);
        }
        const memory = (performance as MemoryPerformance).memory?.usedJSHeapSize;
        if (typeof memory === 'number') {
          memorySeries.push({ t: now, bytes: memory });
          if (memorySeries.length > SERIES_MAX_POINTS) {
            memorySeries.splice(0, memorySeries.length - SERIES_MAX_POINTS);
          }
        }
      }
    }
  }
  previousFrameAt = now;
  // Listeners are not notified per frame — the panel polls — but the cached
  // snapshot must stop being served as soon as the counters move.
  invalidateSnapshot();
  frameRequest = requestAnimationFrame(frameTick);
}

function installLongTaskObserver(): void {
  if (longTaskObserver || !supportsEntryType('longtask')) return;
  longTaskObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      recordPerformanceSample('long-task', 'main-thread', entry.duration);
    }
  });
  longTaskObserver.observe({ entryTypes: ['longtask'] });
}

/**
 * Event Timing stands in for Long Tasks where the latter is unavailable. It
 * measures the interaction the user actually waited on, which is what the 50 ms
 * budget is about.
 */
function installInteractionObserver(): void {
  if (interactionObserver || !supportsEntryType('event')) return;
  interactionObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      recordPerformanceSample('interaction', entry.name, entry.duration);
    }
  });
  const init: EventTimingObserverInit = {
    type: 'event',
    buffered: true,
    durationThreshold: INTERACTION_THRESHOLD_MS,
  };
  interactionObserver.observe(init);
}

/**
 * Installed at module load rather than on capture start: first paint happens
 * once, long before anyone opens the diagnostics panel. `buffered` replays it.
 */
function installPaintObserver(): void {
  if (paintObserver || !supportsEntryType('paint')) return;
  paintObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      recordPerformanceSample('launch', entry.name, entry.startTime);
    }
  });
  paintObserver.observe({ type: 'paint', buffered: true });
}

/**
 * Launch samples are recorded once per process, before any capture session
 * exists, and can never be reproduced without relaunching. Everything else is
 * reproducible by repeating the interaction, so only launch survives a reset.
 */
function resetSamples(): void {
  const launch = buckets.get('launch');
  const launchDropped = droppedByCategory.get('launch');
  buckets.clear();
  droppedByCategory.clear();
  if (launch && launch.length > 0) buckets.set('launch', launch);
  if (launchDropped) droppedByCategory.set('launch', launchDropped);
}

function resetFrameState(): void {
  frameCount = 0;
  onBudgetFrameCount = 0;
  onDisplayIntervalFrameCount = 0;
  longFrameCount = 0;
  ignoredFrameGapCount = 0;
  previousFrameAt = 0;
  frameIntervals = [];
  frameHistogram = new Uint32Array(FRAME_HISTOGRAM_BUCKETS);
  frameIntervalSeries = [];
  memorySeries = [];
  framesSinceSeriesSample = 0;
  displayIntervalMs = null;
}

export function startPerformanceCapture(): void {
  resetSamples();
  resetFrameState();
  capturing = true;
  startedAt = new Date().toISOString();
  installLongTaskObserver();
  installInteractionObserver();
  if (frameRequest == null) frameRequest = requestAnimationFrame(frameTick);
  emit();
}

export function stopPerformanceCapture(): void {
  capturing = false;
  if (frameRequest != null) cancelAnimationFrame(frameRequest);
  frameRequest = null;
  previousFrameAt = 0;
  longTaskObserver?.disconnect();
  longTaskObserver = null;
  interactionObserver?.disconnect();
  interactionObserver = null;
  emit();
}

export function clearPerformanceCapture(): void {
  resetSamples();
  resetFrameState();
  startedAt = capturing ? new Date().toISOString() : null;
  emit();
}

export function getPerformanceDiagnosticsSnapshot(): PerformanceDiagnosticsSnapshot {
  if (cachedSnapshot && cachedSnapshotVersion === snapshotVersion) return cachedSnapshot;

  // A session shorter than the calibration window still deserves a budget.
  if (displayIntervalMs == null && frameIntervals.length >= MINIMUM_FRAME_CALIBRATION_SAMPLES) {
    calibrateDisplayInterval();
  }

  const grouped = new Map<string, number[]>();
  let sampleCount = 0;
  for (const bucket of buckets.values()) {
    for (const sample of bucket) {
      sampleCount += 1;
      const key = `${sample.category}:${sample.name}`;
      const values = grouped.get(key) ?? [];
      values.push(sample.durationMs);
      grouped.set(key, values);
    }
  }

  const summaries: Record<string, PerformanceSummary> = {};
  for (const [key, values] of grouped) summaries[key] = summarize(values);

  const droppedSamples: Record<string, number> = {};
  for (const [category, count] of droppedByCategory) {
    if (count > 0) droppedSamples[category] = count;
  }

  const longTasksSupported = supportsEntryType('longtask');
  const longTaskCount = longTasksSupported ? (buckets.get('long-task')?.length ?? 0) : null;
  const memory = (performance as MemoryPerformance).memory?.usedJSHeapSize;

  cachedSnapshot = {
    capturing,
    startedAt,
    sampleCount,
    droppedSamples,
    longTaskCount,
    longFrameCount,
    frameCount,
    frameIntervalSeries: [...frameIntervalSeries],
    memorySeries: [...memorySeries],
    frameHistogramBuckets: [...frameHistogram],
    framesWithinBudgetPercent:
      frameCount > 0 ? round((onBudgetFrameCount / frameCount) * 100) : null,
    framesWithinDisplayIntervalPercent:
      frameCount > 0 && displayIntervalMs != null
        ? round((onDisplayIntervalFrameCount / frameCount) * 100)
        : null,
    frameIntervalP95Ms: frameIntervalPercentile(0.95),
    displayIntervalMs: displayIntervalMs == null ? null : round(displayIntervalMs),
    displayHz: displayIntervalMs == null ? null : Math.round(1_000 / displayIntervalMs),
    ignoredFrameGapCount,
    memoryBytes: typeof memory === 'number' ? memory : null,
    capabilities: {
      longTasks: longTasksSupported,
      eventTiming: supportsEntryType('event'),
      paintTiming: supportsEntryType('paint'),
      jsHeap: typeof memory === 'number',
    },
    summaries,
  };
  cachedSnapshotVersion = snapshotVersion;
  return cachedSnapshot;
}

export function subscribePerformanceDiagnostics(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function buildSanitizedPerformanceReport(extra: Record<string, unknown> = {}): string {
  const snapshot = getPerformanceDiagnosticsSnapshot();
  const recentSamples = allSamples()
    .slice(-250)
    .map(({ category, name, durationMs, timestamp, detail }) => ({
      category,
      name,
      durationMs,
      timestamp,
      detail,
    }));
  return JSON.stringify({
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    mode: import.meta.env.MODE,
    // Timing resolution is engine-clamped (~1 ms in WebKit), so sub-millisecond
    // percentiles read as 0 and mean "below the measurement floor".
    timerResolutionNote: 'durations are clamped to the engine timer resolution',
    diagnostics: snapshot,
    recentSamples,
    ...extra,
  }, null, 2);
}

// Capture the earliest useful frontend launch samples even when a diagnostics
// session has not been started yet. These contain timing only.
if (typeof window !== 'undefined') {
  installPaintObserver();
  window.addEventListener('load', () => {
    recordPerformanceSample('launch', 'window-load', performance.now());
  }, { once: true });
}
