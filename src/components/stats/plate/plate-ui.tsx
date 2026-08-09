import type { HTMLAttributes, ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { cn } from "../../../lib/utils_ui";
import type { PlateAccent } from "./plate-config";

// Full class strings per accent — Tailwind only sees literals, so these cannot
// be assembled from fragments at runtime.
export const ACCENT_CLASSES: Record<PlateAccent, { swatch: string; text: string; bar: string; pill: string }> = {
  purple: {
    swatch: "bg-purple-500/15 text-purple-300",
    text: "text-purple-300",
    bar: "bg-purple-500",
    pill: "border-purple-400/40 bg-purple-500/15 text-purple-200",
  },
  amber: {
    swatch: "bg-amber-500/15 text-amber-300",
    text: "text-amber-300",
    bar: "bg-amber-500",
    pill: "border-amber-400/40 bg-amber-500/15 text-amber-200",
  },
  blue: {
    swatch: "bg-sky-500/15 text-sky-300",
    text: "text-sky-300",
    bar: "bg-sky-500",
    pill: "border-sky-400/40 bg-sky-500/15 text-sky-200",
  },
  pink: {
    swatch: "bg-pink-500/15 text-pink-300",
    text: "text-pink-300",
    bar: "bg-pink-500",
    pill: "border-pink-400/40 bg-pink-500/15 text-pink-200",
  },
  green: {
    swatch: "bg-emerald-500/15 text-emerald-300",
    text: "text-emerald-300",
    bar: "bg-emerald-500",
    pill: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
  },
  cyan: {
    swatch: "bg-cyan-500/15 text-cyan-300",
    text: "text-cyan-300",
    bar: "bg-cyan-500",
    pill: "border-cyan-400/40 bg-cyan-500/15 text-cyan-200",
  },
};

// Ordered so adjacent slices in a donut stay distinguishable without relying on
// the legend; reused by every categorical panel so colours mean the same thing.
export const CATEGORY_PALETTE = [
  "#8b5cf6",
  "#38bdf8",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#22d3ee",
  "#a78bfa",
  "#fb923c",
  "#4ade80",
  "#60a5fa",
];

export const ACCENT_HEX: Record<PlateAccent, string> = {
  purple: "#8b5cf6",
  amber: "#fbbf24",
  blue: "#38bdf8",
  pink: "#f472b6",
  green: "#34d399",
  cyan: "#22d3ee",
};

interface PlatePillProps {
  children: ReactNode;
  active?: boolean;
  accent?: PlateAccent;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}

export function PlatePill({ children, active = false, accent, disabled = false, title, onClick }: PlatePillProps) {
  const activeClasses = accent ? ACCENT_CLASSES[accent].pill : "border-primary/50 bg-primary/20 text-white";

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? activeClasses
          : "border-white/10 bg-white/[0.04] text-gray-400 hover:border-white/20 hover:bg-white/[0.08] hover:text-white",
        disabled && "cursor-not-allowed opacity-40 hover:border-white/10 hover:bg-white/[0.04] hover:text-gray-400"
      )}
    >
      {children}
    </button>
  );
}

interface PanelFrameProps {
  title: string;
  subtitle?: ReactNode;
  accent: PlateAccent;
  icon: ReactNode;
  action?: ReactNode;
  onExpand?: () => void;
  expandLabel?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function PanelFrame({
  title,
  subtitle,
  accent,
  icon,
  action,
  onExpand,
  expandLabel,
  children,
  className,
  bodyClassName,
}: PanelFrameProps) {
  return (
    <section
      className={cn(
        // h-full so a panel fills its grid cell; the plate never scrolls, so a
        // content-height panel would leave dead space under it.
        "flex h-full min-h-0 min-w-0 flex-col gap-2.5 overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] p-3",
        className
      )}
    >
      <header className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md",
            ACCENT_CLASSES[accent].swatch
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13px] font-bold leading-tight text-white">{title}</h3>
          {subtitle ? <div className="truncate text-[10px] leading-tight text-gray-500">{subtitle}</div> : null}
        </div>
        {action}
        {onExpand ? (
          <button
            type="button"
            onClick={onExpand}
            aria-label={expandLabel ?? `Expand ${title}`}
            title={expandLabel ?? `Expand ${title}`}
            className="shrink-0 rounded-md p-1 text-gray-500 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Maximize2 size={13} />
          </button>
        ) : null}
      </header>

      <div className={cn("flex min-h-0 flex-1 flex-col", bodyClassName)}>{children}</div>
    </section>
  );
}

interface BarRowProps {
  name: string;
  value: string | number;
  /** 0–1 share of the widest bar in the list. */
  fraction: number;
  color: string;
  /** 0–1 share for the comparison period, drawn as a hairline above the bar. */
  ghostFraction?: number;
  /** 0–1 share of the whole selection, printed beside the count. */
  share?: number;
  nameWidth?: string;
  onClick?: () => void;
  /** Handlers from useHoverTooltip's bindTooltip. */
  hoverProps?: HTMLAttributes<HTMLElement>;
}

export function BarRow({
  name,
  value,
  fraction,
  color,
  ghostFraction,
  share,
  nameWidth = "5.5rem",
  onClick,
  hoverProps,
}: BarRowProps) {
  const content = (
    <>
      <span className="shrink-0 truncate text-left text-gray-400" style={{ width: nameWidth }}>
        {name}
      </span>
      <span className="relative h-[5px] min-w-0 flex-1 overflow-visible rounded-full bg-white/[0.07]">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, backgroundColor: color }}
        />
        {ghostFraction !== undefined ? (
          <span
            className="absolute -top-[3px] left-0 h-[2px] rounded-full bg-white/30"
            style={{ width: `${Math.max(0, Math.min(1, ghostFraction)) * 100}%` }}
          />
        ) : null}
      </span>
      <span className="flex shrink-0 items-baseline justify-end gap-1 tabular-nums" style={{ width: share === undefined ? "2rem" : "3.4rem" }}>
        <span className="text-gray-300">{value}</span>
        {share !== undefined ? (
          <span className="text-[9px] text-gray-600">{Math.round(share * 100)}%</span>
        ) : null}
      </span>
    </>
  );

  if (!onClick) {
    return (
      <div className="flex items-center gap-2 text-[11px]" {...hoverProps}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-1 py-0.5 text-[11px] transition-colors hover:bg-white/5"
      {...hoverProps}
    >
      {content}
    </button>
  );
}

export function PanelEmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-white/10 px-3 py-4 text-center">
      <p className="text-[11px] leading-snug text-gray-500">{message}</p>
    </div>
  );
}
