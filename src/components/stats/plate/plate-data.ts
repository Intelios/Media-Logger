import type { MediaEntry } from "../../../lib/db";
import {
  buildFullStatsFromDataset,
  createStatsDataset,
  selectTimelineSeries,
  type FullStats,
  type TimelineBucket,
} from "../../../lib/stats-logic";

// An inclusive calendar range, both bounds stored as "YYYY-MM-DD" so they compare
// lexicographically against MediaEntry.completion_date without any Date parsing.
export interface StatsRange {
  from: string;
  to: string;
}

// One draggable cell in the brush strip beneath the timeline. A cell is a week
// when a specific year is active and a whole year on All Time, so the brush
// granularity always matches the granularity of the chart above it.
export interface BrushCell {
  key: string;
  from: string;
  to: string;
  count: number;
  /** Busiest single day in the cell — the strip marks only exceptional ones. */
  peakDayCount: number;
  label: string;
}

/**
 * Two logs in a day is ordinary in an active year — marking every such week
 * turns the whole strip one colour and destroys the density read. Three is rare
 * enough to be worth flagging.
 */
export const BUSY_DAY_THRESHOLD = 3;

export interface PlateData {
  stats: FullStats;
  timeline: TimelineBucket[];
  granularity: "month" | "year";
  brushCells: BrushCell[];
  /** Entries inside the active range — what every panel and figure is derived from. */
  rangedEntries: MediaEntry[];
  /** True distinct genre count, uncapped by the 25-item display list. */
  genreCount: number;
}

