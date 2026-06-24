import { ReactNode, useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Star } from "lucide-react";
import { cn } from "../lib/utils_ui";

interface StatItem {
    name: string;
    count: number;
    avgScore?: number;
}

interface CollapsibleStatSectionProps {
    title: string;
    icon: ReactNode;
    items: StatItem[];
    accentColor: "purple" | "blue" | "amber" | "green" | "pink" | "cyan";
    storageKey?: string; // For persisting expanded state
}

const colorMap = {
    purple: {
        bg: "bg-purple-500/10",
        border: "border-purple-500/20",
        bar: "bg-purple-500",
        barBg: "bg-purple-500/20",
        text: "text-purple-400",
        glow: "hover:shadow-purple-500/10",
    },
    blue: {
        bg: "bg-blue-500/10",
        border: "border-blue-500/20",
        bar: "bg-blue-500",
        barBg: "bg-blue-500/20",
        text: "text-blue-400",
        glow: "hover:shadow-blue-500/10",
    },
    amber: {
        bg: "bg-amber-500/10",
        border: "border-amber-500/20",
        bar: "bg-amber-500",
        barBg: "bg-amber-500/20",
        text: "text-amber-400",
        glow: "hover:shadow-amber-500/10",
    },
    green: {
        bg: "bg-green-500/10",
        border: "border-green-500/20",
        bar: "bg-green-500",
        barBg: "bg-green-500/20",
        text: "text-green-400",
        glow: "hover:shadow-green-500/10",
    },
    pink: {
        bg: "bg-pink-500/10",
        border: "border-pink-500/20",
        bar: "bg-pink-500",
        barBg: "bg-pink-500/20",
        text: "text-pink-400",
        glow: "hover:shadow-pink-500/10",
    },
    cyan: {
        bg: "bg-cyan-500/10",
        border: "border-cyan-500/20",
        bar: "bg-cyan-500",
        barBg: "bg-cyan-500/20",
        text: "text-cyan-400",
        glow: "hover:shadow-cyan-500/10",
    },
};

export function CollapsibleStatSection({
    title,
    icon,
    items,
    accentColor,
    storageKey,
}: CollapsibleStatSectionProps) {
    const colors = colorMap[accentColor];
    const totalCount = items.reduce((sum, item) => sum + item.count, 0);
    const maxCount = items.length > 0 ? items[0].count : 1;

    // Persist expanded state
    const [isExpanded, setIsExpanded] = useState(() => {
        if (storageKey) {
            const stored = localStorage.getItem(`stats-section-${storageKey}`);
            return stored === "true";
        }
        return false;
    });

    useEffect(() => {
        if (storageKey) {
            localStorage.setItem(`stats-section-${storageKey}`, String(isExpanded));
        }
    }, [isExpanded, storageKey]);

    if (items.length === 0) {
        return null;
    }

    const previewItems = items.slice(0, 3);
    const displayItems = isExpanded ? items : previewItems;
    const hasMore = items.length > 3;

    return (
        <div
            className={cn(
                "rounded-2xl border transition-all duration-300",
                colors.border,
                colors.bg,
                colors.glow,
                "hover:shadow-lg"
            )}
        >
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-4 text-left group"
            >
                <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-xl bg-white/5", colors.text)}>
                        {icon}
                    </div>
                    <div>
                        <h4 className="font-bold text-white flex items-center gap-2">
                            {title}
                            <span
                                className={cn(
                                    "text-xs font-medium px-2 py-0.5 rounded-full",
                                    colors.bg,
                                    colors.text
                                )}
                            >
                                {totalCount}
                            </span>
                        </h4>
                        <p className="text-xs text-gray-400">
                            {items.length} unique {title.toLowerCase()}
                        </p>
                    </div>
                </div>
                <div
                    className={cn(
                        "p-1 rounded-lg transition-colors",
                        "text-gray-400 group-hover:text-white group-hover:bg-white/5"
                    )}
                >
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
            </button>

            {/* Content */}
            <div
                className={cn(
                    "overflow-hidden transition-all duration-300 ease-out",
                    isExpanded ? "max-h-[500px]" : "max-h-[180px]"
                )}
            >
                <div
                    className={cn(
                        "px-4 pb-4 space-y-2",
                        isExpanded && "overflow-y-auto max-h-[460px] custom-scrollbar"
                    )}
                >
                    {displayItems.map((item, index) => {
                        const percentage = totalCount > 0 ? (item.count / totalCount) * 100 : 0;
                        const barWidth = (item.count / maxCount) * 100;

                        return (
                            <div
                                key={item.name}
                                className={cn(
                                    "group rounded-lg p-2 transition-all duration-200",
                                    "hover:bg-white/5"
                                )}
                                style={{
                                    animationDelay: `${index * 50}ms`,
                                }}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm text-gray-300 group-hover:text-white transition-colors truncate max-w-[60%]">
                                        {item.name}
                                    </span>
                                    <div className="flex items-center gap-2 text-xs">
                                        {item.avgScore !== undefined && (
                                            <span className={cn("font-medium", colors.text)}>
                                                <Star size={12} className="inline align-middle" /> {item.avgScore.toFixed(1)}
                                            </span>
                                        )}
                                        <span className="text-gray-400">{percentage.toFixed(1)}%</span>
                                        <span className="font-bold text-white min-w-[24px] text-right">
                                            {item.count}
                                        </span>
                                    </div>
                                </div>
                                {/* Progress Bar */}
                                <div className={cn("h-1.5 w-full rounded-full", colors.barBg)}>
                                    <div
                                        className={cn(
                                            "h-full rounded-full transition-all duration-500",
                                            colors.bar
                                        )}
                                        style={{ width: `${barWidth}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}

                    {/* Show More Indicator (when collapsed) */}
                    {!isExpanded && hasMore && (
                        <div className="text-center pt-2">
                            <span className="text-xs text-gray-500">
                                +{items.length - 3} more • Click to expand
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
