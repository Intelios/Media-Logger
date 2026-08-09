import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LineChart as LineChartIcon, X } from "lucide-react";
import { profilesLogic, type ProfileSummary } from "../lib/profiles-logic";
import type { AvgHistoryPoint, MediaEntry } from "../lib/db";
import { getImageUrl, releaseImageUrl } from "../lib/utils";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";
import { formatShortDate } from "../lib/dates";

interface AvgHistoryModalProps {
  isOpen: boolean;
  profile: ProfileSummary | null;
  entries: MediaEntry[];
  onClose: () => void;
}

interface ChartRow {
  captured_at: string;            // YYYY-MM-DD (normalized)
  average_score: number | null;   // snapshot avg, or null on entry-only dates
  rated_count: number;
  total_count: number;
  source: string;
  markers: MarkerInfo[];
}

interface MarkerInfo {
  entryId: number;
  name: string;
  reviewScore: number;
  imageUrl: string | null;
}

// Above this entry count, markers (image squares + dotted guides) stay hidden
// until the user hovers the chart, so dense profiles don't clutter the line.
const DENSE_THRESHOLD = 25;

const MARKER_SIZE = 56;
const MARKER_STACK_OFFSET = 8;
const MAX_STACKED_MARKERS = 3;
const CHART_Y_AXIS_WIDTH = 28;
const CHART_RIGHT_MARGIN = 18;
const CHART_MARKER_TOP = 8;
const CHART_TOP_MARGIN = MARKER_SIZE + 24;

function AvgHistoryTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const hasSnap = row.average_score != null;
  return (
    <div className="glass-tooltip rounded-xl px-4 py-3 max-w-[240px]">
      <div className="mb-1 text-sm font-semibold text-text">{formatShortDate(row.captured_at)}</div>
      {hasSnap && (
        <>
          <p className="text-yellow-300 text-sm">
            Avg <span className="font-bold">{row.average_score!.toFixed(1)}</span>
          </p>
          <p className="text-text-muted text-xs">
            {row.rated_count} rated / {row.total_count} {row.total_count === 1 ? "entry" : "entries"}
          </p>
        </>
      )}
      {row.markers.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-primary/15 space-y-1">
          <p className="text-text-subtle text-[10px] uppercase tracking-wider">
            {row.markers.length === 1 ? "Entry logged" : `${row.markers.length} entries logged`}
          </p>
          {row.markers.map(m => (
            <p key={m.entryId} className="text-xs text-text truncate">
              <span className="text-text-muted">{m.name}</span>
              <span className="text-text-subtle"> · </span>
              <span className="text-amber-300 font-semibold">{m.reviewScore.toFixed(1)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function AvgHistoryModal({ isOpen, profile, entries, onClose }: AvgHistoryModalProps) {
  const [points, setPoints] = useState<AvgHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [imageMap, setImageMap] = useState<Record<number, string>>({});
  const [hovering, setHovering] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
  const chartEntries = useMemo(
    () => entries.filter((entry) => Boolean(entry.completion_date) && entry.review_score != null),
    [entries],
  );

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  // Re-run when the chart div actually mounts. On first open the data is still
  // loading so the chart div is absent (chartRef is null); we must retry once
  // loading flips to false with data, otherwise chartSize stays {0,0} and the
  // marker overlay (which depends on chartSize.width > 0) never renders.
  const chartReady = isOpen && !loading && points.length > 0;
  useEffect(() => {
    if (!chartReady) return;
    const el = chartRef.current;
    if (!el) return;

    const updateSize = () => {
      setChartSize({ width: el.clientWidth, height: el.clientHeight });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [chartReady]);

  useEffect(() => {
    if (!isOpen || !profile) return;
    let cancelled = false;
    setLoading(true);
    setImageMap({});
    profilesLogic.getAvgHistory(profile.type, profile.name).then((pts) => {
      if (cancelled) return;
      setPoints(pts);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isOpen, profile]);

  // Preload cover thumbnails for chart markers, releasing blob refs on cleanup.
  useEffect(() => {
    if (!isOpen || chartEntries.length === 0) return;
    let cancelled = false;
    const acquired: string[] = [];
    (async () => {
      const map: Record<number, string> = {};
      for (const e of chartEntries) {
        if (cancelled) return;
        if (!e.image_url) continue;
        const url = await getImageUrl(e.image_url, { variant: 'thumbnail' });
        if (cancelled) return;
        acquired.push(e.image_url);
        map[e.id] = url;
      }
      if (!cancelled) setImageMap(map);
    })();
    return () => {
      cancelled = true;
      acquired.forEach((path) => releaseImageUrl(path, 'thumbnail'));
    };
  }, [isOpen, chartEntries]);

  const chartData = useMemo<ChartRow[]>(() => {
    if (points.length === 0) return [];
    const snapshotByDate = new Map<string, AvgHistoryPoint>();
    for (const p of points) {
      const d = p.captured_at.slice(0, 10);
      // Keep the latest snapshot if multiple land on the same day.
      snapshotByDate.set(d, p);
    }
    const entriesByDate = new Map<string, MediaEntry[]>();
    for (const e of chartEntries) {
      const d = e.completion_date!;
      if (!entriesByDate.has(d)) entriesByDate.set(d, []);
      entriesByDate.get(d)!.push(e);
    }

    const allDates = new Set<string>([...snapshotByDate.keys(), ...entriesByDate.keys()]);
    return [...allDates].sort().map(date => {
      const snap = snapshotByDate.get(date);
      const dayEntries = entriesByDate.get(date) ?? [];
      const markers: MarkerInfo[] = dayEntries.map(e => ({
        entryId: e.id,
        name: e.name,
        reviewScore: e.review_score ?? 0,
        imageUrl: e.image_url,
      }));
      return {
        captured_at: date,
        average_score: snap?.average_score ?? null,
        rated_count: snap?.rated_count ?? 0,
        total_count: snap?.total_count ?? 0,
        source: snap?.source ?? "",
        markers,
      };
    });
  }, [points, chartEntries]);

  const markerRows = useMemo(
    () => chartData.filter(row => row.markers.length > 0),
    [chartData]
  );

  if (!isOpen || !profile) return null;

  const hasData = points.length > 0;
  const currentAvg = points.length > 0 ? points[points.length - 1].average_score : profile.average_score;
  const recentWindowSize = 5;
  const baselineEntries = chartEntries.length > recentWindowSize ? chartEntries.slice(0, -recentWindowSize) : [];
  const baselineAvg = baselineEntries.length > 0
    ? baselineEntries.reduce((sum, e) => sum + (e.review_score ?? 0), 0) / baselineEntries.length
    : null;
  const recentDelta = baselineAvg != null ? currentAvg - baselineAvg : null;
  const dense = chartEntries.length >= DENSE_THRESHOLD;
  const markerOpacity = !dense ? 0.9 : (hovering ? 0.9 : 0);
  const guideOpacity = !dense ? 0.15 : (hovering ? 0.25 : 0.06);
  const guideColor = `rgba(255,255,255,${guideOpacity})`;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-white/10 w-full max-w-4xl rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-5 border-b border-white/5 bg-gradient-to-r from-yellow-500/10 via-transparent to-transparent">
          <div className="p-2.5 bg-yellow-500/20 rounded-xl">
            <LineChartIcon size={20} className="text-yellow-400" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-white text-lg truncate">Average Rating History</h3>
            <p className="text-xs text-gray-400 truncate">
              {profile.name} · <span className="capitalize">{profile.type}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-6 mb-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Current</p>
              <p className="text-3xl font-bold text-white">{currentAvg.toFixed(1)}</p>
            </div>
            {recentDelta != null && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Last 5 Entries</p>
                <p className={`text-2xl font-bold ${recentDelta > 0 ? "text-emerald-400" : recentDelta < 0 ? "text-rose-400" : "text-gray-300"}`}>
                  {recentDelta > 0 ? "+" : ""}{recentDelta.toFixed(1)}
                </p>
              </div>
            )}
            {chartEntries.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Entries</p>
                <p className="text-2xl font-bold text-white">{chartEntries.length}</p>
              </div>
            )}
          </div>

          {loading ? (
            <div className="h-[300px] flex items-center justify-center">
              <p className="text-sm text-gray-400">Loading history…</p>
            </div>
          ) : hasData ? (
            <div
              ref={chartRef}
              className="relative h-[390px] w-full overflow-visible"
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
            >
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={chartData} margin={{ left: 0, right: 18, top: CHART_TOP_MARGIN, bottom: 0 }}>
                  <XAxis
                    dataKey="captured_at"
                    tickFormatter={(v: string) => formatShortDate(v).split(",")[0]}
                    tick={{ fill: "#9CA3AF", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={32}
                  />
                  <YAxis
                    domain={[0, 10]}
                    tick={{ fill: "#6B7280", fontSize: 12 }}
                    width={28}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<AvgHistoryTooltip />}
                    cursor={{ stroke: "rgba(255,255,255,0.08)" }}
                    wrapperStyle={{ zIndex: 50 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="average_score"
                    stroke="#facc15"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#facc15", strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#facc15", stroke: "#0f172a", strokeWidth: 2 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
              {markerRows.length > 0 && chartSize.width > 0 && (
                <div className="pointer-events-none absolute inset-0 z-10 overflow-visible">
                  {markerRows.map(row => {
                    const index = chartData.findIndex(point => point.captured_at === row.captured_at);
                    const plotLeft = CHART_Y_AXIS_WIDTH;
                    const plotRight = Math.max(plotLeft, chartSize.width - CHART_RIGHT_MARGIN);
                    const plotWidth = plotRight - plotLeft;
                    const x = chartData.length <= 1
                      ? plotLeft + plotWidth / 2
                      : plotLeft + (index / (chartData.length - 1)) * plotWidth;
                    const visibleMarkers = row.markers.slice(0, MAX_STACKED_MARKERS);
                    const extraCount = row.markers.length - visibleMarkers.length;
                    const lineTop = CHART_MARKER_TOP + MARKER_SIZE + 7;
                    const lineHeight = Math.max(0, chartSize.height - lineTop - 28);

                    return (
                      <div
                        key={`entry-overlay-${row.captured_at}`}
                        className="absolute top-0"
                        style={{ left: x }}
                      >
                        <div
                          className="absolute border-l"
                          style={{
                            top: lineTop,
                            height: lineHeight,
                            borderColor: guideColor,
                            borderLeftStyle: "dashed",
                          }}
                        />
                        <div style={{ opacity: markerOpacity }}>
                          {visibleMarkers.map((m, i) => {
                            const url = imageMap[m.entryId];
                            const shift = i * MARKER_STACK_OFFSET;
                            return (
                              <div
                                key={m.entryId}
                                className="absolute overflow-hidden rounded-xl bg-[#0a0a0c]/80 shadow-lg shadow-black/45 ring-1 ring-white/25"
                                style={{
                                  left: -MARKER_SIZE / 2 + shift,
                                  top: CHART_MARKER_TOP + shift,
                                  width: MARKER_SIZE,
                                  height: MARKER_SIZE,
                                }}
                              >
                                {url ? (
                                  <img
                                    src={url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    draggable={false}
                                  />
                                ) : (
                                  <div className="h-full w-full bg-white/10" />
                                )}
                              </div>
                            );
                          })}
                          {extraCount > 0 && (
                            <div
                              className="absolute flex h-5 min-w-5 items-center justify-center rounded-full border border-white/35 bg-gray-950/95 px-1 text-[10px] font-bold text-yellow-300 shadow-lg"
                              style={{
                                left: MARKER_SIZE / 2 + 8,
                                top: CHART_MARKER_TOP + 7,
                              }}
                            >
                              +{extraCount}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
              <p className="text-sm text-gray-400">No history yet — add or rate entries to start tracking.</p>
            </div>
          )}

          {hasData && chartEntries.length > 0 && (
            <div className="mt-3 flex items-center gap-4 text-[11px] text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-[3px] bg-gray-700 border border-white/30" />
                entry logged
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 border-t border-dashed border-white/30" />
                avg snapshot
              </span>
              {dense && (
                <span className="ml-auto text-gray-600">hover chart to reveal markers</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
