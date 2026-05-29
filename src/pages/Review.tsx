import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Sparkles, ChevronLeft, ChevronRight, X, Play,
  Star, Trophy, Flame, Heart, Zap, Crown, Gem, BarChart3,
  Eye, Globe,
} from "lucide-react";
import { forceSimulation, forceCollide, forceManyBody, forceX, forceY } from "d3-force";
import { scaleLinear } from "d3-scale";
import { cn } from "../lib/utils_ui";
import { DEFAULT_COVER_IMAGE, getImageUrl } from "../lib/utils";
import { generateReview, getReviewYears, type ReviewData, type ReviewSlide } from "../lib/review-logic";
import { FILTER_PRESETS, getVisibleEntryTypes, getVisiblePresetKeys, type ActiveFilterPresetKey, type FilterPresetKey } from "../lib/media-config";
import type { MediaEntry } from "../lib/db";


// ─── Constants ───────────────────────────────────────────────────────────────

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Slide gradient themes
const SLIDE_THEMES: Record<string, { gradient: string; accent: string }> = {
  "overview":          { gradient: "from-violet-600 via-purple-600 to-indigo-700", accent: "violet" },
  "type-champion":     { gradient: "from-blue-600 via-cyan-600 to-teal-600", accent: "cyan" },
  "biggest-month":     { gradient: "from-amber-500 via-orange-500 to-red-500", accent: "amber" },
  "perfect-tens":      { gradient: "from-emerald-500 via-green-500 to-teal-500", accent: "emerald" },
  "top-genre":         { gradient: "from-pink-500 via-rose-500 to-fuchsia-600", accent: "pink" },
  "genre-cloud":       { gradient: "from-indigo-500 via-violet-500 to-fuchsia-600", accent: "indigo" },
  "top-franchise":     { gradient: "from-sky-500 via-blue-500 to-indigo-600", accent: "blue" },
  "surprise-favorite": { gradient: "from-purple-500 via-fuchsia-500 to-pink-500", accent: "purple" },
  "hidden-gem":        { gradient: "from-teal-500 via-emerald-500 to-cyan-500", accent: "teal" },
  "rating-breakdown":  { gradient: "from-indigo-500 via-violet-500 to-purple-600", accent: "indigo" },
  "award-winners":     { gradient: "from-yellow-500 via-amber-500 to-orange-500", accent: "amber" },
  "finale":            { gradient: "from-rose-500 via-purple-500 to-indigo-600", accent: "rose" },
  "empty":             { gradient: "from-gray-600 via-gray-700 to-gray-800", accent: "gray" },
};

const SLIDE_ICONS: Record<string, typeof Star> = {
  "overview": Sparkles,
  "type-champion": Crown,
  "biggest-month": Flame,
  "perfect-tens": Star,
  "top-genre": Heart,
  "genre-cloud": Globe,
  "top-franchise": Zap,
  "surprise-favorite": Eye,
  "hidden-gem": Gem,
  "rating-breakdown": BarChart3,
  "award-winners": Trophy,
  "finale": Sparkles,
  "empty": X,
};

// ─── Animated Number Counter ─────────────────────────────────────────────────

function AnimatedNumber({ value, duration = 1200, className }: { value: number; duration?: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const from = 0;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (value - from) * eased);
      setDisplay(current);
      if (progress < 1) {
        ref.current = requestAnimationFrame(tick);
      }
    }

    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [value, duration]);

  return <span className={className}>{display}</span>;
}

// ─── Entry Thumbnail ─────────────────────────────────────────────────────────

