import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { AnimatePresence, motion, type TargetAndTransition, type Transition } from "framer-motion";
import { useNavigate } from "react-router";
import { CalendarDays, Dices, Eye, Gamepad2, Pencil, RotateCcw, Shuffle, SlidersHorizontal, Trophy, User } from "lucide-react";
import { awardsLogic } from "../../lib/awards-logic";
import { dbService, type MediaEntry, type RandomPickFilters } from "../../lib/db";
import { getRatingColor, getReplayTerm, getTypeBadgeStyle, parseGenres } from "../../lib/media-config";
import { cn } from "../../lib/utils_ui";
import { CoverImage } from "../CoverImage";
import { EntryForm } from "../EntryForm";
import type { MediaAward } from "../MediaCard";
import { formatScore } from "../ScoreRangeSlider";

const LazyMediaCardDialogs = lazy(() => import("../MediaCardDialogs"));

/** Cards on the table per deal; the winner is always one of them. */
const FAN_SIZE = 7;
const CARD_RATIO = 1.5;
const FAN_STAGGER_S = 0.055;
const HOP_DURATION_MS = 1000;
/** Minimum time the previous deal takes to gather back into the deck. */
const GATHER_MS = 380;
const DETAILS_GAP = 44;
/** The fan sits a little above centre so the caption fits underneath. */
const FAN_LIFT = 28;
const EDGE_PAD = 48;

type DealStage = "gathering" | "fanning" | "hopping" | "revealed" | "empty" | "error";

interface Deal {
  id: number;
  fan: MediaEntry[];
  winnerSlot: number;
  /** New cards appear already visible when they replace a gathered deck. */
  fromDeck: boolean;
}

interface TableLayout {
  width: number;
  height: number;
  revealW: number;
  revealH: number;
  revealX: number;
  detailsLeft: number;
  detailsW: number;
  fanScale: number;
  spacing: number;
}

interface CardDealProps {
  filters: RandomPickFilters;
  matchCount: number | null;
  onAdjustFilters: () => void;
  onEntryChanged: () => void;
}

const prefersReducedMotion = (): boolean =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  // Fisher-Yates so the fan order isn't biased by SQL row order.
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Slots the highlight visits before landing on the winner. Built backwards
 * from the winner so consecutive hops never repeat a slot, and the winner is
 * only reached on the final hop.
 */
function buildHopSequence(count: number, winnerSlot: number): number[] {
  if (count < 2) return [winnerSlot];
  const ticks = clamp(count * 2, 5, 12);
  const sequence = [winnerSlot];
  while (sequence.length < ticks) {
    const next = sequence[0];
    let slot = Math.floor(Math.random() * (count - 1));
    if (slot >= next) slot += 1;
    sequence.unshift(slot);
  }
  return sequence;
}

/** Decelerating gaps (short early, long before landing) scaled to the hop duration. */
function hopGaps(ticks: number): number[] {
  const raw = Array.from({ length: ticks }, (_, i) => {
    const t = ticks > 1 ? i / (ticks - 1) : 1;
    return 38 + 92 * t * t;
  });
  const total = raw.reduce((sum, gap) => sum + gap, 0);
  return raw.map((gap) => (gap / total) * HOP_DURATION_MS);
}

/**
 * Cards are laid out at their revealed size and scaled down in the fan, so the
 * winner's cover stays crisp when it grows into place. The reveal is a
 * horizontal composition — card left, details right — centred on the table.
 */
function computeLayout(width: number, height: number, fanCount: number): TableLayout {
  let revealH = clamp(height - 64, 220, 560);
  let revealW = revealH / CARD_RATIO;
  const detailsW = clamp(width - revealW - DETAILS_GAP - EDGE_PAD, 240, 440);
  const overflow = revealW + DETAILS_GAP + detailsW + EDGE_PAD - width;
  if (overflow > 0) {
    revealW = Math.max(140, revealW - overflow);
    revealH = revealW * CARD_RATIO;
  }
  const compositionW = revealW + DETAILS_GAP + detailsW;
  const fanScale = clamp((height * 0.44) / revealH, 0.3, 0.62);
  const fanW = revealW * fanScale;

  return {
    width,
    height,
    revealW,
    revealH,
    revealX: -compositionW / 2 + revealW / 2,
    detailsLeft: width / 2 - compositionW / 2 + revealW + DETAILS_GAP,
    detailsW,
    fanScale,
    spacing: fanCount > 1 ? clamp((width - 64 - fanW) / (fanCount - 1), 26, fanW * 0.8) : 0,
  };
}

