import { useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../lib/utils_ui";
import { useEscapeToClose } from "../../lib/useEscapeToClose";
import { useFocusTrap } from "../../lib/useFocusTrap";
import {
  FILTER_PRESETS,
  getTypeBadgeStyle,
  getVisiblePresetKeys,
  useAdultMediaEnabled,
  type ActiveFilterPresetKey,
  type FilterPresetKey,
} from "../../lib/media-config";
import { ENTRY_TYPES, ADULT_ENTRY_TYPES } from "../../lib/media-config";
import type { ReviewYearTotal } from "../../lib/review-logic";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The old setup form, demoted. Everything here used to gate the page behind a
 * four-panel questionnaire; now it is one optional click away and every change
 * is a pure re-derivation over rows already in memory — no queries.
 *
 * Sits at z-50, below the reel's z-[100], so it can never cover playback.
 */
export function CustomiseSheet({
  open,
  onClose,
  years,
  year,
  month,
  typeFilter,
  monthCounts,
  onSelectYear,
  onSelectMonth,
  onSelectTypes,
}: {
  open: boolean;
  onClose: () => void;
  years: ReviewYearTotal[];
  year: number | null;
  month: number | null;
  typeFilter: string[];
  monthCounts: number[];
  onSelectYear: (year: number) => void;
  onSelectMonth: (month: number | null) => void;
  onSelectTypes: (types: string[]) => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  // Read live rather than at mount, so flipping the Settings toggle updates
  // the list without an app restart.
  const adultEnabled = useAdultMediaEnabled();
  const visibleTypes = adultEnabled
    ? ENTRY_TYPES
    : ENTRY_TYPES.filter((type) => !ADULT_ENTRY_TYPES.includes(type));

  useEscapeToClose(open, onClose);
  useFocusTrap(open, sheetRef);

  if (!open) return null;

  const activePreset: ActiveFilterPresetKey =
    getVisiblePresetKeys().find((key) => {
      const preset = FILTER_PRESETS[key].types;
      return preset.length === typeFilter.length && preset.every((type) => typeFilter.includes(type));
    }) ?? null;

  const applyPreset = (key: FilterPresetKey) => {
    onSelectTypes(
      activePreset === key ? visibleTypes : FILTER_PRESETS[key].types.filter((type) => visibleTypes.includes(type)),
    );
  };

  const toggleType = (type: string) => {
    onSelectTypes(
      typeFilter.includes(type)
        ? typeFilter.filter((existing) => existing !== type)
        : [...typeFilter, type],
    );
  };

  const chip = (active: boolean) =>
    cn(
      "rounded-xl border px-3.5 py-2 text-sm transition-all",
      active
        ? "border-primary bg-primary text-white shadow-lg shadow-primary/25"
        : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10",
    );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        onClick={(event) => event.stopPropagation()}
        className="glass-surface flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="m-0 text-lg font-bold text-text">Customise</h2>
            <p className="m-0 text-[13px] text-text-muted">
              Narrow the range. Nothing is refetched — the chapters redraw as you change this.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-text transition-colors hover:bg-white/20"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto px-6 py-5 custom-scrollbar">
          <section className="flex flex-col gap-3">
            <h3
              className="text-xs font-semibold uppercase text-text-muted"
              style={{ letterSpacing: "0.06em" }}
            >
              Year
            </h3>
            <div className="flex flex-wrap gap-2.5">
              {years.map((entry) => (
                <button
                  key={entry.year}
                  type="button"
                  onClick={() => onSelectYear(entry.year)}
                  className={cn(chip(year === entry.year), "text-left")}
                >
                  <span className="block text-base font-bold leading-tight">{entry.year}</span>
                  <span
                    className={cn("block text-xs", year === entry.year ? "text-white/70" : "text-gray-500")}
                  >
                    {entry.count} {entry.count === 1 ? "entry" : "entries"}
                  </span>
                </button>
              ))}
              {years.length === 0 && (
                <p className="m-0 text-sm text-text-subtle">No years with entries found.</p>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3
              className="text-xs font-semibold uppercase text-text-muted"
              style={{ letterSpacing: "0.06em" }}
            >
              Period
            </h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onSelectMonth(null)} className={chip(month === null)}>
                Full year
              </button>
              {MONTH_NAMES.map((name, index) => {
                const count = monthCounts[index] ?? 0;
                return (
                  <button
                    key={name}
                    type="button"
                    disabled={count === 0}
                    onClick={() => onSelectMonth(index + 1)}
                    className={cn(
                      chip(month === index + 1),
                      count === 0 && "cursor-default opacity-35 hover:bg-white/5",
                    )}
                  >
                    {name.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3
              className="text-xs font-semibold uppercase text-text-muted"
              style={{ letterSpacing: "0.06em" }}
            >
              Media types
            </h3>

            <div className="flex flex-wrap gap-2">
              {getVisiblePresetKeys().map((key) => {
                const preset = FILTER_PRESETS[key];
                const Icon = preset.icon;
                const active = activePreset === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyPreset(key)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all",
                      active
                        ? "border-primary/40 bg-primary/20 text-white"
                        : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/10",
                    )}
                  >
                    <Icon size={16} />
                    {preset.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => onSelectTypes(visibleTypes)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-medium transition-all",
                  typeFilter.length === visibleTypes.length
                    ? "border-primary/40 bg-primary/20 text-white"
                    : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/10",
                )}
              >
                All
              </button>
            </div>

            <div className="h-px bg-white/5" />

            <div className="flex flex-wrap gap-2">
              {visibleTypes.map((type) => {
                const selected = typeFilter.includes(type);
                const style = getTypeBadgeStyle(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleType(type)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-all",
                      selected
                        ? cn(style.bg, "border-transparent font-medium text-white shadow-sm")
                        : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200",
                    )}
                  >
                    {style.icon}
                    {type}
                  </button>
                );
              })}
            </div>

            {typeFilter.length === 0 && (
              <p className="m-0 text-xs text-text-subtle">Select at least one media type.</p>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
