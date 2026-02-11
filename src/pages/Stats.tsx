import { useEffect, useState } from "react";
import { statsLogic, type FullStats } from "../lib/stats-logic";
import { type MediaEntry } from "../lib/db";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, AreaChart, Area } from "recharts";
import { Filter, Star, RefreshCw, Hash, Play, PieChart as PieIcon, Heart, Building2, User, Sparkles, Calendar, Trophy, Gamepad2, Film, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils_ui";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { CollapsibleStatSection } from "../components/CollapsibleStatSection";
import { StatsEntriesModal } from "../components/StatsEntriesModal";
import { GenreBreakdownModal } from "../components/GenreBreakdownModal";

const YEARS = ["All Time", "2023", "2024", "2025", "2026"];
const ENTRY_TYPES = ["Movie", "Show", "Anime", "Book", "Album", "K-Drama", "JAV", "Hentai", "Game", "Adult Visual Novel", "Other"];
const COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"];

// LocalStorage keys for persistence
const STATS_YEAR_KEY = "stats-active-year";
const STATS_TYPES_KEY = "stats-selected-types";
const STATS_PRESET_KEY = "stats-active-preset";

// Quick filter presets
type PresetKey = "gaming" | "media" | "adult" | null;

const FILTER_PRESETS: Record<Exclude<PresetKey, null>, { label: string; icon: typeof Gamepad2; types: string[]; gradient: string }> = {
  gaming: {
    label: "Gaming",
    icon: Gamepad2,
    types: ["Game"],
    gradient: "from-green-500 to-emerald-600",
  },
  media: {
    label: "Media",
    icon: Film,
    types: ["K-Drama", "Anime", "Show", "Movie", "Book", "Album"],
    gradient: "from-blue-500 to-purple-600",
  },
  adult: {
    label: "Adult",
    icon: Heart,
    types: ["JAV", "Hentai", "Adult Visual Novel"],
    gradient: "from-pink-500 to-rose-600",
  },
};

// Helper to load persisted preset from localStorage
const loadPersistedPreset = (): PresetKey => {
  try {
    const stored = localStorage.getItem(STATS_PRESET_KEY);
    if (stored && (stored === "gaming" || stored === "media" || stored === "adult")) {
      return stored as PresetKey;
    }
  } catch {
    // If parsing fails, fall back to default
  }
  return null;
};

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
  const [activePreset, setActivePreset] = useState<PresetKey>(loadPersistedPreset);
  const [data, setData] = useState<FullStats | null>(null);

  // Modal state for clickable stat cards
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalEntries, setModalEntries] = useState<MediaEntry[]>([]);

  // Genre breakdown modal state
  const [genreModalOpen, setGenreModalOpen] = useState(false);

  // Handle preset button click
  const handlePresetClick = (presetKey: Exclude<PresetKey, null>) => {
    if (activePreset === presetKey) {
      // Deactivate preset - reset to all types
      setActivePreset(null);
      setSelectedTypes(ENTRY_TYPES);
      localStorage.removeItem(STATS_PRESET_KEY);
    } else {
      // Activate preset
      setActivePreset(presetKey);
      setSelectedTypes(FILTER_PRESETS[presetKey].types);
      localStorage.setItem(STATS_PRESET_KEY, presetKey);
    }
  };

  // Persist activeYear to localStorage
  useEffect(() => {
    localStorage.setItem(STATS_YEAR_KEY, activeYear);
  }, [activeYear]);

  // Persist selectedTypes to localStorage
  useEffect(() => {
    localStorage.setItem(STATS_TYPES_KEY, JSON.stringify(selectedTypes));
  }, [selectedTypes]);

  useEffect(() => {
    statsLogic.getStats(activeYear, selectedTypes).then(setData);
  }, [activeYear, selectedTypes]);

  // Click handlers for stat cards
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

  const handleModalEntriesChange = () => {
    // Refresh both the stats and the modal entries
    statsLogic.getStats(activeYear, selectedTypes).then(setData);
    if (modalTitle === "Perfect 10s") {
      statsLogic.getPerfect10Entries(activeYear, selectedTypes).then(setModalEntries);
    } else if (modalTitle === "This Month") {
      statsLogic.getThisMonthEntries(activeYear, selectedTypes).then(setModalEntries);
    } else if (modalTitle.startsWith("Genre: ")) {
      const genreName = modalTitle.replace("Genre: ", "");
      statsLogic.getEntriesByGenre(genreName, activeYear, selectedTypes).then(setModalEntries);
    }
  };

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

          <div className="flex items-center gap-4">
            <MultiSelectFilter
              options={ENTRY_TYPES}
              selected={selectedTypes}
              onChange={(types) => {
                setSelectedTypes(types);
                // Clear active preset when manually changing filters
                setActivePreset(null);
                localStorage.removeItem(STATS_PRESET_KEY);
              }}
              label="Content Types"
            />
          </div>
        </div>

        {/* Quick Filter Preset Buttons */}
        <div className="flex items-center gap-3">
          {(Object.keys(FILTER_PRESETS) as Exclude<PresetKey, null>[]).map((key) => {
            const preset = FILTER_PRESETS[key];
            const Icon = preset.icon;
            const isActive = activePreset === key;
            return (
              <button
                key={key}
                onClick={() => handlePresetClick(key)}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold
                  transition-all duration-200 shadow-lg
                  ${isActive
                    ? `bg-gradient-to-r ${preset.gradient} text-white shadow-lg scale-105`
                    : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10'}
                `}
              >
                <Icon size={18} />
                <span>{preset.label}</span>
              </button>
            );
          })}

          {/* Reset button - only show when a preset is active */}
          {activePreset && (
            <button
              onClick={() => {
                setActivePreset(null);
                setSelectedTypes(ENTRY_TYPES);
                localStorage.removeItem(STATS_PRESET_KEY);
              }}
              className="text-gray-400 hover:text-white text-sm underline underline-offset-2 transition-colors"
            >
              Reset
            </button>
          )}
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

      {/* 2. Overview Cards - Enhanced */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={<Hash />} label="Total Entries" value={data.total} color="blue" />
        <StatCard icon={<Star />} label="Avg Score" value={data.average_score.toFixed(1)} color="amber" />
        <StatCard icon={<RefreshCw />} label="Rewatches" value={data.rewatch_count} color="green" />
        <StatCard icon={<Trophy />} label="Perfect 10s" value={data.perfectTenCount} color="pink" onClick={handlePerfect10Click} />
        <StatCard icon={<Calendar />} label="This Month" value={data.entriesThisMonth} color="cyan" onClick={handleThisMonthClick} />
        <StatCard icon={<PieIcon />} label="Genres" value={data.genres.length} color="purple" />
      </div>

      {/* 3. Monthly Activity Sparkline */}
      {activeYear !== "All Time" && (
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Sparkles className="text-cyan-400" size={20} />
            Monthly Activity
          </h3>
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={data.monthlyCompletions} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f1f1f', borderColor: '#333', borderRadius: 8 }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: '#9CA3AF' }}
                />
                <Area type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} fill="url(#colorActivity)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Rating Chart */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Star className="text-amber-400" size={20} />
            Rating Distribution
          </h3>
          <div className="flex-1 min-h-64 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={[...data.ratings].reverse()} layout="vertical" margin={{ left: 0, right: 30 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={30} tick={{ fill: '#9CA3AF' }} />
                <Tooltip content={<RatingTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                <Bar dataKey="count" fill="#fbbf24" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Genre Chart */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Filter className="text-purple-400" size={20} />
              Top Genres
            </h3>
            {data.genres.length > 10 && (
              <button
                onClick={() => setGenreModalOpen(true)}
                className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300 transition-colors font-medium"
              >
                View all {data.genres.length} genres
                <ChevronRight size={16} />
              </button>
            )}
          </div>
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="h-64 w-full md:w-1/2">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie data={data.genres.slice(0, 10)} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={4} dataKey="value">
                    {data.genres.slice(0, 10).map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />)}
                  </Pie>
                  <Tooltip content={<GenreTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full md:w-1/2 space-y-2">
              {data.genres.slice(0, 10).map((g, i) => (
                <button
                  key={g.name}
                  onClick={() => handleGenreClick(g.name)}
                  className="w-full flex items-center justify-between text-sm group rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-gray-300 group-hover:text-white transition-colors">{g.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(g.perfectCount ?? 0) > 0 && <span className="text-xs text-pink-400">💎{g.perfectCount}</span>}
                    {g.avgScore && <span className="text-xs text-amber-400">⭐{g.avgScore.toFixed(1)}</span>}
                    <span className="font-bold text-white">{g.count}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Media Type Breakdown */}
      {data.mediaTypeBreakdown.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <PieIcon className="text-green-400" size={20} />
            Content Type Breakdown
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {data.mediaTypeBreakdown.map((item) => {
              const percentage = data.total > 0 ? (item.count / data.total) * 100 : 0;
              return (
                <div key={item.name} className="bg-white/5 rounded-xl p-4 text-center hover:bg-white/10 transition-colors">
                  <div className="text-2xl font-bold text-white">{item.count}</div>
                  <div className="text-sm text-gray-400 truncate">{item.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{percentage.toFixed(1)}%</div>
                  {item.avgScore && (
                    <div className="text-xs text-amber-400 mt-1">⭐ {item.avgScore.toFixed(1)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Collapsible Breakdown Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CollapsibleStatSection
          title="Platforms"
          icon={<Play size={18} />}
          items={data.platforms.filter(item => item.count >= 3)}
          accentColor="blue"
          storageKey="platforms"
        />
        <CollapsibleStatSection
          title="Studios"
          icon={<Building2 size={18} />}
          items={data.studios.filter(item => item.count >= 3)}
          accentColor="purple"
          storageKey="studios"
        />
        <CollapsibleStatSection
          title="Authors"
          icon={<User size={18} />}
          items={data.authors.filter(item => item.count >= 3)}
          accentColor="green"
          storageKey="authors"
        />
        <CollapsibleStatSection
          title="Actresses"
          icon={<Heart size={18} />}
          items={data.actresses.filter(item => item.count >= 3)}
          accentColor="pink"
          storageKey="actresses"
        />
      </div>

      {/* Genre Breakdown Modal */}
      <GenreBreakdownModal
        isOpen={genreModalOpen}
        onClose={() => setGenreModalOpen(false)}
        genres={data.genres}
        totalEntries={data.total}
        onGenreClick={handleGenreClick}
      />

      {/* Stats Entries Modal */}
      <StatsEntriesModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        entries={modalEntries}
        onEntriesChange={handleModalEntriesChange}
      />
    </div>
  );
}

// Custom Tooltip for Rating Distribution
function RatingTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, count } = payload[0].payload;
  return (
    <div className="bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3 shadow-2xl">
      <div className="flex items-center gap-2 mb-1">
        <Star size={14} className="text-amber-400" />
        <span className="text-white font-semibold">{name}/10</span>
      </div>
      <p className="text-gray-300 text-sm">
        <span className="text-amber-300 font-bold">{count}</span> {count === 1 ? 'entry' : 'entries'}
      </p>
    </div>
  );
}

// Custom Tooltip for Genre Pie Chart
function GenreTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, count, avgScore, perfectCount } = payload[0].payload;
  return (
    <div className="bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3 shadow-2xl min-w-[140px]">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: payload[0].payload.fill || payload[0].color }} />
        <span className="text-white font-semibold">{name}</span>
      </div>
      <div className="space-y-1 text-sm">
        <p className="text-gray-300">
          <span className="text-purple-300 font-bold">{count}</span> {count === 1 ? 'entry' : 'entries'}
        </p>
        {avgScore !== undefined && (
          <p className="text-gray-400 flex items-center gap-1">
            <Star size={12} className="text-amber-400" />
            <span className="text-amber-300 font-medium">{avgScore.toFixed(1)}</span> avg
          </p>
        )}
        {(perfectCount ?? 0) > 0 && (
          <p className="text-gray-400">
            <span className="text-pink-300 font-medium">💎 {perfectCount}</span> perfect
          </p>
        )}
      </div>
    </div>
  );
}

// Enhanced StatCard component
function StatCard({ icon, label, value, color, onClick }: { icon: any, label: string, value: string | number, color: string, onClick?: () => void }) {
  const colors: Record<string, string> = {
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    green: "text-green-400 bg-green-500/10 border-green-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    pink: "text-pink-400 bg-pink-500/10 border-pink-500/20",
    cyan: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  };

  const colorClasses = colors[color] || colors.blue;

  return (
    <div
      className={cn(
        "border p-4 rounded-2xl flex flex-col gap-2 transition-all duration-300 hover:scale-[1.02]",
        colorClasses,
        onClick && "cursor-pointer hover:ring-2 hover:ring-white/20"
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      <div className={cn("p-2 rounded-xl bg-white/5 w-fit", colorClasses.split(' ')[0])}>
        {icon}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold">{label}</div>
    </div>
  );
}