function EntryThumb({ entry, size = "md", delay = 0 }: { entry: MediaEntry; size?: "sm" | "md" | "lg"; delay?: number }) {
  const [imgSrc, setImgSrc] = useState("");

  useEffect(() => {
    getImageUrl(entry.image_url).then(setImgSrc);
  }, [entry.image_url]);

  const sizeClasses = {
    sm: "w-16 h-20",
    md: "w-24 h-32",
    lg: "w-32 h-44",
  };

  return (
    <div
      className={cn("relative rounded-xl overflow-hidden shadow-2xl review-fade-up flex-shrink-0 group", sizeClasses[size])}
      style={{ animationDelay: `${delay}ms` }}
    >
      <img src={imgSrc} alt={entry.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      {entry.review_score && (
        <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-0.5 text-xs font-bold text-white">
          {entry.review_score}
        </div>
      )}
    </div>
  );
}

// ─── Slide Renderers ─────────────────────────────────────────────────────────

function OverviewSlide({ slide }: { slide: ReviewSlide }) {
  const stats = slide.stats!;
  return (
    <div className="flex flex-col items-center justify-center gap-8 text-center px-8">
      <div className="review-fade-up" style={{ animationDelay: "200ms" }}>
        <div className="text-8xl font-black tracking-tight text-white drop-shadow-2xl">
          <AnimatedNumber value={stats.totalEntries} />
        </div>
        <p className="text-xl text-white/80 mt-2 font-medium">entries completed</p>
      </div>

      <div className="flex gap-10 review-fade-up" style={{ animationDelay: "500ms" }}>
        <div className="text-center">
          <div className="text-4xl font-bold text-white">{stats.avgScore}</div>
          <p className="text-sm text-white/60 mt-1">avg score</p>
        </div>
        <div className="text-center">
          <div className="text-4xl font-bold text-white"><AnimatedNumber value={stats.uniqueTypes} /></div>
          <p className="text-sm text-white/60 mt-1">media types</p>
        </div>
        {stats.rewatchCount > 0 && (
          <div className="text-center">
            <div className="text-4xl font-bold text-white"><AnimatedNumber value={stats.rewatchCount} /></div>
            <p className="text-sm text-white/60 mt-1">rewatches</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TypeChampionSlide({ slide }: { slide: ReviewSlide }) {
  const { champion, breakdown, total } = slide.stats!;
  return (
    <div className="flex flex-col items-center justify-center gap-8 px-8">
      <div className="review-fade-up text-center" style={{ animationDelay: "200ms" }}>
        <div className="text-7xl font-black text-white drop-shadow-2xl review-number-pop">
          {champion.name}
        </div>
        <p className="text-xl text-white/80 mt-3">{champion.count} of {total} entries ({Math.round(champion.count / total * 100)}%)</p>
      </div>

      <div className="flex flex-wrap justify-center gap-3 review-fade-up max-w-lg" style={{ animationDelay: "600ms" }}>
        {breakdown.slice(0, 6).map((item: any, i: number) => (
          <div
            key={item.name}
            className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-sm font-medium text-white/90"
            style={{ animationDelay: `${600 + i * 100}ms` }}
          >
            {item.name} <span className="text-white/50">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BiggestMonthSlide({ slide }: { slide: ReviewSlide }) {
  const { biggestMonth, biggestCount, allMonths } = slide.stats!;
  const maxCount = Math.max(...allMonths.map((m: any) => m.count));
  const entries = slide.entries || [];

  return (
    <div className="flex flex-col items-center justify-center gap-6 px-8">
      <div className="review-fade-up text-center" style={{ animationDelay: "200ms" }}>
        <div className="text-6xl font-black text-white drop-shadow-2xl">{biggestMonth}</div>
        <p className="text-2xl text-white/80 mt-2 font-semibold">
          <AnimatedNumber value={biggestCount} /> completions
        </p>
      </div>

      {/* Entries from that month */}
      {entries.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3 review-fade-up" style={{ animationDelay: "400ms" }}>
          {entries.slice(0, 10).map((entry, i) => (
            <EntryThumb key={entry.id} entry={entry} size="sm" delay={400 + i * 80} />
          ))}
        </div>
      )}

      {/* Mini bar chart */}
      <div className="flex items-end gap-1.5 h-24 review-fade-up" style={{ animationDelay: "700ms" }}>
        {allMonths.map((m: any, i: number) => {
          const height = maxCount > 0 ? (m.count / maxCount) * 100 : 0;
          const isBiggest = m.month === biggestMonth.slice(0, 3);
          return (
            <div key={m.month} className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "w-6 rounded-t-md transition-all duration-700",
                  isBiggest ? "bg-white" : "bg-white/30"
                )}
                style={{ height: `${Math.max(height, 4)}%`, transitionDelay: `${i * 50}ms` }}
              />
              <span className={cn("text-[10px]", isBiggest ? "text-white font-bold" : "text-white/40")}>
                {m.month}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PerfectTensSlide({ slide }: { slide: ReviewSlide }) {
  const entries = slide.entries || [];
  return (
    <div className="flex flex-col items-center justify-center gap-8 px-8">
      <div className="review-fade-up text-center" style={{ animationDelay: "200ms" }}>
        <div className="text-7xl font-black text-white drop-shadow-2xl review-number-pop">
          <AnimatedNumber value={entries.length} />
        </div>
        <p className="text-xl text-white/80 mt-2">perfect scores</p>
      </div>

      {/* Confetti dots */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="review-confetti absolute w-2 h-2 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 3}s`,
              backgroundColor: ["#fbbf24", "#34d399", "#818cf8", "#f472b6", "#22d3ee", "#fb923c"][i % 6],
            }}
          />
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-3 review-fade-up" style={{ animationDelay: "500ms" }}>
        {entries.slice(0, 8).map((entry, i) => (
          <EntryThumb key={entry.id} entry={entry} size="md" delay={500 + i * 100} />
        ))}
      </div>
      {entries.length > 8 && (
        <p className="text-white/50 text-sm review-fade-up" style={{ animationDelay: "1200ms" }}>
          +{entries.length - 8} more
        </p>
      )}
    </div>
  );
}

function TopGenreSlide({ slide }: { slide: ReviewSlide }) {
  const { topGenre, topGenres } = slide.stats!;
  return (
    <div className="flex flex-col items-center justify-center gap-8 px-8">
      <div className="review-fade-up text-center" style={{ animationDelay: "200ms" }}>
        <div className="text-6xl font-black text-white drop-shadow-2xl">{topGenre.name}</div>
        <p className="text-xl text-white/80 mt-2">
          {topGenre.count} entries{topGenre.avgScore ? ` · ${topGenre.avgScore} avg` : ""}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2 max-w-md review-fade-up" style={{ animationDelay: "600ms" }}>
        {topGenres.slice(1).map((g: any, i: number) => (
          <div
            key={g.name}
            className="bg-white/10 backdrop-blur-sm rounded-lg px-3 py-1.5 text-sm text-white/80 review-fade-up"
            style={{ animationDelay: `${700 + i * 80}ms` }}
          >
            {g.name} <span className="text-white/40">{g.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GenreCloudSlide({ slide }: { slide: ReviewSlide }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<
    Array<{ x: number; y: number; fx?: number | null; fy?: number | null; r: number; fontSize: number; value: any }>
  >([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const genreCloud: Array<{ name: string; count: number; avgScore?: number }> = slide.stats?.genreCloud || [];
  const topGenres = useMemo(() => genreCloud.slice(0, 8), [genreCloud]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        setDimensions({ width: cr.width, height: cr.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0 || genreCloud.length === 0) return;

    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const maxCount = genreCloud[0].count;
    const minCount = genreCloud[genreCloud.length - 1].count;

    const radiusScale = scaleLinear().domain([minCount, maxCount]).range([28, 90]).clamp(true);
    const fontScale = scaleLinear().domain([minCount, maxCount]).range([10, 26]).clamp(true);

    // Spread nodes randomly over the whole container so they don't start on top of each other
    const initialNodes = genreCloud.map((g) => ({
      x: cx + (Math.random() - 0.5) * dimensions.width * 0.8,
      y: cy + (Math.random() - 0.5) * dimensions.height * 0.8,
      r: radiusScale(g.count),
      fontSize: fontScale(g.count),
      value: g,
    }));

    const sim = forceSimulation(initialNodes as any)
      .force("charge", forceManyBody().strength(-120))
      .force(
        "collide",
        forceCollide()
          .radius((d: any) => d.r + 6)
          .strength(0.9)
          .iterations(3)
      )
      .force("x", forceX(cx).strength(0.08))
      .force("y", forceY(cy).strength(0.08))
      .alphaDecay(0.03)
      .velocityDecay(0.3);

    // Pre-run so nodes are already spread when first rendered
    sim.tick(120);

    // Then copy final positions into React state
    setNodes(initialNodes.map((n) => ({ ...n })));

    // Warm-up for a short while
    sim
      .alpha(0.3)
      .on("tick", () => {
        setNodes(initialNodes.map((n) => ({ ...n })));
      })
      .restart();

    return () => {
      sim.stop();
    };
  }, [dimensions.width, dimensions.height, genreCloud]);

  // Build connecting lines between top genres within distance threshold
  const lines = useMemo(() => {
    if (!nodes.length) return [];
    const threshold = 250;
    const result: Array<{ x1: number; y1: number; x2: number; y2: number; opacity: number }> = [];
    for (let i = 0; i < topGenres.length; i++) {
      const a = nodes.find((n) => n.value.name === topGenres[i].name);
      if (!a) continue;
      for (let j = i + 1; j < topGenres.length; j++) {
        const b = nodes.find((n) => n.value.name === topGenres[j].name);
        if (!b) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < threshold) {
          const fade = 1 - dist / threshold;
          result.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, opacity: fade * 0.25 });
        }
      }
    }
    return result;
  }, [nodes, topGenres]);

  const maxCount = genreCloud.length > 0 ? genreCloud[0].count : 1;

  return (
    <div className="w-full h-[50vh] flex flex-col items-center justify-center review-fade-up" style={{ animationDelay: "300ms" }}>
      {/* Main bubble area */}
      <div ref={containerRef} className="relative w-full h-full max-w-xl">
        {/* Background web pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="web-pattern" width="60" height="60" patternUnits="userSpaceOnUse">
                <circle cx="0" cy="0" r="1" fill="white" />
                <circle cx="60" cy="0" r="1" fill="white" />
                <circle cx="0" cy="60" r="1" fill="white" />
                <circle cx="60" cy="60" r="1" fill="white" />
                <circle cx="30" cy="30" r="1" fill="white" />
                <line x1="0" y1="0" x2="60" y2="60" stroke="white" strokeWidth="0.5" />
                <line x1="60" y1="0" x2="0" y2="60" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#web-pattern)" />
          </svg>
        </div>

        {/* Connecting lines between top N */}
        <svg className="absolute inset-0 pointer-events-none overflow-visible">
          {lines.map((line, i) => (
            <line
              key={i}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="white"
              strokeWidth="1"
              opacity={line.opacity}
              className="genre-cloud-line"
            />
          ))}
        </svg>

        {/* Bubbles */}
        {nodes.map((node, i) => {
          const genre = node.value;
          const isHovered = hoveredIndex === i;
          const isTop = topGenres.some((tg) => tg.name === genre.name);
          // White-to-primary subtle tint depending on size
          const intensity = Math.min(genre.count / maxCount, 1);

          return (
            <div
              key={genre.name}
              className="absolute flex items-center justify-center rounded-full cursor-default transition-transform duration-300"
              style={{
                left: node.x,
                top: node.y,
                width: node.r * 2,
                height: node.r * 2,
                transform: `translate(-50%, -50%) scale(${isHovered ? 1.15 : 1})`,
                backgroundColor: `rgba(255, 255, 255, ${0.08 + intensity * 0.12})`,
                border: `1.5px solid rgba(255, 255, 255, ${0.15 + intensity * 0.25})`,
                boxShadow: isTop
                  ? `0 0 ${20 + intensity * 30}px rgba(139, 92, 246, ${0.15 + intensity * 0.15})`
                  : `0 0 ${10 + intensity * 15}px rgba(255, 255, 255, ${0.05 + intensity * 0.05})`,
                zIndex: isHovered ? 10 : Math.round(intensity * 5),
              }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span
                className="text-center px-1 font-medium leading-tight select-none"
                style={{
                  fontSize: node.fontSize,
                  color: `rgba(255, 255, 255, ${0.7 + intensity * 0.3})`,
                  textWrap: "balance",
                  wordBreak: "break-word",
                }}
              >
                {genre.name}
              </span>

              {/* Hover tooltip */}
              {isHovered && (
                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5 text-xs text-white whitespace-nowrap pointer-events-none border border-white/10">
                  <span className="font-semibold">{genre.count}</span> {genre.count === 1 ? "entry" : "entries"}
                  {genre.avgScore ? ` · ${genre.avgScore} avg` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopFranchiseSlide({ slide }: { slide: ReviewSlide }) {
  const { topFranchise, franchises } = slide.stats!;
  return (
    <div className="flex flex-col items-center justify-center gap-8 px-8">
      <div className="review-fade-up text-center" style={{ animationDelay: "200ms" }}>
        <div className="text-6xl font-black text-white drop-shadow-2xl">{topFranchise.name}</div>
        <p className="text-xl text-white/80 mt-2">{topFranchise.count} entries deep</p>
      </div>

      {franchises.length > 1 && (
        <div className="flex flex-wrap justify-center gap-2 review-fade-up" style={{ animationDelay: "600ms" }}>
          {franchises.slice(1).map((f: any) => (
            <div key={f.name} className="bg-white/10 rounded-lg px-3 py-1.5 text-sm text-white/80">
              {f.name} ({f.count})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RatingBreakdownSlide({ slide }: { slide: ReviewSlide }) {
  const { ratingBars, avgScore, totalRated, mostCommon } = slide.stats!;
  const maxCount = Math.max(...ratingBars.map((r: any) => r.count));

  return (
    <div className="flex flex-col items-center justify-center gap-8 px-8">
      <div className="review-fade-up text-center" style={{ animationDelay: "200ms" }}>
        <div className="text-6xl font-black text-white drop-shadow-2xl">{avgScore}</div>
        <p className="text-lg text-white/70 mt-1">average score across {totalRated} rated entries</p>
      </div>

      {/* Horizontal bar chart */}
      <div className="w-full max-w-sm space-y-2 review-fade-up" style={{ animationDelay: "500ms" }}>
        {ratingBars.map((r: any, i: number) => {
          const width = maxCount > 0 ? (r.count / maxCount) * 100 : 0;
          const isMost = r.rating === mostCommon;
          return (
            <div key={r.rating} className="flex items-center gap-3" style={{ animationDelay: `${500 + i * 60}ms` }}>
              <span className={cn("w-6 text-right text-sm font-bold", isMost ? "text-white" : "text-white/50")}>
                {r.rating}
              </span>
              <div className="flex-1 h-5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-1000 ease-out",
                    isMost ? "bg-white" : "bg-white/40"
                  )}
                  style={{ width: `${Math.max(width, r.count > 0 ? 3 : 0)}%`, transitionDelay: `${500 + i * 60}ms` }}
                />
              </div>
              <span className={cn("w-6 text-sm", isMost ? "text-white font-bold" : "text-white/40")}>
                {r.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AwardWinnersSlide({ slide }: { slide: ReviewSlide }) {
  const awards = slide.stats?.awards || [];

  return (
    <div className="flex flex-col items-center justify-center gap-6 px-8">
      <div className="w-full max-w-md space-y-3 max-h-[50vh] overflow-y-auto custom-scrollbar review-fade-up" style={{ animationDelay: "400ms" }}>
        {awards.map((a: any, i: number) => (
          <div
            key={i}
            className="flex items-center gap-4 bg-white/10 backdrop-blur-sm rounded-xl p-3 review-fade-up"
            style={{ animationDelay: `${400 + i * 100}ms` }}
          >
            <Trophy size={20} className="text-amber-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/50 uppercase tracking-wider font-medium">{a.category}</p>
              <p className="text-white font-semibold truncate">{a.winner}</p>
            </div>
            {a.score && (
              <div className="text-white/60 text-sm font-medium flex-shrink-0">{a.score}/10</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FinaleSlide({ slide }: { slide: ReviewSlide }) {
  const stats = slide.stats!;
  const entries = slide.entries || [];

  return (
    <div className="flex flex-col items-center justify-center gap-8 px-8">
      {entries.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3 review-fade-up max-w-3xl" style={{ animationDelay: "300ms" }}>
          {entries.map((entry, i) => (
            <EntryThumb key={entry.id} entry={entry} size="sm" delay={300 + i * 60} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-6 review-fade-up" style={{ animationDelay: "700ms" }}>
        <div className="text-center">
          <div className="text-4xl font-black text-white"><AnimatedNumber value={stats.totalEntries} duration={1500} /></div>
          <p className="text-xs text-white/60 mt-1">entries</p>
        </div>
        <div className="text-center">
          <div className="text-4xl font-black text-white">{stats.avgScore}</div>
          <p className="text-xs text-white/60 mt-1">avg score</p>
        </div>
        <div className="text-center">
          <div className="text-4xl font-black text-white"><AnimatedNumber value={stats.perfectCount} duration={1500} /></div>
          <p className="text-xs text-white/60 mt-1">perfect 10s</p>
        </div>
        <div className="text-center">
          <div className="text-4xl font-black text-white"><AnimatedNumber value={stats.uniqueTypes} duration={1500} /></div>
          <p className="text-xs text-white/60 mt-1">media types</p>
        </div>
      </div>
    </div>
  );
}

// ─── Slide Renderer Dispatch ─────────────────────────────────────────────────

function SlideContent({ slide }: { slide: ReviewSlide }) {
  switch (slide.type) {
    case "overview": return <OverviewSlide slide={slide} />;
    case "type-champion": return <TypeChampionSlide slide={slide} />;
    case "biggest-month": return <BiggestMonthSlide slide={slide} />;
    case "perfect-tens": return <PerfectTensSlide slide={slide} />;
    case "top-genre": return <TopGenreSlide slide={slide} />;
    case "genre-cloud": return <GenreCloudSlide slide={slide} />;
    case "top-franchise": return <TopFranchiseSlide slide={slide} />;
    case "rating-breakdown": return <RatingBreakdownSlide slide={slide} />;
    case "award-winners": return <AwardWinnersSlide slide={slide} />;
    case "finale": return <FinaleSlide slide={slide} />;
    case "empty": return null;
    default: return null;
  }
}

// ─── Full-Screen Presentation ────────────────────────────────────────────────

function Presentation({ data, onClose }: { data: ReviewData; onClose: () => void }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [, setDirection] = useState<"left" | "right">("right");
  const [slideKey, setSlideKey] = useState(0); // force re-mount for animations
  const [backgroundUrls, setBackgroundUrls] = useState<Record<string, string>>({});

  const slides = data.slides;
  const slide = slides[currentSlide];
  const theme = SLIDE_THEMES[slide.type] || SLIDE_THEMES["overview"];
  const SlideIcon = SLIDE_ICONS[slide.type] || Sparkles;
  const backgroundSrc = slide.backgroundImagePath ? backgroundUrls[slide.backgroundImagePath] : undefined;

  useEffect(() => {
    let cancelled = false;
    const backgroundPaths = [...new Set(
      data.slides
        .map(reviewSlide => reviewSlide.backgroundImagePath)
        .filter((path): path is string => typeof path === "string" && path.trim().length > 0)
    )];

    if (backgroundPaths.length === 0) {
      setBackgroundUrls({});
      return;
    }

    setBackgroundUrls({});

    Promise.all(
      backgroundPaths.map(async (path) => {
        const resolvedUrl = await getImageUrl(path);
        return [path, resolvedUrl] as const;
      })
    ).then((results) => {
      if (cancelled) return;

      const nextBackgroundUrls: Record<string, string> = {};
      results.forEach(([path, resolvedUrl]) => {
        if (resolvedUrl && resolvedUrl !== DEFAULT_COVER_IMAGE) {
          nextBackgroundUrls[path] = resolvedUrl;
        }
      });

      setBackgroundUrls(nextBackgroundUrls);
    });

    return () => {
      cancelled = true;
    };
  }, [data]);

  const goTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= slides.length) return;
    setDirection(idx > currentSlide ? "right" : "left");
    setCurrentSlide(idx);
    setSlideKey(k => k + 1);
  }, [currentSlide, slides.length]);

  const next = useCallback(() => goTo(currentSlide + 1), [goTo, currentSlide]);
  const prev = useCallback(() => goTo(currentSlide - 1), [goTo, currentSlide]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [next, prev, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col">
      <div className="absolute inset-0 overflow-hidden">
        {backgroundSrc && (
          <img
            key={`bg-image-${slideKey}-${slide.backgroundImagePath}`}
            src={backgroundSrc}
            alt=""
            aria-hidden="true"
            className="absolute inset-[-5%] h-[110%] w-[110%] max-w-none object-cover scale-110 blur-xl saturate-125 transition-all duration-700"
          />
        )}

        <div
          key={`bg-gradient-${slideKey}`}
          className={cn(
            "absolute inset-0 bg-gradient-to-br transition-all duration-700",
            theme.gradient,
            "review-gradient-bg",
            backgroundSrc ? "opacity-45" : "opacity-100"
          )}
        />
        <div className={cn("absolute inset-0", backgroundSrc ? "bg-black/28" : "bg-black/20")} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_40%),linear-gradient(180deg,rgba(0,0,0,0.04),rgba(0,0,0,0.22))]" />
      </div>

      {/* Floating orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-white/5 rounded-full blur-3xl review-float" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-white/5 rounded-full blur-3xl review-float-delayed" />
        <div className="absolute top-1/3 right-1/4 w-48 h-48 bg-white/3 rounded-full blur-2xl review-float-slow" />
      </div>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="text-white/60 text-sm font-medium">
          {data.period.label}
        </div>

        {/* Progress bar */}
        <div className="flex gap-1.5 absolute left-1/2 -translate-x-1/2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === currentSlide ? "w-8 bg-white" : "w-2 bg-white/30 hover:bg-white/50"
              )}
            />
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
        >
          <X size={20} />
        </button>
      </div>

      {/* Slide content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
        {/* Slide icon */}
        <div className="review-scale-reveal mb-2" key={`icon-${slideKey}`}>
          <SlideIcon size={32} className="text-white/40" />
        </div>

        {/* Title */}
        <h1
          key={`title-${slideKey}`}
          className="text-4xl md:text-5xl font-black text-white text-center mb-2 review-fade-up px-8"
          style={{ animationDelay: "100ms" }}
        >
          {slide.title}
        </h1>

        {/* Subtitle */}
        {slide.subtitle && (
          <p
            key={`sub-${slideKey}`}
            className="text-lg text-white/70 text-center max-w-lg mb-8 review-fade-up px-8"
            style={{ animationDelay: "200ms" }}
          >
            {slide.subtitle}
          </p>
        )}

        {/* Dynamic content */}
        <div key={`content-${slideKey}`} className="w-full max-w-2xl">
          <SlideContent slide={slide} />
        </div>
      </div>

      {/* Navigation arrows */}
      <div className="relative z-10 flex items-center justify-between px-6 pb-6">
        <button
          onClick={prev}
          disabled={currentSlide === 0}
          className={cn(
            "w-12 h-12 flex items-center justify-center rounded-full transition-all",
            currentSlide === 0
              ? "text-white/20 cursor-not-allowed"
              : "bg-white/10 hover:bg-white/20 text-white"
          )}
        >
          <ChevronLeft size={24} />
        </button>

        <span className="text-white/40 text-sm font-medium">
          {currentSlide + 1} / {slides.length}
        </span>

        <button
          onClick={currentSlide === slides.length - 1 ? onClose : next}
          className="w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
        >
          {currentSlide === slides.length - 1 ? <X size={24} /> : <ChevronRight size={24} />}
        </button>
      </div>
    </div>,
    document.body
  );
}

// ─── Setup Screen ────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null); // null = full year
  const [selectedTypes, setSelectedTypes] = useState<string[]>(getVisibleEntryTypes);
  const [activePreset, setActivePreset] = useState<ActiveFilterPresetKey>(null);
  const [loading, setLoading] = useState(false);
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);

  useEffect(() => {
    getReviewYears().then(y => {
      setYears(y);
      if (y.length > 0 && !selectedYear) setSelectedYear(y[0]);
    });
  }, []);

  const handlePreset = (key: FilterPresetKey) => {
    if (activePreset === key) {
      setActivePreset(null);
      setSelectedTypes(getVisibleEntryTypes());
    } else {
      setActivePreset(key);
      setSelectedTypes(FILTER_PRESETS[key].types);
    }
  };

  const toggleType = (type: string) => {
    setActivePreset(null);
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const handleGenerate = async () => {
    if (!selectedYear || selectedTypes.length === 0) return;
    setLoading(true);
    try {
      const data = await generateReview({
        year: selectedYear,
        month: selectedMonth ?? undefined,
        typeFilter: selectedTypes,
      });
      setReviewData(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto" style={{ animation: "fadeIn 0.5s ease-out" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
          <Sparkles size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Year in Review</h1>
          <p className="text-sm text-gray-400">Generate your personalized media wrapped</p>
        </div>
      </div>

      {/* Year Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-400 mb-2">Year</label>
        <div className="flex flex-wrap gap-2">
          {years.map(year => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-semibold transition-all",
                selectedYear === year
                  ? "bg-primary text-white shadow-lg shadow-primary/25 scale-105"
                  : "bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10"
              )}
            >
              {year}
            </button>
          ))}
          {years.length === 0 && (
            <p className="text-gray-500 text-sm">No years with entries found</p>
          )}
        </div>
      </div>

      {/* Month Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-400 mb-2">Period</label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedMonth(null)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-semibold transition-all",
              selectedMonth === null
                ? "bg-primary text-white shadow-lg shadow-primary/25 scale-105"
                : "bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10"
            )}
          >
            Full Year
          </button>
          {MONTH_NAMES.map((name, i) => (
            <button
              key={i}
              onClick={() => setSelectedMonth(i + 1)}
              className={cn(
                "px-3 py-2 rounded-xl text-sm font-medium transition-all",
                selectedMonth === i + 1
                  ? "bg-primary text-white shadow-lg shadow-primary/25 scale-105"
                  : "bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10"
              )}
            >
              {name.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      {/* Type Filter */}
      <div className="mb-8">
        <label className="block text-sm font-medium text-gray-400 mb-2">Media Types</label>

        {/* Presets */}
        <div className="flex gap-2 mb-3">
          {getVisiblePresetKeys().map(key => {
            const preset = FILTER_PRESETS[key];
            const Icon = preset.icon;
            const isActive = activePreset === key;
            return (
              <button
                key={key}
                onClick={() => handlePreset(key)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border",
                  isActive
                    ? "bg-primary/20 border-primary/40 text-white scale-105"
                    : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                )}
              >
                <Icon size={16} />
                {preset.label}
              </button>
            );
          })}
          <button
            onClick={() => { setActivePreset(null); setSelectedTypes(getVisibleEntryTypes()); }}
            className={cn(
              "px-3 py-2 rounded-xl text-sm font-medium transition-all border",
              selectedTypes.length === getVisibleEntryTypes().length && !activePreset
                ? "bg-primary/20 border-primary/40 text-white scale-105"
                : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
            )}
          >
            All
          </button>
        </div>

        {/* Individual type checkboxes */}
        <div className="flex flex-wrap gap-2">
          {getVisibleEntryTypes().map(type => {
            const isSelected = selectedTypes.includes(type);
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm transition-all",
                  isSelected
                    ? "bg-white/15 text-white font-medium"
                    : "bg-white/5 text-gray-500 hover:text-gray-300"
                )}
              >
                {type}
              </button>
            );
          })}
        </div>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={!selectedYear || selectedTypes.length === 0 || loading}
        className={cn(
          "w-full py-4 rounded-2xl text-lg font-bold transition-all flex items-center justify-center gap-3",
          !selectedYear || selectedTypes.length === 0 || loading
            ? "bg-white/5 text-gray-500 cursor-not-allowed"
            : "bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 text-white shadow-xl shadow-purple-500/20 hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98]"
        )}
      >
        {loading ? (
          <>
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Play size={20} className="fill-current" />
            Generate My {selectedMonth ? MONTH_NAMES[selectedMonth - 1] : selectedYear} Review
          </>
        )}
      </button>

      {/* Presentation overlay */}
      {reviewData && (
        <Presentation data={reviewData} onClose={() => setReviewData(null)} />
      )}
    </div>
  );
}
