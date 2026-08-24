import { useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BarChart3, FolderOpen, Gem, Repeat, Star, Tags, X } from "lucide-react";
import type { Collection, CollectionItemView, Era } from "../../lib/collections-logic";
import { deriveCollectionStats } from "../../lib/collections/stats";
import type { StatItem } from "../../lib/stats-logic";
import { cn } from "../../lib/utils_ui";
import { useEscapeToClose } from "../../lib/useEscapeToClose";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { CoverImage } from "../CoverImage";
import { TooltipDetail, TooltipTitle, useHoverTooltip } from "../HoverTooltip";
import { CATEGORY_PALETTE } from "../stats/plate/plate-ui";

interface CollectionStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  collection: Collection;
  items: CollectionItemView[];
  eras: Era[];
}

type GenreSortMode = "count" | "avgScore";

function FigureTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
      <div className="text-text-muted shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-lg font-bold text-text leading-tight truncate">{value}</div>
        <div className="text-xs text-text-muted">{label}</div>
      </div>
    </div>
  );
}

function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-3">
      <h3 className="text-xs text-text-subtle uppercase tracking-wide font-semibold">{title}</h3>
      {children}
    </div>
  );
}

// Shared row shape for the era and genre breakdowns: color dot + name, average
// score, perfect count, item share, and a colored bar whose width the caller
// chooses (era bars scale to score/10, genre bars to count/max).
function StatRow({
  color,
  name,
  barWidthPct,
  averageScore,
  perfectCount,
  count,
  sharePct,
}: {
  color: string;
  name: string;
  barWidthPct: number;
  averageScore: number | null;
  perfectCount: number;
  count: number;
  sharePct: number;
}) {
  return (
    <div className="rounded-xl p-4 bg-white/[0.02] border border-white/5">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-text font-medium truncate">{name}</span>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {averageScore !== null ? (
            <div className="flex items-center gap-1 text-sm">
              <Star size={13} className="text-amber-400" />
              <span className="text-amber-300 font-medium">{averageScore.toFixed(1)}</span>
            </div>
          ) : (
            <span className="text-sm text-text-subtle">Unrated</span>
          )}

          {perfectCount > 0 && (
            <div className="flex items-center gap-1 text-sm">
              <Gem size={13} className="text-pink-400" />
              <span className="text-pink-300 font-medium">{perfectCount}</span>
            </div>
          )}

          <div className="text-right min-w-[70px]">
            <span className="font-bold text-text">{count}</span>
            <span className="text-text-subtle text-xs ml-1.5">({sharePct.toFixed(1)}%)</span>
          </div>
        </div>
      </div>

      {/* `pl-12` on a wrapper, not `ml-12` on the track: a left margin plus
          `w-full` makes the track 48px wider than the card, pushing the bar
          out of the rounded box. */}
      <div className="mt-2.5 pl-12">
        <div className="h-1.5 w-full rounded-full bg-primary/10">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${barWidthPct}%`, backgroundColor: color, opacity: 0.75 }}
          />
        </div>
      </div>
    </div>
  );
}

function formatScore(score: number): string {
  return Number.isInteger(score) ? score.toFixed(0) : score.toFixed(1);
}

export function CollectionStatsModal({ isOpen, onClose, collection, items, eras }: CollectionStatsModalProps) {
  const [genreSort, setGenreSort] = useState<GenreSortMode>("count");
  const modalRef = useRef<HTMLDivElement>(null);
  const { bindTooltip } = useHoverTooltip();

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  const stats = useMemo(() => deriveCollectionStats(items, eras), [items, eras]);

  if (!isOpen) return null;

  const maxGenreCount = stats.genres.length > 0 ? stats.genres[0].count : 1;
  const sortedGenres: StatItem[] =
    genreSort === "avgScore"
      ? [...stats.genres].sort((left, right) => (right.avgScore ?? -1) - (left.avgScore ?? -1))
      : stats.genres;
  // Colors follow the count-ranked order so a genre keeps its color when the sort changes.
  const genreColorByName = new Map(
    stats.genres.map((genre, index) => [genre.name, CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]])
  );

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className="glass-surface fixed inset-4 md:inset-10 lg:inset-16 rounded-3xl z-50 flex flex-col overflow-hidden animate-in zoom-in-95 fade-in duration-200"
      >
        {/* Header */}
        <header className="flex items-center justify-between p-6 border-b border-primary/15 shrink-0">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-text flex items-center gap-3">
              <BarChart3 className="text-primary shrink-0" size={24} />
              <span className="truncate">{collection.name}</span>
            </h2>
            <p className="text-text-muted text-sm mt-1">
              Collection stats · {stats.itemCount} {stats.itemCount === 1 ? "item" : "items"} ·{" "}
              {stats.distinctGenreCount} {stats.distinctGenreCount === 1 ? "genre" : "genres"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-primary/10 transition-colors text-text-muted hover:text-primary shrink-0"
          >
            <X size={24} />
          </button>
        </header>

        {/* Headline figures */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 px-6 py-4 border-b border-primary/5 shrink-0">
          <FigureTile icon={<FolderOpen size={18} />} label="Items" value={String(stats.itemCount)} />
          <FigureTile
            icon={<Star size={18} />}
            label="Average Rating"
            value={stats.averageScore !== null ? stats.averageScore.toFixed(1) : "—"}
          />
          <FigureTile icon={<Gem size={18} />} label="Perfect 10s" value={String(stats.perfectTenCount)} />
          <FigureTile icon={<Repeat size={18} />} label="Replays" value={String(stats.rewatchCount)} />
          <FigureTile icon={<Tags size={18} />} label="Genres" value={String(stats.distinctGenreCount)} />
        </div>

        {/* Scrollable sections */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="space-y-8">
            {stats.eraStats.length > 0 && (
              <section>
                <SectionHeader title="Average Rating by Era" />
                <div className="space-y-2">
                  {stats.eraStats.map((era) => (
                    <StatRow
                      key={era.eraId}
                      color={era.color}
                      name={era.name}
                      averageScore={era.averageScore}
                      perfectCount={era.perfectCount}
                      count={era.count}
                      sharePct={stats.itemCount > 0 ? (era.count / stats.itemCount) * 100 : 0}
                      barWidthPct={era.averageScore !== null ? era.averageScore * 10 : 0}
                    />
                  ))}
                </div>
              </section>
            )}

            {stats.genres.length > 0 && (
              <section>
                <SectionHeader title="Genres">
                  <div className="flex items-center gap-2">
                    {([
                      { key: "count", label: "Most Items" },
                      { key: "avgScore", label: "Highest Rated" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => setGenreSort(opt.key)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                          genreSort === opt.key
                            ? "bg-primary/20 text-primary border border-primary/30"
                            : "text-text-muted hover:text-text hover:bg-primary/5 border border-transparent"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </SectionHeader>
                <div className="space-y-2">
                  {sortedGenres.map((genre) => (
                    <StatRow
                      key={genre.name}
                      color={genreColorByName.get(genre.name) ?? CATEGORY_PALETTE[0]}
                      name={genre.name}
                      averageScore={genre.avgScore ?? null}
                      perfectCount={genre.perfectCount ?? 0}
                      count={genre.count}
                      sharePct={stats.itemCount > 0 ? (genre.count / stats.itemCount) * 100 : 0}
                      barWidthPct={(genre.count / maxGenreCount) * 100}
                    />
                  ))}
                </div>
              </section>
            )}

            {stats.topRated.length > 0 && (
              <section>
                <SectionHeader title="Top Rated" />
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {stats.topRated.map((item) => (
                    <div
                      key={item.id}
                      className="relative aspect-[2/3] rounded-lg overflow-hidden border border-white/10"
                      {...bindTooltip(
                        <>
                          <TooltipTitle>{item.name}</TooltipTitle>
                          <TooltipDetail>
                            {`★ ${formatScore(item.review_score)}`}
                            {item.entry_type ? ` · ${item.entry_type}` : ""}
                            {item.era_name ? ` · ${item.era_name}` : ""}
                          </TooltipDetail>
                        </>
                      )}
                    >
                      <CoverImage
                        path={item.image_url}
                        alt={item.name}
                        variant="small"
                        sizes="120px"
                        containerClassName="absolute inset-0"
                        imageClassName="h-full w-full object-cover"
                      />
                      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-[11px] font-bold text-amber-300">
                        <Star size={10} />
                        {formatScore(item.review_score)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
