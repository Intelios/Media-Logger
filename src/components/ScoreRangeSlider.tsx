import { cn } from "../lib/utils_ui";

export interface ScoreRange {
  min: number;
  max: number;
}

interface ScoreRangeSliderProps {
  value: ScoreRange;
  onChange: (range: ScoreRange) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

/** Trim trailing zeros so 3.5 stays "3.5" while 7.0 reads "7". */
export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

/** "3.5 – 9" for a spread range, or just "7" when both thumbs sit on one value. */
export function formatScoreRange(range: ScoreRange): string {
  return range.min === range.max
    ? formatScore(range.min)
    : `${formatScore(range.min)} – ${formatScore(range.max)}`;
}

/**
 * Dual-thumb score range slider. Two stacked native range inputs share one
 * visual track: the min input stays fully interactive while the max input is
 * click-through except for its thumb, so each thumb drags independently.
 * Native inputs keep arrow-key support for free. Both inputs span the full
 * fixed track so each thumb's position depends only on its own value —
 * binding one input's range to the other thumb would reflow the paired thumb
 * mid-drag. Crossing is prevented by clamping in onChange instead.
 */
export function ScoreRangeSlider({
  value,
  onChange,
  min = 0,
  max = 10,
  step = 0.5,
  className,
}: ScoreRangeSliderProps) {
  const percent = (score: number) => ((score - min) / (max - min)) * 100;

  return (
    <div className={cn("select-none", className)}>
      <div className="relative h-8">
        <div className="pointer-events-none absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 rounded-full bg-white/10" />
        <div
          className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
          style={{
            left: `${percent(value.min)}%`,
            right: `${100 - percent(value.max)}%`,
            background: "linear-gradient(to right, var(--color-primary), var(--color-secondary))",
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value.min}
          onChange={(event) =>
            onChange({ min: Math.min(parseFloat(event.target.value), value.max), max: value.max })
          }
          className="score-range-input score-range-input-min"
          aria-label="Minimum score"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value.max}
          onChange={(event) =>
            onChange({ min: value.min, max: Math.max(parseFloat(event.target.value), value.min) })
          }
          className="score-range-input score-range-input-max"
          aria-label="Maximum score"
        />
      </div>

      <div className="mt-1 flex items-center justify-between text-[11px] font-medium text-gray-500">
        <span>{formatScore(min)}</span>
        <span>{formatScore(max)}</span>
      </div>

      <p className="mt-2 text-sm font-semibold text-white">
        {value.min === value.max ? (
          <span className="text-primary">Exactly {formatScore(value.min)}</span>
        ) : (
          <span className="text-primary">
            {formatScore(value.min)} – {formatScore(value.max)}
          </span>
        )}
      </p>
    </div>
  );
}
