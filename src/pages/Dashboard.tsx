import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion";
import { Library, Star, Calendar, Folder, ArrowRight, Sparkles, Hourglass, RotateCcw, Captions, Shuffle, Clock } from "lucide-react";
import { dashboardLogic, type DashboardStats } from "../lib/dashboard-stats";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { MediaListCard } from "../components/MediaListCard";
import { CoverImage } from "../components/CoverImage";
import type { MediaEntry } from "../lib/db";
import { getDisplayName, FEATURED_ADULT_VISIBILITY_CHANGED_EVENT } from "../lib/settings";
import { getReplayTerm } from "../lib/media-config";
import { formatTodayMD } from "../lib/dates";
import { getAvailableNavigationYears, getCurrentYearString } from "../lib/navigation-years";
import { mediaQueryKeys, queryClient } from "../lib/query-client";

const greetingContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.14,
    },
  },
};

const greetingWordVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.35,
      ease: "easeOut",
    },
  },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<MediaEntry[]>([]);
  const [recentLoaded, setRecentLoaded] = useState(false);
  const [featured, setFeatured] = useState<MediaEntry | null>(null);
  const [greeting, setGreeting] = useState("Hello");
  const [displayName, setDisplayName] = useState("Collector");
  const [recentYear, setRecentYear] = useState(getCurrentYearString());
  const [onThisDay, setOnThisDay] = useState<MediaEntry[]>([]);
  const [onThisDayLoaded, setOnThisDayLoaded] = useState(false);
  const [isRerolling, setIsRerolling] = useState(false);
  const [spinKey, setSpinKey] = useState(0);

  // Track the current load operation to prevent stale updates
  const loadIdRef = useRef(0);
  // Fetch a (possibly fresh) featured entry. Guarded by loadIdRef so stale
  // async results never win.
  const loadFeatured = useCallback(async (excludeId?: number) => {
    const id = ++loadIdRef.current;
    const feat = await dashboardLogic.getFeaturedEntry(excludeId);
    if (loadIdRef.current !== id) return;
    setFeatured(feat);
  }, []);

  const handleReroll = useCallback(async () => {
    if (isRerolling) return;
    if (!reduceMotion) setSpinKey((k) => k + 1);
    setIsRerolling(true);
    await loadFeatured(featured?.id);
    setIsRerolling(false);
  }, [isRerolling, featured?.id, loadFeatured]);

  useEffect(() => {
    let cancelled = false;

    // Time based greeting
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good Morning");
    else if (hour < 18) setGreeting("Good Afternoon");
    else setGreeting("Good Evening");

    // Load custom display name
    setDisplayName(getDisplayName());

    const scope = mediaQueryKeys.scope();
    void queryClient.fetchQuery({
      queryKey: [...mediaQueryKeys.dashboard, ...scope, 'stats'],
      queryFn: () => dashboardLogic.getStats(),
    }).then((data) => {
      if (!cancelled) setStats(data);
    }).catch((error) => console.error('Failed to load dashboard stats:', error));

    void Promise.all([
      queryClient.fetchQuery({
        queryKey: [...mediaQueryKeys.dashboard, ...scope, 'recent'],
        queryFn: () => dashboardLogic.getRecentEntries(),
      }),
      queryClient.fetchQuery({
        queryKey: [...mediaQueryKeys.navigationYears, ...scope],
        queryFn: () => getAvailableNavigationYears(),
      }),
    ]).then(([recentEntries, availableYears]) => {
      if (cancelled) return;
      const fallbackYear = availableYears[availableYears.length - 1] || getCurrentYearString();
      const recentWithYear = recentEntries.find(entry => entry.year_completed);
      setRecent(recentEntries);
      setRecentLoaded(true);
      setRecentYear(recentWithYear?.year_completed ? String(recentWithYear.year_completed) : fallbackYear);
    }).catch((error) => {
      console.error('Failed to load recent dashboard entries:', error);
      if (!cancelled) setRecentLoaded(true);
    });

    void queryClient.fetchQuery({
      queryKey: [...mediaQueryKeys.dashboard, ...scope, 'on-this-day', formatTodayMD()],
      queryFn: () => dashboardLogic.getOnThisDayEntries(),
    }).then((entries) => {
      if (!cancelled) {
        setOnThisDay(entries);
        setOnThisDayLoaded(true);
      }
    }).catch((error) => {
      console.error('Failed to load On This Day entries:', error);
      if (!cancelled) setOnThisDayLoaded(true);
    });

    void loadFeatured();

    // Refresh the featured entry when the Featured-Entry adult filter changes
    // in Settings, so the card updates without an app restart.
    const handleFeaturedAdultChange = () => loadFeatured();
    window.addEventListener(FEATURED_ADULT_VISIBILITY_CHANGED_EVENT, handleFeaturedAdultChange);

    return () => {
      cancelled = true;
      // Invalidate any in-flight featured load.
      loadIdRef.current++;
      window.removeEventListener(FEATURED_ADULT_VISIBILITY_CHANGED_EVENT, handleFeaturedAdultChange);
    };
  }, [loadFeatured]);

  const handleCardClick = (entry: MediaEntry) => {
    if (entry.year_completed) {
      navigate(
        `/year/${entry.year_completed}?highlight=${entry.id}&type=${encodeURIComponent(entry.entry_type || "")}`
      );
    }
  };

  const averageRating = stats?.average_rating ?? 0;
  const productiveYear = stats?.most_productive_year ?? null;
  const greetingWords = greeting.split(" ");

  return (
    <div className="dashboard-container">
      {/* Compact Greeting Header */}
      <header className="dashboard-header">
        <div className="dashboard-header-content">
          <div className="dashboard-header-icon-left">
            <Sparkles size={18} />
          </div>
          <div>
            <motion.h1
              className="dashboard-title"
              variants={greetingContainerVariants}
              initial={reduceMotion ? false : "hidden"}
              animate="visible"
            >
              {greetingWords.map((word, index) => (
                <motion.span
                  key={`${word}-${index}`}
                  variants={greetingWordVariants}
                  className={`inline-block${index < greetingWords.length - 1 ? " mr-1.5" : ""}`}
                >
                  {word}{index === greetingWords.length - 1 ? "," : ""}
                </motion.span>
              ))}{" "}
              <motion.span className="dashboard-title-accent inline-block" variants={greetingWordVariants}>
                {displayName}
              </motion.span>
            </motion.h1>
            <p className="dashboard-subtitle">
              Your personal media collection{stats ? <> • <AnimatedNumber value={stats.total_entries} /> entries tracked</> : ''}
            </p>
          </div>
        </div>
      </header>

      {/* Featured Entry - Large Hero Card (full width) */}
      {featured && (
        <div className="dashboard-featured-wrap">
          <Link
            to={`/year/${featured.year_completed}?highlight=${featured.id}&type=${encodeURIComponent(featured.entry_type || '')}`}
            className="dashboard-featured"
          >
            <div className="dashboard-featured-bg">
              <AnimatePresence>
                <motion.div
                  key={featured.id}
                  style={{ position: "absolute", inset: 0 }}
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.5, ease: "easeOut" }}
                >
                  <CoverImage
                    path={featured.image_url}
                    alt=""
                    variant="hero"
                    priority="high"
                    sizes="100vw"
                    containerClassName="absolute inset-0"
                    imageClassName="h-full w-full object-cover"
                  />
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="dashboard-featured-content">
              <AnimatePresence mode="wait">
                <motion.div
                  key={featured.id}
                  className="dashboard-featured-content-inner"
                  initial={reduceMotion ? false : { opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
                  transition={{ duration: reduceMotion ? 0 : 0.35, ease: "easeOut" }}
                >
                  <div className="dashboard-featured-badge">
                    <Star size={12} className="fill-current" />
                    <span>Featured</span>
                  </div>
                  <h2 className="dashboard-featured-title">{featured.name}</h2>
                  <div className="dashboard-featured-meta">
                    <span className="dashboard-featured-type">{featured.entry_type}</span>
                    <span className="dashboard-featured-dot">•</span>
                    <span className="dashboard-featured-score">{featured.review_score}/10</span>
                    <span className="dashboard-featured-dot">•</span>
                    <span>{featured.completion_date || featured.year_completed}</span>
                    {featured.is_rewatch === 1 && (
                      <>
                        <span className="dashboard-featured-dot">•</span>
                        <span className="dashboard-featured-rewatch">
                          <RotateCcw size={14} />
                          {getReplayTerm(featured.entry_type).label}
                        </span>
                      </>
                    )}
                    {featured.has_subtitles === 1 && (
                      <>
                        <span className="dashboard-featured-dot">•</span>
                        <span className="dashboard-featured-rewatch" style={{ color: '#fb923c' }}>
                          <Captions size={14} />
                          Subtitles
                        </span>
                      </>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </Link>
          <button
            type="button"
            className="dashboard-reroll-btn"
            onClick={handleReroll}
            disabled={isRerolling}
            aria-label="Reroll featured entry"
            title="Reroll"
          >
            <motion.span
              className="dashboard-reroll-icon"
              animate={{ rotate: spinKey * 360 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
            >
              <Shuffle size={18} />
            </motion.span>
          </button>
        </div>
      )}

      {/* Stats Row */}
      <div className="dashboard-stats-row">
        <div className="dashboard-stat dashboard-stat-blue">
          <div className="dashboard-stat-icon-wrapper">
            <Library size={24} />
          </div>
          <div className="dashboard-stat-info">
            <div className="dashboard-stat-value">{stats ? <AnimatedNumber value={stats.total_entries} /> : '—'}</div>
            <div className="dashboard-stat-label">Total Entries</div>
          </div>
        </div>

        <div className="dashboard-stat dashboard-stat-amber">
          <div className="dashboard-stat-icon-wrapper">
            <Star size={24} />
          </div>
          <div className="dashboard-stat-info">
            <div className="dashboard-stat-value">{stats ? <AnimatedNumber value={averageRating} decimals={1} /> : '—'}</div>
            <div className="dashboard-stat-label">Avg Rating</div>
          </div>
        </div>

        <div className="dashboard-stat dashboard-stat-green">
          <div className="dashboard-stat-icon-wrapper">
            <Folder size={24} />
          </div>
          <div className="dashboard-stat-info">
            <div className="dashboard-stat-value">{stats?.most_common_type ?? '—'}</div>
            <div className="dashboard-stat-label">Top Type</div>
          </div>
        </div>

        <div className="dashboard-stat dashboard-stat-purple">
          <div className="dashboard-stat-icon-wrapper">
            <Calendar size={24} />
          </div>
          <div className="dashboard-stat-info">
            <div className="dashboard-stat-value">
              {stats ? (productiveYear ? `${productiveYear.year} (${productiveYear.count})` : "N/A") : '—'}
            </div>
            <div className="dashboard-stat-label">Peak Year</div>
          </div>
        </div>
      </div>

      {/* Recent Completions + On This Day */}
      <div className="dashboard-lists">
        {/* Recent Completions */}
        <section className="dashboard-recent">
          <div className="dashboard-recent-header">
            <h3 className="dashboard-section-title">
              <Clock size={20} />
              Recent Completions
            </h3>
          </div>
          <p className="dashboard-recent-subtitle">Your latest completions</p>
          {!recentLoaded ? (
            <div className="dashboard-list-empty"><span>Loading recent entries…</span></div>
          ) : recent.length > 0 ? (
            <div className="dashboard-list-stack">
              {recent.slice(0, 6).map((entry, i) => (
                <MediaListCard key={entry.id} entry={entry} onClick={handleCardClick} index={i} />
              ))}
            </div>
          ) : (
            <div className="dashboard-list-empty">
              <span>No recent completions</span>
            </div>
          )}
          <Link to={`/year/${recentYear}`} className="dashboard-view-all">
            View All
            <ArrowRight size={16} />
          </Link>
        </section>

        {/* On This Day */}
        <section className="dashboard-recent" style={{ animationDelay: '0.1s' }}>
          <div className="dashboard-recent-header">
            <h3 className="dashboard-section-title">
              <Hourglass size={20} />
              On This Day
            </h3>
          </div>
          <p className="dashboard-recent-subtitle">Entries completed on {formatTodayMD()}</p>
          {!onThisDayLoaded ? (
            <div className="dashboard-list-empty"><span>Loading matches…</span></div>
          ) : onThisDay.length > 0 ? (
            <div className="dashboard-list-stack">
              {onThisDay.slice(0, 6).map((entry, i) => (
                <MediaListCard key={entry.id} entry={entry} onClick={handleCardClick} index={i} showYearsAgo />
              ))}
            </div>
          ) : (
            <div className="dashboard-list-empty">
              <Hourglass size={20} />
              <span>Nothing completed on this day</span>
            </div>
          )}
          <Link to="/search" className="dashboard-view-all">
            View All
            <ArrowRight size={16} />
          </Link>
        </section>
      </div>
    </div>
  );
}
