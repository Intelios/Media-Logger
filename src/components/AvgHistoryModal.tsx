import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  onClose: () => void;
}

interface ChartRow {
  captured_at: string;            // YYYY-MM-DD (normalized)
  average_score: number | null;   // snapshot avg, or null on entry-only dates
  rated_count: number;
  total_count: number;
  source: string;
  _markerY: number | null;        // interpolated avg at this date (entry rows only)
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

const MARKER_SIZE = 24;
const MARKER_GAP = 4;

function AvgHistoryTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const hasSnap = row.average_score != null;
  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/95 px-4 py-3 shadow-2xl backdrop-blur-xl max-w-[240px]">
      <div className="mb-1 text-sm font-semibold text-white">{formatShortDate(row.captured_at)}</div>
      {hasSnap && (
        <>
          <p className="text-yellow-300 text-sm">
            Avg <span className="font-bold">{row.average_score!.toFixed(1)}</span>
          </p>
          <p className="text-gray-400 text-xs">
            {row.rated_count} rated / {row.total_count} {row.total_count === 1 ? "entry" : "entries"}
          </p>
        </>
      )}
      {row.markers.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-white/10 space-y-1">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">
            {row.markers.length === 1 ? "Entry logged" : `${row.markers.length} entries logged`}
          </p>
          {row.markers.map(m => (
            <p key={m.entryId} className="text-xs text-gray-200 truncate">
              <span className="text-gray-400">{m.name}</span>
              <span className="text-gray-500"> · </span>
              <span className="text-amber-300 font-semibold">{m.reviewScore.toFixed(1)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function AvgHistoryModal({ isOpen, profile, onClose }: AvgHistoryModalProps) {
  const [points, setPoints] = useState<AvgHistoryPoint[]>([]);
  const [entries, setEntries] = useState<MediaEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [imageMap, setImageMap] = useState<Record<number, string>>({});
  const [hovering, setHovering] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  useEffect(() => {
    if (!isOpen || !profile) return;
    let cancelled = false;
    setLoading(true);
    setEntries([]);
    setImageMap({});
    Promise.all([
      profilesLogic.getAvgHistory(profile.type, profile.name),
      profilesLogic.getProfileEntriesForChart(profile.type, profile.name),
    ]).then(([pts, ents]) => {
      if (cancelled) return;
      setPoints(pts);
      setEntries(ents);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isOpen, profile]);

  // Preload cover thumbnails for chart markers, releasing blob refs on cleanup.
  useEffect(() => {
    if (!isOpen || entries.length === 0) return;
    let cancelled = false;
    const acquired: string[] = [];
    (async () => {
      const map: Record<number, string> = {};
      for (const e of entries) {
        if (cancelled) return;
        if (!e.image_url) continue;
        const url = await getImageUrl(e.image_url);
        if (cancelled) return;
        acquired.push(e.image_url);
        map[e.id] = url;
      }
      if (!cancelled) setImageMap(map);
    })();
    return () => {
      cancelled = true;
      acquired.forEach(releaseImageUrl);
    };
  }, [isOpen, entries]);

  const chartData = useMemo<ChartRow[]>(() => {
    if (points.length === 0) return [];
    const snapshotByDate = new Map<string, AvgHistoryPoint>();
    for (const p of points) {
      const d = p.captured_at.slice(0, 10);
      // Keep the latest snapshot if multiple land on the same day.
      snapshotByDate.set(d, p);
    }
    const entriesByDate = new Map<string, MediaEntry[]>();
    for (const e of entries) {
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
        // Anchored at y=10 (chart top) so markers float above the avg line,
        // not on it. The renderDot function offsets them upward from there.
        _markerY: markers.length > 0 ? 10 : null,
        markers,
      };
    });
  }, [points, entries]);

  // Unique entry dates that get a dotted vertical guide.
  const entryDates = useMemo(
    () => [...new Set(entries.map(e => e.completion_date!).filter(Boolean))].sort(),
    [entries]
  );

  if (!isOpen || !profile) return null;

  const hasData = points.length > 0;
  const currentAvg = points.length > 0 ? points[points.length - 1].average_score : profile.average_score;
  const firstAvg = points.length > 0 ? points[0].average_score : null;
  const delta = firstAvg != null ? currentAvg - firstAvg : null;
  const dense = entries.length >= DENSE_THRESHOLD;
  const markerOpacity = !dense ? 0.9 : (hovering ? 0.9 : 0);
  const guideOpacity = !dense ? 0.15 : (hovering ? 0.25 : 0.06);
  const guideColor = `rgba(255,255,255,${guideOpacity})`;

  const renderMarkerDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload?.markers || payload.markers.length === 0) return null;
    return (
      <g opacity={markerOpacity}>
        {payload.markers.map((m: MarkerInfo, i: number) => {
          const url = imageMap[m.entryId];
          // Stack downward from the top anchor (cy ≈ chart top) so multiple
          // same-day entries fan out vertically just under the chart's top edge,
          // floating above the avg line.
          const cyOffset = cy + MARKER_SIZE / 2 + i * (MARKER_SIZE + MARKER_GAP);
          return (
            <g key={m.entryId}>
              <rect
                x={cx - MARKER_SIZE / 2}
                y={cyOffset - MARKER_SIZE / 2}
                width={MARKER_SIZE}
                height={MARKER_SIZE}
                rx={4}
                ry={4}
                fill="rgba(10,10,12,0.85)"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth={1}
              />
              {url && (
                <image
                  href={url}
                  x={cx - MARKER_SIZE / 2 + 2}
                  y={cyOffset - MARKER_SIZE / 2 + 2}
                  width={MARKER_SIZE - 4}
                  height={MARKER_SIZE - 4}
                  preserveAspectRatio="xMidYMid slice"
                />
              )}
            </g>
          );
        })}
      </g>
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-white/10 w-full max-w-2xl rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-5 border-b border-white/5 bg-gradient-to-r from-yellow-500/10 via-transparent to-transparent">
          <div className="p-2.5 bg-yellow-500/20 rounded-xl">
            <LineChartIcon size={20} className="text-yellow-400" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-white text-lg truncate">AVG rating history</h3>
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
            {delta != null && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Change</p>
                <p className={`text-2xl font-bold ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-gray-300"}`}>
                  {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                </p>
              </div>
            )}
            {entries.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Entries</p>
                <p className="text-2xl font-bold text-white">{entries.length}</p>
              </div>
            )}
          </div>

          {loading ? (
            <div className="h-[300px] flex items-center justify-center">
              <p className="text-sm text-gray-400">Loading history…</p>
            </div>
          ) : hasData ? (
            <div
              className="h-[300px] w-full"
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
            >
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={chartData} margin={{ left: 0, right: 18, top: 28, bottom: 0 }}>
                  {entryDates.map(d => (
                    <ReferenceLine
                      key={`guide-${d}`}
                      x={d}
                      stroke={guideColor}
                      strokeDasharray="2 4"
                      ifOverflow="extendDomain"
                    />
                  ))}
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
                  />
                  <Line
                    type="monotone"
                    dataKey="_markerY"
                    stroke="transparent"
                    strokeWidth={0}
                    dot={renderMarkerDot}
                    activeDot={false}
                    isAnimationActive={false}
                    connectNulls={false}
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
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
              <p className="text-sm text-gray-400">No history yet — add or rate entries to start tracking.</p>
            </div>
          )}

          {hasData && entries.length > 0 && (
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