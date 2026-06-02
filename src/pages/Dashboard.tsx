import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion";
import { Library, Star, Calendar, Folder, ArrowRight, Sparkles, Hourglass, RotateCcw, Captions, Shuffle } from "lucide-react";
import { dashboardLogic, type DashboardStats } from "../lib/dashboard-stats";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { MediaListCard } from "../components/MediaListCard";
import type { MediaEntry } from "../lib/db";
import { getImageUrl, releaseImageUrl } from "../lib/utils";
import { getDisplayName } from "../lib/settings";
import { getAvailableNavigationYears, getCurrentYearString } from "../lib/navigation-years";

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

const prefersReducedMotion = (): boolean =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export default function Dashboard() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<MediaEntry[]>([]);
  const [featured, setFeatured] = useState<{ entry: MediaEntry; imageUrl: string } | null>(null);
  const [greeting, setGreeting] = useState("Hello");
  const [displayName, setDisplayName] = useState("Collector");
  const [recentYear, setRecentYear] = useState(getCurrentYearString());
  const [onThisDay, setOnThisDay] = useState<MediaEntry[]>([]);
  const [isRerolling, setIsRerolling] = useState(false);
  const [spinKey, setSpinKey] = useState(0);

  // Track the current load operation to prevent stale updates
  const loadIdRef = useRef(0);
  // Path of the image currently held for the featured card, so reroll/unmount
  // release exactly what's displayed (image URLs are refcounted by path).
  const featuredImagePathRef = useRef<string | null>(null);

  // Fetch a (possibly fresh) featured entry, swap its image in, and release the
  // previous one. Guarded by loadIdRef so stale async results never win.
  const loadFeatured = useCallback(async (excludeId?: number) => {
    const id = ++loadIdRef.current;
    const feat = await dashboardLogic.getFeaturedEntry(excludeId);
    if (loadIdRef.current !== id) return;

    const imageUrl = feat ? await getImageUrl(feat.image_url) : null;
    if (loadIdRef.current !== id) {
      if (feat) releaseImageUrl(feat.image_url);
      return;
    }

    releaseImageUrl(featuredImagePathRef.current);
    featuredImagePathRef.current = feat ? feat.image_url : null;
    setFeatured(feat && imageUrl ? { entry: feat, imageUrl } : null);
  }, []);

  const handleReroll = useCallback(async () => {
    if (isRerolling) return;
    if (!prefersReducedMotion()) setSpinKey((k) => k + 1);
    setIsRerolling(true);
    await loadFeatured(featured?.entry.id);
    setIsRerolling(false);
  }, [isRerolling, featured?.entry.id, loadFeatured]);

  useEffect(() => {
    let cancelled = false;

    // Time based greeting
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good Morning");
    else if (hour < 18) setGreeting("Good Afternoon");
    else setGreeting("Good Evening");

    // Load custom display name
    setDisplayName(getDisplayName());

    // Load Data (the featured entry + its image are owned by loadFeatured)
    const load = async () => {
      const [statsData, recentEntries, availableYears, onThisDayEntries] = await Promise.all([
        dashboardLogic.getStats(),
        dashboardLogic.getRecentEntries(),
        getAvailableNavigationYears(),
        dashboardLogic.getOnThisDayEntries(),
      ]);

      const fallbackYear = availableYears[availableYears.length - 1] || getCurrentYearString();
      const recentWithYear = recentEntries.find(entry => entry.year_completed);

      if (!cancelled) {
        setStats(statsData);
        setRecent(recentEntries);
        setRecentYear(recentWithYear?.year_completed ? String(recentWithYear.year_completed) : fallbackYear);
        setOnThisDay(onThisDayEntries);
      }
    };
    load();
    loadFeatured();

    return () => {
      cancelled = true;
      // Invalidate any in-flight featured load and release the displayed image.
      loadIdRef.current++;
      releaseImageUrl(featuredImagePathRef.current);
      featuredImagePathRef.current = null;
    };
  }, [loadFeatured]);

  const handleCardClick = (entry: MediaEntry) => {
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

  const averageRating = Number.parseFloat(stats.average_rating);
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
              initial="hidden"
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
              Your personal media collection • <AnimatedNumber value={stats.total_entries} /> entries tracked
            </p>
          </div>
        </div>
      </header>

      {/* Featured Entry - Large Hero Card (full width) */}
      {featured && (
        <div className="dashboard-featured-wrap">
          <Link
            to={`/year/${featured.entry.year_completed}?highlight=${featured.entry.id}&type=${encodeURIComponent(featured.entry.entry_type || '')}`}
            className="dashboard-featured"
          >
            <div className="dashboard-featured-bg">
              <AnimatePresence>
                <motion.img
                  key={featured.entry.id}
                  src={featured.imageUrl}
                  alt=""
                  style={{ position: "absolute", inset: 0 }}
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.5, ease: "easeOut" }}
                />
              </AnimatePresence>
            </div>
            <div className="dashboard-featured-content">
              <AnimatePresence mode="wait">
                <motion.div
                  key={featured.entry.id}
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
            <div className="dashboard-stat-value"><AnimatedNumber value={stats.total_entries} /></div>
            <div className="dashboard-stat-label">Total Entries</div>
          </div>
        </div>

        <div className="dashboard-stat dashboard-stat-amber">
          <div className="dashboard-stat-icon-wrapper">
            <Star size={24} />
          </div>
          <div className="dashboard-stat-info">
            <div className="dashboard-stat-value"><AnimatedNumber value={averageRating} decimals={1} /></div>
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

      {/* Recent Completions + On This Day */}
      <div className="dashboard-lists">
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
          <p className="dashboard-recent-subtitle">Your latest completions</p>
          {recent.length > 0 ? (
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
        </section>

        {/* On This Day */}
        <section className="dashboard-recent" style={{ animationDelay: '0.1s' }}>
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
          {onThisDay.length > 0 ? (
            <div className="dashboard-list-stack">
              {onThisDay.slice(0, 6).map((entry, i) => (
                <MediaListCard key={entry.id} entry={entry} onClick={handleCardClick} index={i} />
              ))}
            </div>
          ) : (
            <div className="dashboard-list-empty">
              <Hourglass size={20} />
              <span>Nothing completed on this day</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