const deckPose = (layout: TableLayout): TargetAndTransition => ({
  x: 0,
  y: 12 - FAN_LIFT,
  rotate: 0,
  scale: layout.fanScale,
  opacity: 1,
});

function fanPose(slot: number, count: number, layout: TableLayout, lifted: boolean): TargetAndTransition {
  const offset = slot - (count - 1) / 2;
  const degreesPerCard = count > 1 ? Math.min(7, 36 / (count - 1)) : 0;
  return {
    x: offset * layout.spacing,
    y: offset * offset * 5 - FAN_LIFT - (lifted ? 26 : 0),
    rotate: offset * degreesPerCard,
    scale: layout.fanScale * (lifted ? 1.07 : 1),
    opacity: 1,
  };
}

function discardPose(slot: number, count: number, layout: TableLayout): TargetAndTransition {
  const offset = slot - (count - 1) / 2;
  return {
    x: offset * layout.spacing * 1.4,
    y: layout.height * 0.55 + layout.revealH * layout.fanScale,
    rotate: offset * 16,
    scale: layout.fanScale * 0.9,
    opacity: 0,
  };
}

const faceStyle: CSSProperties = {
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
};

/** Pure-CSS card back: theme gradient, lattice, inset frame, dice emblem. No image requests. */
function CardBack() {
  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-[22px] border border-white/20"
      style={{ ...faceStyle, background: "linear-gradient(150deg, var(--color-primary), var(--color-secondary))" }}
    >
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.5) 0 2px, transparent 2px 20px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.5) 0 2px, transparent 2px 20px)",
        }}
      />
      <div className="absolute inset-[7%] rounded-[16px] border-2 border-white/35" />
      <div className="absolute inset-[10%] rounded-[12px] border border-white/15" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex aspect-square w-[42%] items-center justify-center rounded-full border-2 border-white/45 bg-black/15">
          <Dices className="h-1/2 w-1/2 text-white/90" strokeWidth={1.6} />
        </div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/35" />
    </div>
  );
}

