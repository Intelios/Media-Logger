import { useState } from "react";
import { X, Star, Gem, ChevronRight, BarChart3 } from "lucide-react";
import { type StatItem } from "../lib/stats-logic";
import { cn } from "../lib/utils_ui";

const COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"];

interface GenreBreakdownModalProps {
    isOpen: boolean;
    onClose: () => void;
    genres: StatItem[];
    totalEntries: number;
    onGenreClick: (genreName: string) => void;
}

export function GenreBreakdownModal({ isOpen, onClose, genres, totalEntries, onGenreClick }: GenreBreakdownModalProps) {
    const [sortBy, setSortBy] = useState<"count" | "avgScore" | "perfect">("count");

    if (!isOpen) return null;

    const maxCount = genres.length > 0 ? genres[0].count : 1;

    const sortedGenres = [...genres].sort((a, b) => {
        if (sortBy === "avgScore") return (b.avgScore ?? 0) - (a.avgScore ?? 0);
        if (sortBy === "perfect") return (b.perfectCount ?? 0) - (a.perfectCount ?? 0);
        return b.count - a.count;
    });

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="fixed inset-4 md:inset-10 lg:inset-16 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-3xl z-50 flex flex-col overflow-hidden animate-in zoom-in-95 fade-in duration-200">
                {/* Header */}
                <header className="flex items-center justify-between p-6 border-b border-white/10 shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                            <BarChart3 className="text-purple-400" size={24} />
                            Genre Breakdown
                        </h2>
                        <p className="text-gray-400 text-sm mt-1">
                            {genres.length} genres across {totalEntries} entries — click a genre to view its entries
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
                    >
                        <X size={24} />
                    </button>
                </header>

                {/* Sort Controls */}
                <div className="flex items-center gap-2 px-6 py-3 border-b border-white/5 shrink-0">
                    <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold mr-2">Sort by</span>
                    {([
                        { key: "count", label: "Most Entries" },
                        { key: "avgScore", label: "Highest Rated" },
                        { key: "perfect", label: "Most Perfect 10s" },
                    ] as const).map(opt => (
                        <button
                            key={opt.key}
                            onClick={() => setSortBy(opt.key)}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                sortBy === opt.key
                                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                    : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <div className="space-y-2">
                        {sortedGenres.map((genre, index) => {
                            const percentage = totalEntries > 0 ? (genre.count / totalEntries) * 100 : 0;
                            const barWidth = (genre.count / maxCount) * 100;
                            const rank = index + 1;
                            const colorIndex = genres.findIndex(g => g.name === genre.name);

                            return (
                                <button
                                    key={genre.name}
                                    onClick={() => onGenreClick(genre.name)}
                                    className="w-full text-left group rounded-xl p-4 transition-all duration-200 hover:bg-white/5 border border-transparent hover:border-white/10"
                                >
                                    <div className="flex items-center gap-4">
                                        {/* Rank */}
                                        <div className={cn(
                                            "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0",
                                            rank <= 3 ? "bg-purple-500/20 text-purple-300" : "bg-white/5 text-gray-500"
                                        )}>
                                            {rank}
                                        </div>

                                        {/* Color dot + Name */}
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                            <div
                                                className="w-3 h-3 rounded-full shrink-0"
                                                style={{ backgroundColor: COLORS[colorIndex % COLORS.length] }}
                                            />
                                            <span className="text-white font-medium truncate group-hover:text-purple-300 transition-colors">
                                                {genre.name}
                                            </span>
                                        </div>

                                        {/* Stats */}
                                        <div className="flex items-center gap-4 shrink-0">
                                            {/* Avg Score */}
                                            {genre.avgScore !== undefined && (
                                                <div className="flex items-center gap-1 text-sm" title="Average Score">
                                                    <Star size={13} className="text-amber-400" />
                                                    <span className="text-amber-300 font-medium">{genre.avgScore.toFixed(1)}</span>
                                                </div>
                                            )}

                                            {/* Perfect 10s */}
                                            {(genre.perfectCount ?? 0) > 0 && (
                                                <div className="flex items-center gap-1 text-sm" title="Perfect 10s">
                                                    <Gem size={13} className="text-pink-400" />
                                                    <span className="text-pink-300 font-medium">{genre.perfectCount}</span>
                                                </div>
                                            )}

                                            {/* Count + Percentage */}
                                            <div className="text-right min-w-[70px]">
                                                <span className="font-bold text-white">{genre.count}</span>
                                                <span className="text-gray-500 text-xs ml-1.5">({percentage.toFixed(1)}%)</span>
                                            </div>

                                            <ChevronRight size={16} className="text-gray-600 group-hover:text-purple-400 transition-colors" />
                                        </div>
                                    </div>

                                    {/* Bar */}
                                    <div className="mt-2.5 ml-12 h-1.5 w-full rounded-full bg-purple-500/10">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{
                                                width: `${barWidth}%`,
                                                backgroundColor: COLORS[colorIndex % COLORS.length],
                                                opacity: 0.7,
                                            }}
                                        />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </>
    );
}
