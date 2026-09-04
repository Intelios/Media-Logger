import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../../../lib/utils_ui";
import { Serif } from "../../review-ui";

/** The reel's content inset. Clears the viewfinder ticks and the chrome. */
export function ChapterBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full items-center gap-16 px-[104px]", className)}>{children}</div>
  );
}

/** Left-hand text column: eyebrow, display headline, then whatever follows. */
export function ChapterLead({
  eyebrow,
  eyebrowColor = "#fbbf24",
  children,
  className,
  width = 640,
}: {
  eyebrow?: string;
  eyebrowColor?: string;
  children: ReactNode;
  className?: string;
  width?: number | string;
}) {
  return (
    <div className={cn("flex flex-col", className)} style={{ width, maxWidth: "100%" }}>
      {eyebrow && (
        <div className="mb-5 flex items-center gap-3">
          <div className="h-px w-[34px] shrink-0" style={{ background: eyebrowColor }} />
          <span
            className="text-xs font-bold uppercase leading-none"
            style={{ letterSpacing: "0.28em", color: eyebrowColor }}
          >
            {eyebrow}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}

/** The chapter's display headline. */
export function ChapterTitle({
  children,
  size = 92,
  style,
}: {
  children: ReactNode;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <h1 className="m-0 text-white" style={{ textWrap: "balance" }}>
      <Serif style={{ fontSize: size, lineHeight: 0.94, letterSpacing: "-0.015em", ...style }}>
        {children}
      </Serif>
    </h1>
  );
}

/** Sentence under a headline, set in the display face at reading size. */
export function ChapterSubtitle({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 mt-6 max-w-[560px] text-white/70" style={{ textWrap: "pretty" }}>
      <Serif italic style={{ fontSize: 27, lineHeight: 1.34 }}>
        {children}
      </Serif>
    </p>
  );
}

/** A figure and its label, for the small stat rows chapters end on. */
export function ChapterStat({
  value,
  label,
  color = "#ffffff",
  size = 40,
}: {
  value: ReactNode;
  label: string;
  color?: string;
  size?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="font-extrabold leading-none"
        style={{ fontSize: size, letterSpacing: "-0.03em", color }}
      >
        {value}
      </span>
      <span
        className="text-[11px] font-bold uppercase text-white/45"
        style={{ letterSpacing: "0.14em" }}
      >
        {label}
      </span>
    </div>
  );
}

export function ChapterStatRow({ children }: { children: ReactNode }) {
  return <div className="mt-11 flex items-center gap-9">{children}</div>;
}

export function StatDivider() {
  return <div className="h-10 w-px bg-white/[0.14]" />;
}

/** Rounded chip used for breakdown lists (types, genres, franchises). */
export function ChapterChip({
  children,
  accent,
}: {
  children: ReactNode;
  accent?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-white/90"
      style={{
        background: accent ? `color-mix(in srgb, ${accent} 22%, transparent)` : "rgba(255,255,255,0.10)",
        border: `1px solid ${accent ? `color-mix(in srgb, ${accent} 40%, transparent)` : "rgba(255,255,255,0.10)"}`,
      }}
    >
      {children}
    </span>
  );
}
