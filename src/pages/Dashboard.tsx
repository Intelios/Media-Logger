import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Library, Star, Calendar, Folder, ArrowRight, Search, BarChart3, CalendarDays, Sparkles, Hourglass, RotateCcw, Captions } from "lucide-react";
import { dashboardLogic, type DashboardStats } from "../lib/dashboard-stats";
import { MediaCard } from "../components/MediaCard";
import { MediaShelf } from "../components/MediaShelf";
import type { MediaEntry } from "../lib/db";
import { getImageUrl } from "../lib/utils";
import { getDisplayName } from "../lib/settings";
import { getAvailableNavigationYears, getCurrentYearString } from "../lib/navigation-years";

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<MediaEntry[]>([]);
  const [featured, setFeatured] = useState<{ entry: MediaEntry; imageUrl: string } | null>(null);
  const [greeting, setGreeting] = useState("Hello");
  const [displayName, setDisplayName] = useState("Collector");
  const [browseYear, setBrowseYear] = useState(getCurrentYearString());
  const [recentYear, setRecentYear] = useState(getCurrentYearString());
  const [onThisDay, setOnThisDay] = useState<MediaEntry[]>([]);

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
      const [statsData, recentEntries, feat, availableYears, onThisDayEntries] = await Promise.all([
        dashboardLogic.getStats(),
        dashboardLogic.getRecentEntries(),
        dashboardLogic.getFeaturedEntry(),
        getAvailableNavigationYears(),
        dashboardLogic.getOnThisDayEntries(),
      ]);

      const fallbackYear = availableYears[availableYears.length - 1] || getCurrentYearString();
      const recentWithYear = recentEntries.find(entry => entry.year_completed);

      if (loadIdRef.current === currentLoadId) {
        setStats(statsData);
        setRecent(recentEntries);
        setBrowseYear(fallbackYear);
        setRecentYear(recentWithYear?.year_completed ? String(recentWithYear.year_completed) : fallbackYear);
        setOnThisDay(onThisDayEntries);
      }

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

  const handleShelfClick = (entry: MediaEntry) => {
    if (entry.year_completed) {
      navigate(
        `/year/${entry.year_completed}?highlight=${entry.id}&type=${encodeURIComponent(entry.entry_type || "")}`
      );
    }
  };

  // Format today's month+day for the "On This Day" subheader (e.g. "April 27th")
  const formatTodayMD = (): string => {
    const today = new Date();
    const day = today.getDate();
    const month = today.toLocaleString('en-US', { month: 'long' });
    const suffix = (d: number) => {
      if (d > 3 && d < 21) return 'th';
      switch (d % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; }
    };
    return `${month} ${day}${suffix(day)}`;
  };

  if (!stats) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center gap-3 text-gray-400">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        <span className="text-sm">Loading...</span>
      </div>
    </div>
  );

  return (
    <div className="dashboard-container">
      {/* Compact Greeting Header */}
      <header className="dashboard-header">
        <div className="dashboard-header-content">
          <div className="dashboard-header-icon-left">
            <Sparkles size={18} />
          </div>
          <div>
            <h1 className="dashboard-title">
              {greeting}, <span className="dashboard-title-accent">{displayName}</span>
            </h1>
            <p className="dashboard-subtitle">Your personal media collection • {stats.total_entries} entries tracked</p>
          </div>
        </div>
      </header>

      {/* Main Bento Grid */}
      <div className="dashboard-bento">
        {/* Left Column: Featured + Quick Actions */}
        <div className="dashboard-left-col">
          {/* Featured Entry - Large Hero Card */}
          {featured && (
            <Link
              to={`/year/${featured.entry.year_completed}?highlight=${featured.entry.id}&type=${encodeURIComponent(featured.entry.entry_type || '')}`}
              className="dashboard-featured"
            >
              <div className="dashboard-featured-bg">
                <img src={featured.imageUrl} alt="" />
              </div>
              <div className="dashboard-featured-content">
                <div className="dashboard-featured-badge">
                  <Star size={12} className="fill-current" />
                  <span>Featured</span>
                </div>
                <h2 className="dashboard-featured-title">{featured.entry.name}</h2>
                <div className="dashboard-featured-meta">
                  <span className="dashboard-featured-type">{featured.entry.entry_type}</span>
                  <span className="dashboard-featured-dot">•</span>
                  <span className="dashboard-featured-score">{featured.entry.review_score}/10</span>
                  <span className="dashboard-featured-dot">•</span>
                  <span>{featured.entry.completion_date || featured.entry.year_completed}</span>
                  {featured.entry.is_rewatch === 1 && (
                    <>
                      <span className="dashboard-featured-dot">•</span>
                      <span className="dashboard-featured-rewatch">
                        <RotateCcw size={14} />
                        Replay
                      </span>
                    </>
                  )}
                  {featured.entry.has_subtitles === 1 && (
                    <>
                      <span className="dashboard-featured-dot">•</span>
                      <span className="dashboard-featured-rewatch" style={{ color: '#fb923c' }}>
                        <Captions size={14} />
                        Subtitles
                      </span>
                    </>
                  )}
                </div>
              </div>
            </Link>
          )}

          {/* Quick Actions Row */}
          <div className="dashboard-actions">
            <Link to={`/year/${browseYear}`} className="dashboard-action dashboard-action-purple">
              <div className="dashboard-action-icon">
                <CalendarDays size={20} />
              </div>
              <div className="dashboard-action-text">
                <span className="dashboard-action-label">Browse Years</span>
                <span className="dashboard-action-hint">View by year</span>
              </div>
              <ArrowRight size={16} className="dashboard-action-arrow" />
            </Link>
            <Link to="/search" className="dashboard-action dashboard-action-blue">
              <div className="dashboard-action-icon">
                <Search size={20} />
              </div>
              <div className="dashboard-action-text">
                <span className="dashboard-action-label">Search</span>
                <span className="dashboard-action-hint">Find entries</span>
              </div>
              <ArrowRight size={16} className="dashboard-action-arrow" />
            </Link>
            <Link to="/stats" className="dashboard-action dashboard-action-green">
              <div className="dashboard-action-icon">
                <BarChart3 size={20} />
              </div>
              <div className="dashboard-action-text">
                <span className="dashboard-action-label">Analytics</span>
                <span className="dashboard-action-hint">View stats</span>
              </div>
              <ArrowRight size={16} className="dashboard-action-arrow" />
            </Link>
          </div>
        </div>

        {/* Right Column: Stats Grid */}
        <div className="dashboard-right-col">
          <div className="dashboard-stats-grid">
            <div className="dashboard-stat dashboard-stat-blue">
              <div className="dashboard-stat-icon-wrapper">
                <Library size={24} />
              </div>
              <div className="dashboard-stat-info">
                <div className="dashboard-stat-value">{stats.total_entries}</div>
                <div className="dashboard-stat-label">Total Entries</div>
              </div>
            </div>

            <div className="dashboard-stat dashboard-stat-amber">
              <div className="dashboard-stat-icon-wrapper">
                <Star size={24} />
              </div>
              <div className="dashboard-stat-info">
                <div className="dashboard-stat-value">{stats.average_rating}</div>
                <div className="dashboard-stat-label">Avg Rating</div>
              </div>
            </div>

            <div className="dashboard-stat dashboard-stat-green">
              <div className="dashboard-stat-icon-wrapper">
                <Folder size={24} />
              </div>
              <div className="dashboard-stat-info">
                <div className="dashboard-stat-value">{stats.most_common_type}</div>
                <div className="dashboard-stat-label">Top Type</div>
              </div>
            </div>

            <div className="dashboard-stat dashboard-stat-purple">
              <div className="dashboard-stat-icon-wrapper">
                <Calendar size={24} />
              </div>
              <div className="dashboard-stat-info">
                <div className="dashboard-stat-value">{stats.most_productive_year}</div>
                <div className="dashboard-stat-label">Peak Year</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Completions */}
      <section className="dashboard-recent">
        <div className="dashboard-recent-header">
          <h3 className="dashboard-section-title">
            <span className="dashboard-section-icon">📅</span>
            Recent Completions
          </h3>
          <Link to={`/year/${recentYear}`} className="dashboard-view-all">
            View All
            <ArrowRight size={14} />
          </Link>
        </div>
        <MediaShelf entries={recent} onItemClick={handleShelfClick} />
      </section>

      {/* On This Day */}
      {onThisDay.length > 0 && (
        <section className="dashboard-recent" style={{ animationDelay: '0.3s' }}>
          <div className="dashboard-recent-header">
            <h3 className="dashboard-section-title">
              <span className="dashboard-section-icon"><Hourglass size={20} /></span>
              On This Day
            </h3>
            <Link to="/search" className="dashboard-view-all">
              View All
              <ArrowRight size={14} />
            </Link>
          </div>
          <p className="dashboard-recent-subtitle">Entries completed on {formatTodayMD()}</p>
          <div className="dashboard-recent-grid">
            {onThisDay.map((entry, i) => (
              <div key={entry.id} className="dashboard-recent-card" style={{ animationDelay: `${i * 0.05}s` }}>
                <MediaCard entry={entry} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
