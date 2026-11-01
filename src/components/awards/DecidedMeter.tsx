import { cn } from "../../lib/utils_ui";

interface DecidedMeterProps {
  /** One flag per award, in page order. */
  decided: boolean[];
  /**
   * `default` — 14px bars (year header, inspector rows).
   * `wide` — 26px bars (an award's history).
   * `fill` — flexible 3px bars that stretch across a home tile.
   */
  variant?: "default" | "wide" | "fill";
  className?: string;
}

/**
 * A thin row of bars, one per award, gold when that award has a winner. The
 * compact shape keeps a whole year's progress visible in a single hairline.
 */
export function DecidedMeter({
  decided: bars,
  variant = "default",
  className,
}: DecidedMeterProps) {
  if (bars.length === 0) return null;

  const filled = bars.reduce((count, isDecided) => count + (isDecided ? 1 : 0), 0);

  return (
    <div
      role="img"
      aria-label={`${filled} of ${bars.length} decided`}
      className={cn("flex items-center gap-[3px]", className)}
    >
      {bars.map((isDecided, index) => (
        <span
          key={index}
          className={cn(
            "rounded-full",
            variant === "fill"
              ? "h-[3px] flex-1"
              : variant === "wide"
                ? "h-1 w-[26px] shrink-0"
                : "h-1 w-3.5 shrink-0",
            isDecided ? "bg-[#d6ab5c]" : "bg-white/[0.12]"
          )}
        />
      ))}
    </div>
  );
}
