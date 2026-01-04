import { useEffect, useState } from "react";
import { statsLogic, type FullStats } from "../lib/stats-logic";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { Filter, Star, RefreshCw, Hash, Play, PieChart as PieIcon, Heart } from "lucide-react";
import { cn } from "../lib/utils_ui";
import { MultiSelectFilter } from "../components/MultiSelectFilter"; // NEW Import

const YEARS = ["All Time", "2023", "2024", "2025", "2026"];
const ENTRY_TYPES = ["Movie", "Show", "Anime", "Book", "Album", "K-Drama", "JAV", "Hentai", "Game", "Adult Visual Novel", "Other"];
const COLORS = ["#5E35B1", "#1E88E5", "#43A047", "#FB8C00", "#E53935", "#8E24AA", "#00ACC1"];

// LocalStorage keys for persistence
const STATS_YEAR_KEY = "stats-active-year";
const STATS_TYPES_KEY = "stats-selected-types";

// Load persisted year from localStorage
const loadPersistedYear = (): string => {
  try {
    const stored = localStorage.getItem(STATS_YEAR_KEY);
    if (stored && YEARS.includes(stored)) {
      return stored;
    }
  } catch {
    // Fall back to default
  }
  return "All Time";
};

// Load persisted types from localStorage
const loadPersistedTypes = (): string[] => {
  try {
    const stored = localStorage.getItem(STATS_TYPES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.every(t => ENTRY_TYPES.includes(t))) {
        return parsed;
      }
    }
  } catch {
    // Fall back to default
  }
  return ENTRY_TYPES;
};

export default function StatsPage() {
  const [activeYear, setActiveYear] = useState(loadPersistedYear);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(loadPersistedTypes);
  const [data, setData] = useState<FullStats | null>(null);

  // Persist activeYear to localStorage
  useEffect(() => {
    localStorage.setItem(STATS_YEAR_KEY, activeYear);
  }, [activeYear]);

  // Persist selectedTypes to localStorage
  useEffect(() => {
    localStorage.setItem(STATS_TYPES_KEY, JSON.stringify(selectedTypes));
  }, [selectedTypes]);

  useEffect(() => {
    // Pass both year and types to logic
    statsLogic.getStats(activeYear, selectedTypes).then(setData);
  }, [activeYear, selectedTypes]); // Re-run when either changes

  if (!data) return <div className="p-10 text-gray-400">Calculating analytics...</div>;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20">

      {/* 1. Header & Filter */}
      <header className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
              Statistics
            </h2>
            <p className="text-gray-400">Deep dive analytics for {activeYear}</p>
          </div>

          {/* NEW: Multi-Select Filter placed prominently */}
          <div className="flex items-center gap-4">
            <MultiSelectFilter
              options={ENTRY_TYPES}
              selected={selectedTypes}
              onChange={setSelectedTypes}
              label="Content Types"
            />
          </div>
        </div>

        {/* Year Filter Pills */}
        <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 overflow-x-auto w-fit">
          {YEARS.map(year => (
            <button
              key={year}
              onClick={() => setActiveYear(year)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                activeYear === year
                  ? "bg-primary text-white shadow-lg"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
            >
              {year}
            </button>
          ))}
        </div>
      </header>

      {/* ... Rest of the component (Overview Cards, Charts) is IDENTICAL to previous step ... */}
      {/* Copy paste the grid sections from previous response here */}
      {/* 2. Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Hash />} label="Total Entries" value={data.total} color="blue" />
        <StatCard icon={<Star />} label="Avg Score" value={data.average_score.toFixed(1)} color="amber" />
        <StatCard icon={<RefreshCw />} label="Rewatches" value={data.rewatch_count} color="green" />
        <StatCard icon={<PieIcon />} label="Unique Genres" value={data.genres.length} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Rating Chart */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Star className="text-amber-400" size={20} />
            Rating Distribution
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...data.ratings].reverse()} layout="vertical" margin={{ left: 0, right: 30 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={30} tick={{ fill: '#9CA3AF' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1f1f1f', borderColor: '#333' }} itemStyle={{ color: '#fff' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                <Bar dataKey="count" fill="#fbbf24" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Genre Chart */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Filter className="text-purple-400" size={20} />
            Top Genres
          </h3>
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="h-64 w-full md:w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.genres} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {data.genres.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f1f1f', borderColor: '#333' }}
                    itemStyle={{ color: '#fff' }}
                    labelStyle={{ color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full md:w-1/2 space-y-2">
              {data.genres.slice(0, 5).map((g, i) => (
                <div key={g.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-gray-300">{g.name}</span>
                  </div>
                  <span className="font-bold text-white">{g.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <BreakdownList title="Platforms" items={data.platforms} icon={<Play size={18} />} />
        <BreakdownList title="Top Studios" items={data.studios} icon={<PieIcon size={18} />} />
        <BreakdownList title="Top Authors" items={data.authors} icon={<Filter size={18} />} />
        <BreakdownList title="Top Actresses" items={data.actresses} icon={<Heart size={18} />} />
      </div>
    </div>
  );
}

// ... StatCard and BreakdownList components (Same as before)
function StatCard({ icon, label, value, color }: { icon: any, label: string, value: string | number, color: string }) {
  const colors = {
    blue: "text-blue-400 bg-blue-500/10",
    amber: "text-amber-400 bg-amber-500/10",
    green: "text-green-400 bg-green-500/10",
    purple: "text-purple-400 bg-purple-500/10",
  }[color];

  return (
    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center gap-4">
      <div className={cn("p-3 rounded-xl", colors)}>{icon}</div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold">{label}</div>
      </div>
    </div>
  );
}

function BreakdownList({ title, items, icon }: { title: string, items: { name: string, count: number }[], icon: any }) {
  if (items.length === 0) return null;
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 h-full">
      <h4 className="font-bold text-lg mb-4 flex items-center gap-2 text-gray-200">
        {icon} {title}
      </h4>
      <div className="space-y-3">
        {items.slice(0, 6).map((item, i) => (
          <div key={i} className="flex justify-between items-center group">
            <span className="text-sm text-gray-400 group-hover:text-white transition-colors truncate pr-2">{item.name}</span>
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white/20 group-hover:bg-primary transition-all"
                  style={{ width: `${(item.count / items[0].count) * 100}%` }}
                />
              </div>
              <span className="text-xs font-bold w-4 text-right">{item.count}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}