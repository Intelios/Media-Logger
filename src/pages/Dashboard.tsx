import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Library, Star, Calendar, Folder, ArrowRight, Search, BarChart3, CalendarDays, Sparkles } from "lucide-react";
import { dashboardLogic, type DashboardStats } from "../lib/dashboard-stats";
import { MediaCard } from "../components/MediaCard";
import { DashboardStatCard } from "../components/DashboardStatCard";
import type { MediaEntry } from "../lib/db";
import { getImageUrl } from "../lib/utils";
import { getDisplayName } from "../lib/settings";

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<MediaEntry[]>([]);
  const [featured, setFeatured] = useState<{ entry: MediaEntry; imageUrl: string } | null>(null);
  const [greeting, setGreeting] = useState("Hello");
  const [displayName, setDisplayName] = useState("Collector");

  // Track the current load operation to prevent stale updates
  const loadIdRef = useRef(0);

  useEffect(() => {
    // Time based greeting
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good Morning");
    else if (hour < 18) setGreeting("Good Afternoon");
    else setGreeting("Good Evening");

    // Load custom display name
    setDisplayName(getDisplayName());

    // Increment load ID to invalidate any in-flight requests
    const currentLoadId = ++loadIdRef.current;

    // Load Data
    const load = async () => {
      setStats(await dashboardLogic.getStats());
      setRecent(await dashboardLogic.getRecentEntries());

      const feat = await dashboardLogic.getFeaturedEntry();
      if (feat) {
        const imageUrl = await getImageUrl(feat.image_url);
        // Only update state if this is still the current load operation
        if (loadIdRef.current === currentLoadId) {
          setFeatured({ entry: feat, imageUrl });
        }
      }
    };
    load();
  }, []);

  if (!stats) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center gap-3 text-gray-400">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span>Loading Dashboard...</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 pb-10">

      {/* 1. Welcome Header - Enhanced with floating orbs */}
      <header className="relative p-8 rounded-3xl border border-white/10 overflow-hidden bg-gradient-to-br from-primary/20 via-secondary/10 to-purple-500/10 animate-gradient">
        {/* Floating decorative orbs */}
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-primary/40 rounded-full blur-3xl animate-float pointer-events-none" />
        <div className="absolute top-1/2 -left-12 w-32 h-32 bg-secondary/30 rounded-full blur-2xl animate-float-delayed pointer-events-none" />
        <div className="absolute -bottom-20 right-1/4 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl animate-float-slow pointer-events-none" />

        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
        />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="text-amber-400 animate-pulse" size={24} />
            <span className="text-sm font-medium text-amber-400/80 uppercase tracking-wider">Welcome Back</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 tracking-tight">
            {greeting}, <span className="bg-gradient-to-r from-primary via-secondary to-purple-400 bg-clip-text text-transparent">{displayName}</span>
          </h1>
          <p className="text-gray-300 text-lg max-w-xl">Your personal media collection dashboard. Track, discover, and celebrate your journey.</p>
        </div>
      </header>

      {/* 2. Stats Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <DashboardStatCard
          icon={<Library size={24} />}
          value={stats.total_entries}
          label="Total Entries"
          subtext="Your complete collection"
          colorClass="blue"
        />
        <DashboardStatCard
          icon={<Star size={24} />}
          value={stats.average_rating}
          label="Average Rating"
          subtext="Quality score"
          colorClass="amber"
          progress={parseFloat(stats.average_rating) * 10}
        />
        <DashboardStatCard
          icon={<Folder size={24} />}
          value={stats.most_common_type}
          label="Most Common"
          subtext="Preferred content"
          colorClass="green"
          progress={65}
        />
        <DashboardStatCard
          icon={<Calendar size={24} />}
          value={stats.most_productive_year}
          label="Peak Year"
          subtext="Highest activity"
          colorClass="purple"
          progress={stats.completion_rate}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* 3. Featured Entry - Enhanced card */}
        {featured && (
          <section className="lg:col-span-1 h-full">
            <Link
              to={`/year/${featured.entry.year_completed}?highlight=${featured.entry.id}&type=${encodeURIComponent(featured.entry.entry_type || '')}`}
              className="group h-full bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/10 rounded-2xl p-6 flex flex-col hover:border-amber-500/50 transition-all duration-500 cursor-pointer block backdrop-blur-sm hover:shadow-[0_0_40px_rgba(245,158,11,0.15)]"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-amber-500/20">
                  <Star className="text-amber-400 fill-amber-400" size={18} />
                </div>
                <h3 className="text-xl font-bold">Featured Entry</h3>
                <Sparkles className="text-amber-400/60 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" size={16} />
              </div>

              <div className="relative aspect-video w-full rounded-xl overflow-hidden mb-4 shadow-xl">
                <img
                  src={featured.imageUrl}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  alt={featured.entry.name}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3">
                  <span className="text-xs font-bold px-2.5 py-1 bg-gradient-to-r from-primary to-secondary text-white rounded-md mb-2 inline-block shadow-lg">
                    {featured.entry.entry_type}
                  </span>
                  <h4 className="text-lg font-bold leading-tight line-clamp-1">{featured.entry.name}</h4>
                </div>
              </div>

              <div className="mt-auto space-y-3">
                <div className="flex justify-between text-sm text-gray-400 border-b border-white/5 pb-2">
                  <span>Rating</span>
                  <span className="text-white font-bold">{featured.entry.review_score}/10</span>
                </div>
                <div className="flex justify-between text-sm text-gray-400 border-b border-white/5 pb-2">
                  <span>Completed</span>
                  <span className="text-white">{featured.entry.completion_date || "N/A"}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Year</span>
                  <span className="text-white">{featured.entry.year_completed}</span>
                </div>
              </div>
            </Link>
          </section>
        )}

        {/* 4. Quick Actions - Enhanced with glassmorphism */}
        <section className={featured ? "lg:col-span-2" : "col-span-3"}>
          <div className="bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 rounded-2xl p-6 h-full flex flex-col justify-center backdrop-blur-sm">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
              <div className="w-1.5 h-7 bg-gradient-to-b from-secondary to-primary rounded-full" />
              Quick Actions
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Link
                to="/year/2025"
                className="group card-shine flex flex-col items-center justify-center gap-4 p-6 rounded-xl bg-gradient-to-br from-white/[0.06] to-transparent hover:from-primary/20 hover:to-primary/5 transition-all duration-500 border border-white/5 hover:border-primary/50 hover:shadow-[0_0_30px_rgba(94,53,177,0.2)]"
              >
                <div className="p-3 rounded-xl bg-white/5 group-hover:bg-primary/20 transition-all duration-300 group-hover:scale-110">
                  <CalendarDays size={28} className="text-gray-400 group-hover:text-primary transition-colors duration-300" />
                </div>
                <span className="font-semibold text-gray-300 group-hover:text-white transition-colors">Browse Years</span>
              </Link>
              <Link
                to="/search"
                className="group card-shine flex flex-col items-center justify-center gap-4 p-6 rounded-xl bg-gradient-to-br from-white/[0.06] to-transparent hover:from-secondary/20 hover:to-secondary/5 transition-all duration-500 border border-white/5 hover:border-secondary/50 hover:shadow-[0_0_30px_rgba(30,136,229,0.2)]"
              >
                <div className="p-3 rounded-xl bg-white/5 group-hover:bg-secondary/20 transition-all duration-300 group-hover:scale-110">
                  <Search size={28} className="text-gray-400 group-hover:text-secondary transition-colors duration-300" />
                </div>
                <span className="font-semibold text-gray-300 group-hover:text-white transition-colors">Search Collection</span>
              </Link>
              <Link
                to="/stats"
                className="group card-shine flex flex-col items-center justify-center gap-4 p-6 rounded-xl bg-gradient-to-br from-white/[0.06] to-transparent hover:from-green-500/20 hover:to-green-500/5 transition-all duration-500 border border-white/5 hover:border-green-500/50 hover:shadow-[0_0_30px_rgba(34,197,94,0.2)]"
              >
                <div className="p-3 rounded-xl bg-white/5 group-hover:bg-green-500/20 transition-all duration-300 group-hover:scale-110">
                  <BarChart3 size={28} className="text-gray-400 group-hover:text-green-500 transition-colors duration-300" />
                </div>
                <span className="font-semibold text-gray-300 group-hover:text-white transition-colors">View Analytics</span>
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* 5. Recent Completions - Enhanced header */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10">
              <Calendar size={20} className="text-primary" />
            </div>
            Recent Completions
          </h3>
          <Link to="/year/2025" className="group text-sm font-medium text-primary hover:text-primary-400 flex items-center gap-1.5 transition-all px-3 py-1.5 rounded-lg hover:bg-primary/10">
            View All
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
          {recent.map(entry => (
            <MediaCard key={entry.id} entry={entry} />
          ))}
        </div>
      </section>
    </div>
  );
}