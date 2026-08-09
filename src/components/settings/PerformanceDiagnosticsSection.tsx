import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Activity, Copy, DatabaseZap, FlaskConical, Gauge, Loader2, Play, RefreshCw, Square, Trash2 } from 'lucide-react';
import {
  clearImageServiceCache,
  clearImagePrewarmMarkers,
  getImageCacheLimitGiB,
  refreshImageServiceStatus,
  prewarmImageCache,
  setImageCacheLimitGiB,
  useImageServiceStatus,
} from '../../lib/image-service';
import { dbService } from '../../lib/db';
import { IS_PERFORMANCE_BUILD } from '../../lib/performance-mode';
import { requestMediaQueryInvalidation } from '../../lib/query-client';
import {
  buildSanitizedPerformanceReport,
  clearPerformanceCapture,
  getPerformanceDiagnosticsSnapshot,
  startPerformanceCapture,
  stopPerformanceCapture,
} from '../../lib/performance-diagnostics';

function formatBytes(value: number | null): string {
  if (value == null) return 'Unavailable';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = value / 1024;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(amount >= 100 ? 0 : 1)} ${units[unit]}`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-text-subtle">{label}</div>
      <div className="mt-1 text-lg font-semibold text-text">{value}</div>
    </div>
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

export default function PerformanceDiagnosticsSection() {
  const imageStatus = useImageServiceStatus();
  const [diagnostics, setDiagnostics] = useState(() => getPerformanceDiagnosticsSnapshot());
  const [cacheLimit, setCacheLimit] = useState<1 | 3 | 5>(() => getImageCacheLimitGiB());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
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
    void listen<FixtureProgressEvent>('performance-fixture-progress', (event) => {
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
    setMessage('');
    try {
      await operation();
    } catch (error) {
      console.error(`[Performance Diagnostics] ${key} failed:`, error);
      setMessage('The operation could not be completed. See the developer console for details.');
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    const report = buildSanitizedPerformanceReport({
      imageCache: imageStatus ? {
        recipeVersion: imageStatus.recipeVersion,
        generation: imageStatus.generation ?? null,
        memoryEntries: imageStatus.memoryEntries,
        memoryBytes: imageStatus.memoryBytes,
        diskEntries: imageStatus.diskEntries,
        diskBytes: imageStatus.diskBytes,
        diskLimitBytes: imageStatus.diskLimitBytes,
        stagedImports: imageStatus.stagedImports,
      } : null,
    });
    await navigator.clipboard.writeText(report);
    setMessage('Sanitized performance report copied. It contains no titles, notes, descriptions, or filesystem paths.');
  };

  const handleGenerateFixture = async (preset: 'small' | 'large') => {
    if (busy != null) return;
    setBusy(`fixture-${preset}`);
    setMessage('');
    setFixtureProgress(null);
    setFixtureResult(null);
    try {
      const db = await dbService.connect();
      const result = await invoke<FixtureResult>('generate_performance_fixture', {
        preset,
        databaseUrl: db.path,
      });
      setFixtureResult(result);
      // The generator writes directly to SQLite, so cached queries and the
      // prewarm marker must be refreshed for the new library to appear and
      // for derivatives to be prepared in the background.
      requestMediaQueryInvalidation();
      clearImagePrewarmMarkers();
      void dbService.getAllReferencedCoverPaths()
        .then(async (paths) => {
          for (let offset = 0; offset < paths.length; offset += 200) {
            const batch = paths.slice(offset, offset + 200);
            await prewarmImageCache(batch.flatMap((imagePath) => [
              { imagePath, variant: 'small' as const },
              { imagePath, variant: 'card' as const },
            ]));
          }
        })
        .catch((error) => {
          console.warn('[Performance Lab] Background derivative prewarm failed:', error);
        });
      setMessage(
        `Synthetic ${preset} corpus ready: ${result.entries.toLocaleString()} entries, ` +
        `${result.distinctCovers.toLocaleString()} covers, ${result.localImageFiles.toLocaleString()} image files. ` +
        `Cached queries were invalidated; revisit a page to see the library.`,
      );
    } catch (error) {
      console.error('[Performance Lab] Fixture generation failed:', error);
      setMessage(`Fixture generation failed: ${String(error)}`);
    } finally {
      setBusy(null);
      setFixtureProgress(null);
    }
  };

  const summaries = Object.entries(diagnostics.summaries)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 30);
  const droppedSamples = Object.entries(diagnostics.droppedSamples);

  return (
    <div className="settings-section-enter space-y-4" key="performance">
      <section className="settings-card">
        <div className="settings-row" style={{ alignItems: 'flex-start', gap: 16 }}>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Gauge size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="settings-card-header">Performance Diagnostics</div>
            <div className="settings-row-description">
              Local-only timing, frame, React commit, and image-paint measurements. Reports are sanitized and never sent anywhere automatically.
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
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
            </div>
          </div>
        </div>

        {message && <div className="mt-4 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-text-muted">{message}</div>}

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Samples" value={diagnostics.sampleCount} />
          <Metric label="Frames sampled" value={diagnostics.frameCount} />
          <Metric
            label="Frames ≤16.7ms"
            value={diagnostics.framesWithinBudgetPercent == null ? '—' : `${diagnostics.framesWithinBudgetPercent}%`}
          />
          <Metric
            label={diagnostics.displayIntervalMs == null ? 'Frames ≤display' : `Frames ≤${diagnostics.displayIntervalMs}ms`}
            value={
              diagnostics.framesWithinDisplayIntervalPercent == null
                ? 'Calibrating'
                : `${diagnostics.framesWithinDisplayIntervalPercent}%`
            }
          />
          <Metric
            label="Frame interval p95"
            value={diagnostics.frameIntervalP95Ms == null ? '—' : `${diagnostics.frameIntervalP95Ms}ms`}
          />
          <Metric label="Long frames >50ms" value={diagnostics.longFrameCount} />
          <Metric
            label="Long tasks"
            value={diagnostics.longTaskCount == null ? 'Unavailable' : diagnostics.longTaskCount}
          />
          <Metric label="JS heap" value={formatBytes(diagnostics.memoryBytes)} />
        </div>

        <div className="mt-3 text-xs text-text-subtle">
          {diagnostics.displayHz == null
            ? 'Display cadence calibrates after ~120 frames.'
            : `Display measured at ${diagnostics.displayHz} Hz — on an adaptive-refresh panel, idle stretches lower the ≤${diagnostics.displayIntervalMs}ms figure without any jank, so read it against the p95 interval.`}
          {diagnostics.ignoredFrameGapCount > 0 &&
            ` ${diagnostics.ignoredFrameGapCount} paused-compositor gap${diagnostics.ignoredFrameGapCount === 1 ? '' : 's'} excluded.`}
          {!diagnostics.capabilities.longTasks &&
            ' This engine has no Long Tasks API — use long frames and interaction samples instead.'}
          {!diagnostics.capabilities.jsHeap && ' Heap size is unavailable in this engine.'}
        </div>

        {droppedSamples.length > 0 && (
          <div className="mt-2 text-xs text-amber-300/80">
            Retention cap reached: {droppedSamples.map(([category, count]) => `${category} (−${count})`).join(', ')}.
            Those summaries cover a recent window, not the whole session.
          </div>
        )}
      </section>

      {IS_PERFORMANCE_BUILD && (
        <section className="settings-card">
          <div className="settings-row" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400">
              <FlaskConical size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="settings-card-header">Synthetic Data Generator</div>
              <div className="settings-row-description">
                The Performance Lab starts empty on purpose. Generate a deterministic synthetic library
                (entries, covers, profiles, collections, awards, backlog) so measurements reflect a
                real-sized collection. This writes only to the isolated Performance Lab data directory.
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  className="settings-btn settings-btn-primary"
                  disabled={busy != null}
                  onClick={() => void handleGenerateFixture('small')}
                >
                  {busy === 'fixture-small' ? <Loader2 size={14} className="spin" /> : <FlaskConical size={14} />}
                  Generate 1,000 entries
                </button>
                <button
                  className="settings-btn settings-btn-secondary"
                  disabled={busy != null}
                  onClick={() => void handleGenerateFixture('large')}
                >
                  {busy === 'fixture-large' ? <Loader2 size={14} className="spin" /> : <FlaskConical size={14} />}
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
                        width: fixtureProgress.total > 0
                          ? `${Math.min(100, (fixtureProgress.completed / fixtureProgress.total) * 100)}%`
                          : '0%',
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

      <section className="settings-card">
        <div className="settings-row" style={{ alignItems: 'flex-start', gap: 16 }}>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
            <DatabaseZap size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="settings-card-header">Derivative Image Cache</div>
            <div className="settings-row-description">
              Versioned high-quality derivatives are served directly by the native image service. Originals remain untouched and are not counted here.
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Disk usage" value={formatBytes(imageStatus?.diskBytes ?? null)} />
          <Metric label="Disk entries" value={imageStatus?.diskEntries ?? '—'} />
          <Metric label="Memory usage" value={formatBytes(imageStatus?.memoryBytes ?? null)} />
          <Metric label="Memory entries" value={imageStatus?.memoryEntries ?? '—'} />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-text-muted">Disk limit</span>
          {([1, 3, 5] as const).map((limit) => (
            <button
              key={limit}
              className={`settings-btn ${cacheLimit === limit ? 'settings-btn-primary' : 'settings-btn-secondary'}`}
              disabled={busy != null}
              onClick={() => void run('cache-limit', async () => {
                setCacheLimit(limit);
                await setImageCacheLimitGiB(limit);
                setMessage(`Image cache limit set to ${limit} GB.`);
              })}
            >
              {limit} GB
            </button>
          ))}
          <button
            className="settings-btn settings-btn-secondary ml-auto"
            disabled={busy != null}
            onClick={() => void run('refresh-cache', async () => { await refreshImageServiceStatus(); })}
          >
            {busy === 'refresh-cache' ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
          <button
            className="settings-btn settings-btn-secondary"
            disabled={busy != null}
            onClick={() => void run('rebuild-cache', async () => {
              clearImagePrewarmMarkers();
              const paths = await dbService.getAllReferencedCoverPaths();
              let failed = 0;
              for (let offset = 0; offset < paths.length; offset += 200) {
                const batch = paths.slice(offset, offset + 200);
                const result = await prewarmImageCache(batch.flatMap((imagePath) => [
                  { imagePath, variant: 'small' as const },
                  { imagePath, variant: 'card' as const },
                ]));
                failed += result.failed;
              }
              await refreshImageServiceStatus();
              setMessage(failed === 0
                ? `Prepared small and card derivatives for ${paths.length} local covers.`
                : `Derivative rebuild completed with ${failed} unavailable or corrupt source variants.`);
            })}
          >
            {busy === 'rebuild-cache' ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            Rebuild derivatives
          </button>
          <button
            className="settings-btn settings-btn-danger"
            disabled={busy != null}
            onClick={() => void run('clear-cache', async () => {
              await clearImageServiceCache();
              clearImagePrewarmMarkers();
              setMessage('Derivative cache cleared. Originals were not changed.');
            })}
          >
            {busy === 'clear-cache' ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
            Clear derivatives
          </button>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-header flex items-center gap-2"><Activity size={17} /> Captured operations</div>
        {summaries.length === 0 ? (
          <div className="settings-row-description py-5 text-center">Start a capture, then navigate, search, scroll, and open image-heavy screens.</div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
            <div className="grid grid-cols-[minmax(0,1fr)_70px_70px_70px] gap-3 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-wider text-text-subtle">
              <span>Operation</span><span>Count</span><span>P50</span><span>P95</span>
            </div>
            {summaries.map(([name, summary]) => (
              <div key={name} className="grid grid-cols-[minmax(0,1fr)_70px_70px_70px] gap-3 border-t border-white/5 px-3 py-2 text-xs text-text-muted">
                <span className="truncate font-mono text-text">{name}</span>
                <span>{summary.count}</span>
                <span>{summary.p50Ms} ms</span>
                <span>{summary.p95Ms} ms</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
