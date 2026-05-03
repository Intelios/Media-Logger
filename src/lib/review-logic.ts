import { dbService, type MediaEntry } from "./db";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReviewSlide {
  type: string;
  title: string;
  subtitle?: string;
  entries?: MediaEntry[];
  stats?: Record<string, any>;
  backgroundImagePath?: string | null;
}

export interface ReviewData {
  period: { year?: number; month?: number; label: string };
  typeFilter: string[];
  slides: ReviewSlide[];
}

export interface ReviewParams {
  year: number;
  month?: number; // 1-12, undefined = full year
  typeFilter: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function hasImage(entry: MediaEntry): entry is MediaEntry & { image_url: string } {
  return typeof entry.image_url === "string" && entry.image_url.trim().length > 0;
}

function pickRandomBackdrop(
  primaryEntries: MediaEntry[] | undefined,
  fallbackEntries: MediaEntry[],
  usedPaths: Set<string>,
): string | null {
  const primaryPaths = [...new Set((primaryEntries ?? []).filter(hasImage).map(entry => entry.image_url.trim()))];
  const fallbackPaths = [...new Set(fallbackEntries.filter(hasImage).map(entry => entry.image_url.trim()))];

  const pool = [
    primaryPaths.filter(path => !usedPaths.has(path)),
    primaryPaths,
    fallbackPaths.filter(path => !usedPaths.has(path)),
    fallbackPaths,
  ].find(paths => paths.length > 0);

  if (!pool || pool.length === 0) return null;

  const selectedPath = pool[Math.floor(Math.random() * pool.length)];
  usedPaths.add(selectedPath);
  return selectedPath;
}

function buildWhereClause(params: ReviewParams): { where: string; values: any[] } {
  const conditions: string[] = ["year_completed = $1"];
  const values: any[] = [params.year];

  if (params.month) {
    // Filter by month using completion_date
    const monthStr = params.month.toString().padStart(2, "0");
    const startDate = `${params.year}-${monthStr}-01`;
    const endMonth = params.month === 12 ? 1 : params.month + 1;
    const endYear = params.month === 12 ? params.year + 1 : params.year;
    const endDate = `${endYear}-${endMonth.toString().padStart(2, "0")}-01`;
    values.push(startDate, endDate);
    conditions.push(`completion_date >= $${values.length - 1} AND completion_date < $${values.length}`);
  }

  if (params.typeFilter.length > 0) {
    const placeholders = params.typeFilter.map((_, i) => `$${values.length + i + 1}`).join(", ");
    conditions.push(`entry_type IN (${placeholders})`);
    values.push(...params.typeFilter);
  }

  return { where: conditions.join(" AND "), values };
}

// Count items by field with average scores (mirrors stats-logic.ts pattern)
function countByField(entries: MediaEntry[], fieldName: keyof MediaEntry): { name: string; count: number; avgScore?: number; perfectCount: number }[] {
  const stats: Record<string, { count: number; totalScore: number; scoreCount: number; perfectCount: number }> = {};

  entries.forEach(e => {
    const value = e[fieldName] as string | null;
    if (!value) return;

    const values = value.includes(",") ? value.split(",").map(v => v.trim()) : [value.trim()];
    values.forEach(v => {
      if (!v) return;
      if (!stats[v]) stats[v] = { count: 0, totalScore: 0, scoreCount: 0, perfectCount: 0 };
      stats[v].count++;
      if (e.review_score) {
        stats[v].totalScore += e.review_score;
        stats[v].scoreCount++;
        if (e.review_score === 10) stats[v].perfectCount++;
      }
    });
  });

  return Object.entries(stats)
    .map(([name, data]) => ({
      name,
      count: data.count,
      avgScore: data.scoreCount > 0 ? Math.round((data.totalScore / data.scoreCount) * 10) / 10 : undefined,
      perfectCount: data.perfectCount,
    }))
    .sort((a, b) => b.count - a.count);
}

// ─── Main Generator ──────────────────────────────────────────────────────────

export async function generateReview(params: ReviewParams): Promise<ReviewData> {
  const db = await dbService.connect();
  const { where, values } = buildWhereClause(params);
  const entries = await db.select<MediaEntry[]>(`SELECT * FROM entries WHERE ${where}`, values);

  const periodLabel = params.month
    ? `${MONTH_NAMES[params.month - 1]} ${params.year}`
    : `${params.year}`;

  const slides: ReviewSlide[] = [];

  if (entries.length === 0) {
    slides.push({
      type: "empty",
      title: "Nothing Here Yet",
      subtitle: `No entries found for ${periodLabel} with the selected filters.`,
    });
    return { period: { year: params.year, month: params.month, label: periodLabel }, typeFilter: params.typeFilter, slides };
  }

  // ── 1. Overview ──────────────────────────────────────────────────────────
  const ratedEntries = entries.filter(e => e.review_score != null && e.review_score > 0);
  const avgScore = ratedEntries.length > 0
    ? Math.round((ratedEntries.reduce((sum, e) => sum + (e.review_score || 0), 0) / ratedEntries.length) * 10) / 10
    : 0;
  const uniqueTypes = [...new Set(entries.map(e => e.entry_type).filter(Boolean))];
  const rewatchCount = entries.filter(e => e.is_rewatch).length;

  slides.push({
    type: "overview",
    title: `Your ${periodLabel} in Review`,
    subtitle: `Let's look back at everything you experienced.`,
    stats: {
      totalEntries: entries.length,
      avgScore,
      uniqueTypes: uniqueTypes.length,
      typeNames: uniqueTypes,
      rewatchCount,
    },
  });

  // ── 2. Media Type Champion ───────────────────────────────────────────────
  const typeBreakdown = countByField(entries, "entry_type");
  if (typeBreakdown.length > 0) {
    slides.push({
      type: "type-champion",
      title: "Your Top Medium",
      subtitle: `${typeBreakdown[0].name} dominated with ${typeBreakdown[0].count} ${typeBreakdown[0].count === 1 ? "entry" : "entries"}.`,
      stats: {
        champion: typeBreakdown[0],
        breakdown: typeBreakdown,
        total: entries.length,
      },
    });
  }

  // ── 3. Biggest Month (year mode only) ────────────────────────────────────
  if (!params.month) {
    const monthCounts: Record<number, number> = {};
    entries.forEach(e => {
      if (e.completion_date) {
        try {
          const month = new Date(e.completion_date).getMonth(); // 0-11
          monthCounts[month] = (monthCounts[month] || 0) + 1;
        } catch { /* skip */ }
      }
    });

    const monthEntries = Object.entries(monthCounts);
    if (monthEntries.length > 0) {
      const [biggestMonthIdx, biggestCount] = monthEntries.reduce(
        (max, [m, c]) => (c > max[1] ? [m, c] : max),
        ["0", 0]
      );

      const allMonths = MONTH_SHORT.map((name, i) => ({
        month: name,
        count: monthCounts[i] || 0,
      }));

      // Get entries from the biggest month
      const biggestMonthNum = Number(biggestMonthIdx);
      const biggestMonthEntries = entries.filter(e => {
        if (!e.completion_date) return false;
        try { return new Date(e.completion_date).getMonth() === biggestMonthNum; } catch { return false; }
      });

      slides.push({
        type: "biggest-month",
        title: "Your Biggest Month",
        subtitle: `${MONTH_NAMES[biggestMonthNum]} was on fire with ${biggestCount} ${biggestCount === 1 ? "completion" : "completions"}.`,
        entries: biggestMonthEntries,
        stats: {
          biggestMonth: MONTH_NAMES[biggestMonthNum],
          biggestCount,
          allMonths,
        },
      });
    }
  }

  // ── 4. Perfect 10s ──────────────────────────────────────────────────────
  const perfectTens = entries.filter(e => e.review_score === 10);
  if (perfectTens.length > 0) {
    slides.push({
      type: "perfect-tens",
      title: "Perfect 10s",
      subtitle: perfectTens.length === 1
        ? `One masterpiece earned the highest honor.`
        : `${perfectTens.length} masterpieces earned the highest honor.`,
      entries: perfectTens,
      stats: { count: perfectTens.length },
    });
  }

  // ── 5. Top Genre ─────────────────────────────────────────────────────────
  const genreBreakdown = countByField(entries, "genre");
  if (genreBreakdown.length > 0) {
    slides.push({
      type: "top-genre",
      title: "Genre of Choice",
      subtitle: `${genreBreakdown[0].name} led the way with ${genreBreakdown[0].count} ${genreBreakdown[0].count === 1 ? "entry" : "entries"}${genreBreakdown[0].avgScore ? ` and a ${genreBreakdown[0].avgScore} average.` : "."}`,
      stats: {
        topGenre: genreBreakdown[0],
        topGenres: genreBreakdown.slice(0, 8),
      },
    });
  }

  // ── 6. Genre Cloud ───────────────────────────────────────────────────────
  if (genreBreakdown.length > 1) {
    const cloudGenres = genreBreakdown.slice(0, 35);
    slides.push({
      type: "genre-cloud",
      title: "Genre Cloud",
      subtitle: "Your media universe, visualized.",
      stats: {
        genreCloud: cloudGenres,
      },
    });
  }

  // ── 7. Most Replayed Franchise ───────────────────────────────────────────
  const franchiseBreakdown = countByField(entries, "franchise");
  if (franchiseBreakdown.length > 0 && franchiseBreakdown[0].count >= 2) {
    slides.push({
      type: "top-franchise",
      title: "Franchise Obsession",
      subtitle: `You kept coming back to ${franchiseBreakdown[0].name} — ${franchiseBreakdown[0].count} entries deep.`,
      stats: {
        topFranchise: franchiseBreakdown[0],
        franchises: franchiseBreakdown.slice(0, 5),
      },
    });
  }

  // ── 7. Rating Breakdown ──────────────────────────────────────────────────
  const ratingDist: Record<number, number> = {};
  ratedEntries.forEach(e => {
    const score = Math.round(e.review_score || 0);
    ratingDist[score] = (ratingDist[score] || 0) + 1;
  });
  const ratingBars = [];
  for (let i = 10; i >= 1; i--) {
    ratingBars.push({ rating: i, count: ratingDist[i] || 0 });
  }

  if (ratedEntries.length > 0) {
    // Find most common rating
    const mostCommon = ratingBars.reduce((max, r) => r.count > max.count ? r : max, ratingBars[0]);
    slides.push({
      type: "rating-breakdown",
      title: "How You Rated",
      subtitle: `Your most given score was ${mostCommon.rating}/10 (${mostCommon.count} times). Average: ${avgScore}/10.`,
      stats: { ratingBars, avgScore, totalRated: ratedEntries.length, mostCommon: mostCommon.rating },
    });
  }

  // ── 10. Award Winners (year mode) ────────────────────────────────────────
  if (!params.month) {
    try {
      const awardsRaw = await db.select<any[]>(
        `SELECT c.name as category_name, m.name as winner_name, m.image_url, m.entry_type, m.review_score
         FROM award_categories c
         JOIN award_winners w ON w.category_id = c.id
         JOIN entries m ON w.media_id = m.id
         WHERE c.year = $1
         ORDER BY c.sort_order ASC`,
        [params.year]
      );

      if (awardsRaw.length > 0) {
        slides.push({
          type: "award-winners",
          title: "Award Winners",
          subtitle: `${awardsRaw.length} ${awardsRaw.length === 1 ? "award was" : "awards were"} handed out in ${params.year}.`,
          stats: {
            awards: awardsRaw.map(a => ({
              category: a.category_name,
              winner: a.winner_name,
              imageUrl: a.image_url,
              entryType: a.entry_type,
              score: a.review_score,
            })),
          },
        });
      }
    } catch { /* awards tables might not have data */ }
  }

  // ── 11. Finale ───────────────────────────────────────────────────────────
  const topRated = [...ratedEntries].sort((a, b) => (b.review_score || 0) - (a.review_score || 0)).slice(0, 20);
  slides.push({
    type: "finale",
    title: `That Was ${periodLabel}`,
    subtitle: `${entries.length} entries. ${perfectTens.length} perfect scores. ${uniqueTypes.length} different types of media. What a ride.`,
    entries: topRated,
    stats: {
      totalEntries: entries.length,
      perfectCount: perfectTens.length,
      avgScore,
      uniqueTypes: uniqueTypes.length,
      rewatchCount,
    },
  });

  const entriesWithImages = entries.filter(hasImage);
  const usedBackdropPaths = new Set<string>();
  const slidesWithBackdrops = slides.map((slide) => ({
    ...slide,
    backgroundImagePath: pickRandomBackdrop(slide.entries, entriesWithImages, usedBackdropPaths),
  }));

  return {
    period: { year: params.year, month: params.month, label: periodLabel },
    typeFilter: params.typeFilter,
    slides: slidesWithBackdrops,
  };
}

// Get available years from the database
export async function getReviewYears(): Promise<number[]> {
  const db = await dbService.connect();
  const rows = await db.select<{ year_completed: number }[]>(
    "SELECT DISTINCT year_completed FROM entries WHERE year_completed IS NOT NULL ORDER BY year_completed DESC"
  );
  return rows.map(r => r.year_completed);
}
