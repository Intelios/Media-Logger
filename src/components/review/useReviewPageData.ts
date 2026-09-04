import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dbService, type StatsEntry } from "../../lib/db";
import { mediaQueryKeys, queryClient } from "../../lib/query-client";
import {
  assembleReel,
  buildReviewContext,
  getReviewAwards,
  getReviewNote,
  getReviewYearCovers,
  getReviewYearTypeTotals,
  selectYearTotals,
  type AssembledReel,
  type ReviewAward,
  type ReviewContext,
  type ReviewYearCoverRow,
  type ReviewYearTotal,
  type ReviewYearTypeRow,
} from "../../lib/review-logic";

/**
 * Everything the Review page needs, on the Stats contract: one thin per-year
 * row fetch (sharing the Stats screen's cache key) plus three cross-year
 * lookups. Type and month filtering are pure derivations over rows already in
 * memory, so the Customise sheet costs no queries at all.
 */

interface CrossYearData {
  yearTypeRows: ReviewYearTypeRow[];
  covers: ReviewYearCoverRow[];
}

/**
 * True when `noteEntryId` is the year's top-rated entry — the one the note was
 * fetched for. Single pass, score descending with id as the tiebreak, matching
 * the selector in lib/review/context.ts exactly.
 */
function ctxTopIdMatches(entries: StatsEntry[], noteEntryId: number | null): boolean {
  if (noteEntryId == null) return false;
  let topId: number | null = null;
  let topScore = Number.NEGATIVE_INFINITY;
  for (const entry of entries) {
    if (entry.review_score == null) continue;
    if (entry.review_score > topScore || (entry.review_score === topScore && entry.id > (topId ?? 0))) {
      topScore = entry.review_score;
      topId = entry.id;
    }
  }
  return topId === noteEntryId;
}

export interface ReviewPageData {
  /** Years that have entries, newest first, under the current type filter. */
  years: ReviewYearTotal[];
  year: number | null;
  setYear: (year: number) => void;
  month: number | null;
  setMonth: (month: number | null) => void;
  typeFilter: string[];
  setTypeFilter: (types: string[]) => void;
  /** Null until the first year's rows land. */
  ctx: ReviewContext | null;
  reel: AssembledReel | null;
  /** Completion counts per month for the selected year, index 0 = January. */
  monthCounts: number[];
  loading: boolean;
  /** Fetches the signature chapter's note; resolves once ctx carries it. */
  loadNote: () => Promise<void>;
}

export function useReviewPageData(initialTypes: string[]): ReviewPageData {
  const [cross, setCross] = useState<CrossYearData | null>(null);
  const [year, setYearState] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string[]>(initialTypes);
  const [entries, setEntries] = useState<StatsEntry[]>([]);
  const [awards, setAwards] = useState<ReviewAward[]>([]);
  const [topNote, setTopNote] = useState<string | null>(null);
  // The entry the note belongs to — guarding it from attaching to any other.
  const [topNoteEntryId, setTopNoteEntryId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Guards against a slower earlier year overwriting a newer selection.
  const loadIdRef = useRef(0);

  // ── Cross-year lookups: once per mount, invalidated by the entries bridge ──
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      queryClient.fetchQuery({
        queryKey: mediaQueryKeys.reviewYearTotals(),
        queryFn: () => getReviewYearTypeTotals(),
      }),
      queryClient.fetchQuery({
        queryKey: mediaQueryKeys.reviewYearCovers(),
        queryFn: () => getReviewYearCovers(),
      }),
    ])
      .then(([yearTypeRows, covers]) => {
        if (cancelled) return;
        setCross({ yearTypeRows, covers });
        // Default to the most recent year that has anything in it.
        const totals = selectYearTotals(yearTypeRows, initialTypes, covers);
        if (totals.length > 0) setYearState((current) => current ?? totals[0].year);
        else setLoading(false);
      })
      .catch((error) => {
        console.error("Failed to load review year totals:", error);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // initialTypes is a mount-time default; changing the filter must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Per-year rows + awards ────────────────────────────────────────────────
  useEffect(() => {
    if (year == null) return;
    const id = ++loadIdRef.current;
    setLoading(true);
    setTopNote(null);
    setTopNoteEntryId(null);

    void Promise.all([
      queryClient.fetchQuery({
        // Deliberately the Stats screen's own key: same year, same projection,
        // no type filter in the SQL. Sharing it means opening Review after
        // Stats (or the reverse) costs nothing.
        queryKey: mediaQueryKeys.statsForYear(String(year)),
        queryFn: () => dbService.getStatsEntries(String(year)),
      }),
      queryClient.fetchQuery({
        queryKey: mediaQueryKeys.reviewAwards(year),
        queryFn: () => getReviewAwards(year),
      }),
    ])
      .then(([rows, yearAwards]) => {
        if (loadIdRef.current !== id) return;
        setEntries(rows);
        setAwards(yearAwards);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Failed to load review data:", error);
        if (loadIdRef.current === id) setLoading(false);
      });
  }, [year]);

  const setYear = useCallback((next: number) => {
    setYearState(next);
    setMonth(null);
  }, []);

  const ctx = useMemo(() => {
    if (year == null || !cross) return null;
    // The note is only shown for the entry it was fetched for. It is loaded
    // once per year against that year's unfiltered top entry, so a month or
    // type selection can never attach it to a different entry.
    const carriesNote = topNote != null && ctxTopIdMatches(entries, topNoteEntryId);
    return buildReviewContext({
      params: { year, month: month ?? undefined, typeFilter },
      entries,
      yearTypeRows: cross.yearTypeRows,
      awards,
      topNote: carriesNote ? topNote : null,
    });
    // A fresh context re-runs the backdrop picker, which is what we want on a
    // filter change — the surviving chapter set has changed too.
  }, [year, month, typeFilter, entries, cross, awards, topNote, topNoteEntryId]);

  const reel = useMemo(() => (ctx ? assembleReel(ctx) : null), [ctx]);

  const years = useMemo(
    () => (cross ? selectYearTotals(cross.yearTypeRows, typeFilter, cross.covers) : []),
    [cross, typeFilter],
  );

  // Month availability ignores the month selection itself, so the picker can
  // show every month that has something in it while one is already chosen.
  const monthCounts = useMemo(() => {
    const counts = new Array(12).fill(0);
    if (year == null) return counts;
    const allowed = new Set(typeFilter);
    for (const entry of entries) {
      if (entry.entry_type != null && !allowed.has(entry.entry_type)) continue;
      const date = entry.completion_date;
      if (typeof date !== "string" || !date.startsWith(`${year}-`)) continue;
      const index = Number(date.slice(5, 7)) - 1;
      if (index >= 0 && index < 12) counts[index] += 1;
    }
    return counts;
  }, [entries, year, typeFilter]);

  const loadNote = useCallback(async () => {
    const entryId = ctx?.topEntry?.id;
    if (entryId == null) return;
    try {
      const note = await queryClient.fetchQuery({
        queryKey: mediaQueryKeys.reviewNote(entryId),
        queryFn: () => getReviewNote(entryId),
      });
      setTopNote(note);
      setTopNoteEntryId(entryId);
    } catch (error) {
      console.error("Failed to load review note:", error);
    }
  }, [ctx?.topEntry?.id]);

  return {
    years,
    year,
    setYear,
    month,
    setMonth,
    typeFilter,
    setTypeFilter,
    ctx,
    reel,
    monthCounts,
    loading,
    loadNote,
  };
}