/** Winner's face: the cover, or a type-tinted card when there is no artwork. */
function CardFace({ entry, sizePx }: { entry: MediaEntry; sizePx: number }) {
  const typeStyle = getTypeBadgeStyle(entry.entry_type);
  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-[22px] border border-white/15 bg-black shadow-2xl"
      style={{ ...faceStyle, transform: "rotateY(180deg)" }}
    >
      {entry.image_url ? (
        <CoverImage
          path={entry.image_url}
          variant="card"
          priority="high"
          sizes={`${Math.round(sizePx)}px`}
          alt={entry.name}
          containerClassName="absolute inset-0"
          imageClassName="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className={cn("absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center", typeStyle.bg)}>
          <div className="text-white/80 [&_svg]:h-14 [&_svg]:w-14">{typeStyle.icon}</div>
          <p className="line-clamp-4 text-xl font-bold text-white">{entry.name}</p>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 rounded-[22px] ring-1 ring-inset ring-white/10" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-transparent" />
    </div>
  );
}

function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function RevealDetails({
  entry,
  awards,
  onDetails,
  onEdit,
  onOpenYear,
}: {
  entry: MediaEntry;
  awards: MediaAward[];
  onDetails: () => void;
  onEdit: () => void;
  onOpenYear: () => void;
}) {
  const typeStyle = getTypeBadgeStyle(entry.entry_type);
  const genres = parseGenres(entry.genre);
  const creator = entry.author || entry.artist || entry.director;
  const replay = getReplayTerm(entry.entry_type);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 className="line-clamp-3 text-3xl font-bold leading-tight text-white">{entry.name}</h2>
        {creator && (
          <p className="flex items-center gap-1.5 text-sm text-gray-400">
            <User size={13} />
            {creator}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        {entry.entry_type && (
          <span className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-white", typeStyle.bg)}>
            {typeStyle.icon}
            {entry.entry_type}
          </span>
        )}
        {entry.review_score != null && (
          <span className={cn("rounded-lg px-2.5 py-1", getRatingColor(entry.review_score))}>
            ★ {formatScore(entry.review_score)}
          </span>
        )}
        {entry.year_completed != null && (
          <span className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-gray-200">
            <CalendarDays size={12} />
            {entry.year_completed}
          </span>
        )}
        {entry.platform && (
          <span className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-gray-200">
            <Gamepad2 size={12} />
            {entry.platform}
          </span>
        )}
        {entry.is_rewatch === 1 && (
          <span className="rounded-lg bg-white/10 px-2.5 py-1 text-gray-200">{replay.label}</span>
        )}
        {entry.is_platinum === 1 && (
          <span className="rounded-lg bg-cyan-500/15 px-2.5 py-1 text-cyan-300">Platinum</span>
        )}
      </div>

      {genres.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {genres.map((genre) => (
            <span key={genre} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-gray-300">
              {genre}
            </span>
          ))}
        </div>
      )}

      {awards.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {awards.map((award) => (
            <span
              key={`${award.categoryName}:${award.year}`}
              className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-200"
            >
              <Trophy size={12} />
              {award.categoryName} {award.year}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={onDetails}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-medium text-gray-200 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Eye size={14} />
          Details
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-medium text-gray-200 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Pencil size={14} />
          Edit
        </button>
        {entry.year_completed != null && (
          <button
            type="button"
            onClick={onOpenYear}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-medium text-gray-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <CalendarDays size={14} />
            Open in {entry.year_completed}
          </button>
        )}
      </div>
    </div>
  );
}

export function CardDeal({ filters, matchCount, onAdjustFilters, onEntryChanged }: CardDealProps) {
  const navigate = useNavigate();
  const tableRef = useRef<HTMLDivElement>(null);
  const tableSize = useElementSize(tableRef);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [stage, setStage] = useState<DealStage>("gathering");
  const [hopSlot, setHopSlot] = useState<number | null>(null);
  const [pick, setPick] = useState<MediaEntry | null>(null);
  const [awards, setAwards] = useState<MediaAward[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reducedMotion] = useState(prefersReducedMotion);

  const dealIdRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const hasDealtRef = useRef(false);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const schedule = useCallback((delayMs: number, run: () => void) => {
    timersRef.current.push(window.setTimeout(run, delayMs));
  }, []);

  const runHops = useCallback((dealId: number, fan: MediaEntry[], winnerSlot: number) => {
    const sequence = buildHopSequence(fan.length, winnerSlot);
    const gaps = hopGaps(sequence.length);
    setStage("hopping");
    let elapsed = 0;
    sequence.forEach((slot, index) => {
      schedule(elapsed, () => {
        if (dealIdRef.current === dealId) setHopSlot(slot);
      });
      elapsed += gaps[index];
    });
    schedule(elapsed + 120, () => {
      if (dealIdRef.current !== dealId) return;
      setHopSlot(null);
      setStage("revealed");
    });
  }, [schedule]);

  const startDeal = useCallback(async () => {
    clearTimers();
    const dealId = ++dealIdRef.current;
    const gatherFirst = hasDealtRef.current && !reducedMotion;
    setStage("gathering");
    setHopSlot(null);

    let candidates: MediaEntry[];
    try {
      [candidates] = await Promise.all([
        dbService.getRandomPickCandidates(filters),
        gatherFirst ? new Promise((resolve) => window.setTimeout(resolve, GATHER_MS)) : null,
      ]);
    } catch (error) {
      console.error("Random pick failed:", error);
      if (dealIdRef.current === dealId) setStage("error");
      return;
    }
    if (dealIdRef.current !== dealId) return;

    if (candidates.length === 0) {
      setDeal(null);
      setPick(null);
      setStage("empty");
      return;
    }

    const winner = candidates[Math.floor(Math.random() * candidates.length)];
    const fan = shuffled(candidates.filter((candidate) => candidate.id !== winner.id)).slice(0, FAN_SIZE - 1);
    const winnerSlot = Math.floor(Math.random() * (fan.length + 1));
    fan.splice(winnerSlot, 0, winner);

    setDeal({ id: dealId, fan, winnerSlot, fromDeck: gatherFirst });
    setPick(winner);
    setAwards([]);
    hasDealtRef.current = true;

    // Awards load while the cards are dealt, so they're ready by the reveal.
    awardsLogic.getAwardsForMedia(winner.id)
      .then((result) => {
        if (dealIdRef.current === dealId) setAwards(result);
      })
      .catch((error) => console.error("Failed to fetch awards for picked entry:", error));

    if (reducedMotion) {
      setStage("revealed");
      return;
    }

    setStage("fanning");
    const fanMs = 380 + fan.length * FAN_STAGGER_S * 1000;
    schedule(fanMs, () => {
      if (dealIdRef.current !== dealId) return;
      if (fan.length === 1) {
        setStage("revealed");
      } else {
        runHops(dealId, fan, winnerSlot);
      }
    });
  }, [clearTimers, filters, reducedMotion, runHops, schedule]);

  useEffect(() => {
    void startDeal();
    return () => {
      // Invalidate any in-flight deal (StrictMode remounts, leaving the view).
      dealIdRef.current += 1;
      clearTimers();
    };
    // Deal once per mount; the view remounts this component for a fresh deal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (data: Partial<MediaEntry>) => {
    if (!pick) return;
    const updated = { ...pick, ...data } as MediaEntry;
    await dbService.updateEntry(updated);
    setPick(updated);
    onEntryChanged();
  };

  const handleOpenYear = () => {
    if (!pick?.year_completed) return;
    navigate(`/year/${pick.year_completed}?highlight=${pick.id}&type=${encodeURIComponent(pick.entry_type || "")}`);
  };

  const layout = deal && tableSize.width > 0 ? computeLayout(tableSize.width, tableSize.height, deal.fan.length) : null;
  const isBusy = stage === "gathering" || stage === "fanning" || stage === "hopping";
  const hopName = deal && hopSlot !== null ? deal.fan[hopSlot]?.name : null;

  const poseFor = (slot: number): { pose: TargetAndTransition; transition: Transition } => {
    if (!deal || !layout) return { pose: {}, transition: {} };
    const count = deal.fan.length;
    const isWinner = slot === deal.winnerSlot;
    if (reducedMotion) {
      return {
        pose: isWinner ? { x: layout.revealX, y: 0, rotate: 0, scale: 1, opacity: 1 } : discardPose(slot, count, layout),
        transition: { duration: 0 },
      };
    }
    switch (stage) {
      case "gathering":
        return { pose: deckPose(layout), transition: { type: "spring", stiffness: 300, damping: 30 } };
      case "fanning":
        return {
          pose: fanPose(slot, count, layout, false),
          transition: { type: "spring", stiffness: 240, damping: 24, delay: slot * FAN_STAGGER_S },
        };
      case "hopping":
        return {
          pose: fanPose(slot, count, layout, hopSlot === slot),
          transition: { type: "spring", stiffness: 520, damping: 30 },
        };
      default:
        return isWinner
          ? {
              pose: { x: layout.revealX, y: 0, rotate: 0, scale: 1, opacity: 1 },
              transition: { type: "spring", stiffness: 150, damping: 21 },
            }
          : {
              pose: discardPose(slot, count, layout),
              transition: { duration: 0.42, ease: [0.4, 0, 1, 1], delay: Math.abs(slot - deal.winnerSlot) * 0.03 },
            };
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div
        ref={tableRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-3xl border"
        style={{
          borderColor: "var(--color-border)",
          background:
            "radial-gradient(ellipse at 50% 42%, color-mix(in srgb, var(--color-primary) 16%, transparent), transparent 62%), linear-gradient(to bottom, color-mix(in srgb, var(--color-surface) 60%, transparent), color-mix(in srgb, var(--color-background-alt) 60%, transparent))",
        }}
      >
        {/* Cover glow behind the reveal. Mounted with the deal so the image is
            already loaded when it fades in. */}
        {pick?.image_url && (
          <motion.div
            key={`glow-${deal?.id ?? 0}`}
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: stage === "revealed" ? 0.3 : 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.8 }}
            aria-hidden="true"
          >
            <CoverImage
              path={pick.image_url}
              variant="small"
              showSkeleton={false}
              containerClassName="absolute inset-0"
              imageClassName="h-full w-full scale-125 object-cover blur-3xl"
            />
          </motion.div>
        )}
        <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/5" />

        {deal && layout && (
          <div className="absolute inset-0">
            {deal.fan.map((_entry, slot) => {
              const isWinner = slot === deal.winnerSlot;
              const { pose, transition } = poseFor(slot);
              const lifted = stage === "hopping" && hopSlot === slot;
              return (
                <motion.div
                  key={`${deal.id}-${slot}`}
                  className="absolute left-1/2 top-1/2"
                  style={{
                    width: layout.revealW,
                    height: layout.revealH,
                    marginLeft: -layout.revealW / 2,
                    marginTop: -layout.revealH / 2,
                    perspective: 1600,
                    zIndex: stage === "revealed" && isWinner ? 40 : lifted ? 30 : slot + 1,
                  }}
                  initial={reducedMotion ? false : { ...deckPose(layout), opacity: deal.fromDeck ? 1 : 0 }}
                  animate={pose}
                  transition={transition}
                >
                  <motion.div
                    className="relative h-full w-full rounded-[22px]"
                    style={{
                      transformStyle: "preserve-3d",
                      boxShadow: lifted
                        ? "0 0 0 6px rgba(255,255,255,0.92), 0 0 56px 10px color-mix(in srgb, var(--color-primary) 75%, transparent)"
                        : "0 24px 48px -20px rgba(0,0,0,0.7)",
                      transition: "box-shadow 120ms ease-out",
                    }}
                    initial={false}
                    animate={{ rotateY: isWinner && stage === "revealed" ? 180 : 0 }}
                    transition={
                      reducedMotion ? { duration: 0 } : { duration: 0.7, ease: [0.2, 0.8, 0.2, 1], delay: 0.12 }
                    }
                  >
                    <CardBack />
                    {isWinner && pick && <CardFace entry={pick} sizePx={layout.revealW} />}
                  </motion.div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Caption under the fan — every name that flashes by is a real candidate. */}
        <AnimatePresence>
          {layout && (stage === "fanning" || stage === "hopping") && (
            <motion.div
              key="caption"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-none absolute inset-x-0 px-6 text-center"
              style={{ top: layout.height / 2 - FAN_LIFT + (layout.revealH * layout.fanScale) / 2 + 40 }}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-500">
                Picking…
              </p>
              <p className="mt-1 truncate text-xl font-bold text-white">{hopName ?? " "}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {layout && stage === "revealed" && pick && (
            <motion.div
              key={`details-${deal?.id}`}
              initial={reducedMotion ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.35, ease: "easeOut", delay: reducedMotion ? 0 : 0.5 }}
              className="absolute inset-y-0 flex items-center"
              style={{ left: layout.detailsLeft, width: layout.detailsW }}
            >
              <div className="custom-scrollbar w-full overflow-y-auto pr-2" style={{ maxHeight: layout.height - 32 }}>
                <RevealDetails
                  entry={pick}
                  awards={awards}
                  onDetails={() => setDetailsOpen(true)}
                  onEdit={() => setEditOpen(true)}
                  onOpenYear={handleOpenYear}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {(stage === "empty" || stage === "error") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
              <Dices size={28} className="text-gray-500" />
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-200">
                {stage === "empty" ? "No matches" : "Random pick failed"}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {stage === "empty"
                  ? "No entries match these filters."
                  : "Something went wrong. Try again."}
              </p>
            </div>
          </div>
        )}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-3">
        <p className="text-xs text-gray-500">
          {deal && matchCount !== null
            ? `Picked from ${matchCount} ${matchCount === 1 ? "match" : "matches"}`
            : " "}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onAdjustFilters}
            className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-medium text-gray-400 transition-all hover:bg-white/5 hover:text-white"
          >
            <SlidersHorizontal size={13} />
            Adjust filters
          </button>
          <button
            type="button"
            onClick={() => void startDeal()}
            disabled={isBusy}
            className={cn(
              "flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition-all",
              isBusy ? "cursor-not-allowed bg-white/5 text-gray-500" : "hover:scale-[1.02] active:scale-[0.98]",
            )}
            style={
              !isBusy
                ? {
                    background: "linear-gradient(to right, var(--color-primary), var(--color-secondary))",
                    boxShadow: "0 10px 24px -8px color-mix(in srgb, var(--color-primary) 55%, transparent)",
                  }
                : undefined
            }
          >
            {stage === "error" ? <RotateCcw size={14} /> : <Shuffle size={14} />}
            {isBusy ? "Picking…" : "Re-roll"}
          </button>
        </div>
      </footer>

      {detailsOpen && pick && (
        <Suspense fallback={null}>
          <LazyMediaCardDialogs
            dialog="details"
            entry={pick}
            onClose={() => setDetailsOpen(false)}
            onConfirmDelete={() => setDetailsOpen(false)}
          />
        </Suspense>
      )}

      <EntryForm isOpen={editOpen} onClose={() => setEditOpen(false)} onSave={handleSave} initialData={pick} />
    </div>
  );
}
