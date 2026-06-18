import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LineChart as LineChartIcon, X } from "lucide-react";
import { profilesLogic, type ProfileSummary } from "../lib/profiles-logic";
import type { AvgHistoryPoint } from "../lib/db";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";
import { formatShortDate } from "../lib/dates";

interface AvgHistoryModalProps {
  isOpen: boolean;
  profile: ProfileSummary | null;
  onClose: () => void;
}

interface ChartPoint {
  captured_at: string;
  average_score: number;
  rated_count: number;
  total_count: number;
  source: string;
}

function AvgHistoryTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload?: ChartPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/95 px-4 py-3 shadow-2xl backdrop-blur-xl">
      <div className="mb-1 text-sm font-semibold text-white">{formatShortDate(point.captured_at)}</div>
      <p className="text-yellow-300 text-sm">
        Avg <span className="font-bold">{point.average_score.toFixed(1)}</span>
      </p>
      <p className="text-gray-400 text-xs">
        {point.rated_count} rated / {point.total_count} {point.total_count === 1 ? "entry" : "entries"}
      </p>
    </div>
  );
}

export function AvgHistoryModal({ isOpen, profile, onClose }: AvgHistoryModalProps) {
  const [points, setPoints] = useState<AvgHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  useEffect(() => {
    if (!isOpen || !profile) return;
    let cancelled = false;
    setLoading(true);
    profilesLogic.getAvgHistory(profile.type, profile.name).then(rows => {
      if (!cancelled) {
        setPoints(rows);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isOpen, profile]);

  if (!isOpen || !profile) return null;

  const chartData: ChartPoint[] = points.map(p => ({
    captured_at: p.captured_at,
    average_score: p.average_score,
    rated_count: p.rated_count,
    total_count: p.total_count,
    source: p.source,
  }));

  const hasData = chartData.length > 0;
  const currentAvg = points.length > 0 ? points[points.length - 1].average_score : profile.average_score;
  const firstAvg = points.length > 0 ? points[0].average_score : null;
  const delta = firstAvg != null ? currentAvg - firstAvg : null;

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
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Snapshots</p>
              <p className="text-2xl font-bold text-white">{points.length}</p>
            </div>
          </div>

          {loading ? (
            <div className="h-[300px] flex items-center justify-center">
              <p className="text-sm text-gray-400">Loading history…</p>
            </div>
          ) : hasData ? (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={chartData} margin={{ left: 0, right: 18, top: 10, bottom: 0 }}>
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
                    dataKey="average_score"
                    stroke="#facc15"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#facc15", strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#facc15", stroke: "#0f172a", strokeWidth: 2 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
              <p className="text-sm text-gray-400">No history yet — add or rate entries to start tracking.</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}