export interface PlateComparison {
  year: string;
  stats: FullStats;
  timeline: TimelineBucket[];
  genreCount: number;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCellLabel(from: string, to: string): string {
  if (from === to) {
    return from;
  }

  return `${from} → ${to}`;
}

export function isAllTime(activeYear: string): boolean {
  return activeYear === "All Time";
}

export function getGranularity(activeYear: string): "month" | "year" {
  return isAllTime(activeYear) ? "year" : "month";
}

export function filterEntriesByRange(entries: MediaEntry[], range: StatsRange | null): MediaEntry[] {
  if (!range) {
    return entries;
  }

  return entries.filter((entry) => {
    const date = entry.completion_date;
    // Undated entries cannot belong to a range; they only appear in the unbrushed view.
    return typeof date === "string" && date >= range.from && date <= range.to;
  });
}

/**
 * Type filtering happens in memory rather than in SQL so the toolbar can show a
 * live count on every chip — including the types you have switched off — and so
 * toggling a type never costs a query.
 */
export function filterEntriesByTypes(entries: MediaEntry[], selectedTypes: string[]): MediaEntry[] {
  if (selectedTypes.length === 0) {
    return [];
  }

  const allowed = new Set(selectedTypes);
  return entries.filter((entry) => typeof entry.entry_type === "string" && allowed.has(entry.entry_type));
}

function splitDelimited(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * selectGenres caps its list at 25 for display, so the headline genre count has
 * to be counted separately or it silently plateaus at 25.
 */
export function countDistinctGenres(entries: MediaEntry[]): number {
  const genres = new Set<string>();

  for (const entry of entries) {
    for (const genre of splitDelimited(entry.genre)) {
      genres.add(genre);
    }
  }

  return genres.size;
}

export function countEntriesByType(entries: MediaEntry[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const type = entry.entry_type;
    if (!type) {
      continue;
    }

    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return counts;
}

function countsByDate(entries: MediaEntry[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const date = entry.completion_date?.trim();
    if (!date) {
      continue;
    }

    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  return counts;
}

// Weekly cells covering the whole calendar year, Sunday-aligned like the old
// completion heatmap so a cell always represents the same seven weekdays.
function buildWeekCells(entries: MediaEntry[], year: number): BrushCell[] {
  const counts = countsByDate(entries);
  const cells: BrushCell[] = [];

  const cursor = new Date(year, 0, 1);
  cursor.setDate(cursor.getDate() - cursor.getDay());

  const yearEnd = new Date(year, 11, 31);

  while (cursor <= yearEnd) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Clamp to the calendar year so the first and last cells never leak into
    // the neighbouring years when the year does not start on a Sunday.
    const from = weekStart.getFullYear() < year ? formatDate(new Date(year, 0, 1)) : formatDate(weekStart);
    const to = weekEnd.getFullYear() > year ? formatDate(yearEnd) : formatDate(weekEnd);

    let count = 0;
    let peakDayCount = 0;
    const day = new Date(weekStart);

    while (day <= weekEnd) {
      const dayCount = counts.get(formatDate(day)) ?? 0;
      count += dayCount;
      peakDayCount = Math.max(peakDayCount, dayCount);
      day.setDate(day.getDate() + 1);
    }

    cells.push({
      key: from,
      from,
      to,
      count,
      peakDayCount,
      label: formatCellLabel(from, to),
    });

    cursor.setDate(cursor.getDate() + 7);
  }

  return cells;
}

// One cell per year that actually has entries, so All Time brushes by year and
// lines up with the year-granularity chart above it.
function buildYearCells(entries: MediaEntry[]): BrushCell[] {
  const perYear = new Map<string, number>();

  for (const [date, count] of countsByDate(entries)) {
    const year = date.slice(0, 4);
    perYear.set(year, (perYear.get(year) ?? 0) + count);
  }

  return [...perYear.entries()]
    .sort(([leftYear], [rightYear]) => leftYear.localeCompare(rightYear))
    .map(([year, count]) => ({
      key: year,
      from: `${year}-01-01`,
      to: `${year}-12-31`,
      count,
      // A day-level signal says nothing at year resolution.
      peakDayCount: 0,
      label: year,
    }));
}

export function buildBrushCells(entries: MediaEntry[], activeYear: string): BrushCell[] {
  if (isAllTime(activeYear)) {
    return buildYearCells(entries);
  }

  const year = Number(activeYear);
  if (!Number.isFinite(year)) {
    return [];
  }

  return buildWeekCells(entries, year);
}

export function rangeFromCells(cells: BrushCell[], startIndex: number, endIndex: number): StatsRange | null {
  const low = Math.min(startIndex, endIndex);
  const high = Math.max(startIndex, endIndex);
  const first = cells[low];
  const last = cells[high];

  if (!first || !last) {
    return null;
  }

  return { from: first.from, to: last.to };
}

export function isCellInRange(cell: BrushCell, range: StatsRange | null): boolean {
  if (!range) {
    return false;
  }

  return cell.to >= range.from && cell.from <= range.to;
}

/**
 * Everything the plate renders, derived in memory from one already-fetched row
 * set. Brushing re-runs this and nothing else — there is no query behind it.
 */
export function derivePlateData(
  entries: MediaEntry[],
  activeYear: string,
  selectedTypes: string[],
  range: StatsRange | null
): PlateData {
  const granularity = getGranularity(activeYear);
  const rangedEntries = filterEntriesByRange(entries, range);
  const dataset = createStatsDataset(rangedEntries);

  return {
    stats: buildFullStatsFromDataset(dataset, { year: activeYear, types: selectedTypes }),
    timeline: selectTimelineSeries(createStatsDataset(entries), granularity),
    granularity,
    // The brush strip always shows the whole year so you can see what you are
    // selecting from, even while a narrower range is active.
    brushCells: buildBrushCells(entries, activeYear),
    rangedEntries,
    genreCount: countDistinctGenres(rangedEntries),
  };
}

/**
 * Shifts an active range onto the comparison year so "Jul–Sep vs last year"
 * compares the same months rather than the same absolute dates.
 */
export function projectRangeOntoYear(range: StatsRange | null, year: string): StatsRange | null {
  if (!range) {
    return null;
  }

  return {
    from: `${year}${range.from.slice(4)}`,
    to: `${year}${range.to.slice(4)}`,
  };
}

export function deriveComparison(
  comparisonEntries: MediaEntry[],
  comparisonYear: string,
  selectedTypes: string[],
  range: StatsRange | null
): PlateComparison {
  const projected = projectRangeOntoYear(range, comparisonYear);
  const rangedEntries = filterEntriesByRange(comparisonEntries, projected);

  return {
    year: comparisonYear,
    stats: buildFullStatsFromDataset(createStatsDataset(rangedEntries), {
      year: comparisonYear,
      types: selectedTypes,
    }),
    timeline: selectTimelineSeries(createStatsDataset(comparisonEntries), "month"),
    genreCount: countDistinctGenres(rangedEntries),
  };
}
