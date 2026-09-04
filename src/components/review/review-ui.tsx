import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/utils_ui";

/**
 * Shared primitives for the Review surfaces.
 *
 * The display face is reached through var(--review-serif), which only exists
 * inside a .review-surface subtree (see index.css). That makes "Instrument
 * Serif is Review-only" a property of the DOM rather than a convention people
 * have to remember.
 */

export const REVIEW_AMBER = "#fbbf24";
export const REVIEW_EMERALD = "#34d399";

/** Display type. Sizes are passed in — this only owns the face and rhythm. */
export function Serif({
  children,
  className,
  style,
  italic = false,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  italic?: boolean;
}) {
  return (
    <span
      className={className}
      style={{
        fontFamily: "var(--review-serif, Georgia, serif)",
        fontWeight: 400,
        fontStyle: italic ? "italic" : "normal",
        // Instrument Serif's descenders clip against a tight line-height
        // inside an overflow-hidden parent; a little bottom padding is
        // cheaper than loosening the leading on 100px display type.
        paddingBottom: "0.08em",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Small tracked caps above a headline. */
export function Eyebrow({
  children,
  className,
  color = "rgba(255,255,255,0.42)",
  rule = false,
}: {
  children: ReactNode;
  className?: string;
  color?: string;
  rule?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {rule && <div className="h-px w-[34px] shrink-0" style={{ background: color }} />}
      <span
        className="text-[11px] font-bold uppercase leading-none"
        style={{ letterSpacing: "0.24em", color }}
      >
        {children}
      </span>
    </div>
  );
}

/** The amber score disc used on the signature chapter and the hero. */
export function ScoreMedallion({ score, size = 116 }: { score: number; size?: number }) {
  const rounded = Number.isInteger(score) ? String(score) : score.toFixed(1);
  return (
    <div
      className="flex shrink-0 flex-col items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: REVIEW_AMBER,
        boxShadow: `0 20px 46px ${REVIEW_AMBER}6b`,
      }}
    >
      <span
        className="font-extrabold leading-none text-[#1c1917]"
        style={{ fontSize: size * 0.38, letterSpacing: "-0.04em" }}
      >
        {rounded}
      </span>
      <span
        className="mt-1 font-extrabold uppercase leading-none"
        style={{ fontSize: size * 0.078, letterSpacing: "0.2em", color: "rgba(28,25,23,0.7)" }}
      >
        {score === 10 ? "Perfect" : "Your score"}
      </span>
    </div>
  );
}

/** A dot separator matching the app's meta rows. */
export function MetaDot() {
  return <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-white/30" />;
}

/** Muted meta line under a chapter headline. */
export function MetaRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-3.5", className)}>{children}</div>;
}

/**
 * The app's standard surface card: used for chapter tiles, replay rows and the
 * poster's stat blocks. Matches the dashboard stat card exactly.
 */
export function ReviewCard({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn("rounded-[14px] border", className)}
      style={{
        background: "rgba(255,255,255,0.03)",
        borderColor: "rgba(255,255,255,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Small tinted square behind a chapter icon. */
export function IconChip({
  children,
  tint,
  size = 34,
}: {
  children: ReactNode;
  tint: string;
  size?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[10px]"
      style={{ width: size, height: size, background: tint }}
    >
      {children}
    </div>
  );
}
