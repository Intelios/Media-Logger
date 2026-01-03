import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Library, Star, Calendar, Folder, ArrowRight, Search, BarChart3, CalendarDays } from "lucide-react";
import { dashboardLogic, type DashboardStats } from "../lib/dashboard-stats";
import { MediaCard } from "../components/MediaCard";
import { DashboardStatCard } from "../components/DashboardStatCard";
import type { MediaEntry } from "../lib/db";
import { getImageUrl } from "../lib/utils";

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<MediaEntry[]>([]);
  const [featured, setFeatured] = useState<MediaEntry | null>(null);
  const [featuredImg, setFeaturedImg] = useState("");
  const [greeting, setGreeting] = useState("Hello");

  useEffect(() => {
    // Time based greeting
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good Morning");
    else if (hour < 18) setGreeting("Good Afternoon");
    else setGreeting("Good Evening");

    // Load Data
    const load = async () => {
      setStats(await dashboardLogic.getStats());
      setRecent(await dashboardLogic.getRecentEntries());
      
      const feat = await dashboardLogic.getFeaturedEntry();
      setFeatured(feat);
      if (feat) {
        setFeaturedImg(await getImageUrl(feat.image_url));
      }
    };
    load();
  }, []);

  if (!stats) return <div className="p-10">Loading Dashboard...</div>;

  return (
    <div className="space-y-8 pb-10">
      
      {/* 1. Welcome Header */}
      <header className="bg-gradient-to-r from-primary/20 to-secondary/20 p-8 rounded-3xl border border-white/5 relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-4xl font-bold text-white mb-2">{greeting}, Collector</h1>
          <p className="text-gray-300 text-lg">Your personal media collection dashboard.</p>
        </div>
        {/* Decorative background blob */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/30 rounded-full blur-3xl pointer-events-none" />
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
          progress={65} // Example static, or calc from logic
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
        
        {/* 3. Featured Entry (Takes up 1 column on large screens, usually displayed nicely) */}
        {featured && (
          <section className="lg:col-span-1 h-full">
            <div className="h-full bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col hover:border-amber-500/30 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <Star className="text-amber-400 fill-amber-400" size={20} />
                <h3 className="text-xl font-bold">Featured Entry</h3>
              </div>
              
              <div className="relative aspect-video w-full rounded-xl overflow-hidden mb-4 shadow-lg">
                <img src={featuredImg} className="w-full h-full object-cover" alt={featured.name} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3">
                  <span className="text-xs font-bold px-2 py-1 bg-primary text-white rounded-md mb-2 inline-block">
                    {featured.entry_type}
                  </span>
                  <h4 className="text-lg font-bold leading-tight line-clamp-1">{featured.name}</h4>
                </div>
              </div>

              <div className="mt-auto space-y-3">
                <div className="flex justify-between text-sm text-gray-400 border-b border-white/5 pb-2">
                  <span>Rating</span>
                  <span className="text-white font-bold">{featured.review_score}/10</span>
                </div>
                <div className="flex justify-between text-sm text-gray-400 border-b border-white/5 pb-2">
                  <span>Completed</span>
                  <span className="text-white">{featured.completion_date || "N/A"}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Year</span>
                  <span className="text-white">{featured.year_completed}</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 4. Quick Actions (Takes up remaining space or separate row) */}
        <section className={featured ? "lg:col-span-2" : "col-span-3"}>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 h-full flex flex-col justify-center">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-secondary rounded-full" />
              Quick Actions
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Link to="/year/2025" className="group flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-white/5 hover:bg-primary/20 hover:text-white transition-all border border-white/5 hover:border-primary/50">
                <CalendarDays size={32} className="text-gray-400 group-hover:text-primary transition-colors" />
                <span className="font-semibold">Browse Years</span>
              </Link>
              <Link to="/search" className="group flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-white/5 hover:bg-secondary/20 hover:text-white transition-all border border-white/5 hover:border-secondary/50">
                <Search size={32} className="text-gray-400 group-hover:text-secondary transition-colors" />
                <span className="font-semibold">Search Collection</span>
              </Link>
              <Link to="/stats" className="group flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-white/5 hover:bg-green-500/20 hover:text-white transition-all border border-white/5 hover:border-green-500/50">
                <BarChart3 size={32} className="text-gray-400 group-hover:text-green-500 transition-colors" />
                <span className="font-semibold">View Analytics</span>
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* 5. Recent Completions */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/10"><Calendar size={20} /></div>
            Recent Completions
          </h3>
          <Link to="/year/2025" className="text-sm font-medium text-primary hover:text-primary-400 flex items-center gap-1 transition-colors">
            View All <ArrowRight size={16} />
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