import { useRef } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Check,
  CheckCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
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
  ENTRY_TYPES,
  ADULT_ENTRY_TYPES,
} from "../../lib/media-config";
import { Eyebrow, IconChip } from "./review-ui";

export interface CustomiseSheetProps {
  open: boolean;
  onClose: () => void;
  typeFilter: string[];
  onSelectTypes: (types: string[]) => void;
}

/**
 * Filter the Review chapters by media type.
 *
 * Year and month selection are handled on the main page via the Replay column
 * and calendar. Every change here is a pure in-memory re-derivation with zero queries.
 *
 * Sits at z-50, below the reel's z-[100], so it can never cover playback.
 */
export function CustomiseSheet({
  open,
  onClose,
  typeFilter,
  onSelectTypes,
}: CustomiseSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
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

  const allActive = typeFilter.length === visibleTypes.length;

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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl"
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="customise-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="relative flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#0d0d11]/95 shadow-[0_24px_60px_rgba(0,0,0,0.7)]"
      >
        {/* Subtle accent glow matching Review UI hero aesthetics */}
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full opacity-60"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--color-primary) 28%, transparent) 0%, transparent 70%)",
          }}
        />

        {/* Modal Header */}
        <div className="relative flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <div className="flex items-center gap-3.5">
            <IconChip
              tint="color-mix(in srgb, var(--color-primary) 18%, transparent)"
              size={38}
            >
              <SlidersHorizontal size={18} style={{ color: "var(--color-primary)" }} />
            </IconChip>
            <div className="flex flex-col gap-0.5">
              <Eyebrow color="rgba(255,255,255,0.4)">Review</Eyebrow>
              <h2 id="customise-dialog-title" className="m-0 text-lg font-bold text-text">
                Customise Media
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.05] text-text-muted transition-colors hover:border-white/20 hover:bg-white/[0.12] hover:text-text"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="relative flex flex-col gap-5 overflow-y-auto px-6 py-5 custom-scrollbar">
          <p className="m-0 text-[13px] text-text-muted leading-relaxed">
            Choose which media types are featured in your review chapters. Changes update live in memory.
          </p>

          {/* Quick Presets */}
          <div className="flex flex-col gap-2.5">
            <span
              className="text-[11px] font-semibold uppercase text-text-subtle"
              style={{ letterSpacing: "0.08em" }}
            >
              Filter by preset
            </span>
            <div className="flex flex-wrap items-center gap-2">
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
                      "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all",
                      active
                        ? "border-primary/50 bg-primary/20 text-white shadow-sm"
                        : "border-white/[0.08] bg-white/[0.04] text-text-muted hover:border-white/20 hover:bg-white/[0.08] hover:text-text",
                    )}
                  >
                    <Icon size={14} className={active ? "text-primary" : "text-text-subtle"} />
                    {preset.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => onSelectTypes(visibleTypes)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all",
                  allActive
                    ? "border-primary/50 bg-primary/20 text-white shadow-sm"
                    : "border-white/[0.08] bg-white/[0.04] text-text-muted hover:border-white/20 hover:bg-white/[0.08] hover:text-text",
                )}
              >
                <CheckCheck size={14} className={allActive ? "text-primary" : "text-text-subtle"} />
                All
              </button>
            </div>
          </div>

          <div className="h-px bg-white/[0.06]" />

          {/* Media Types Grid */}
          <div className="flex flex-col gap-2.5">
            <span
              className="text-[11px] font-semibold uppercase text-text-subtle"
              style={{ letterSpacing: "0.08em" }}
            >
              Media types
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              {visibleTypes.map((type) => {
                const selected = typeFilter.includes(type);
                const style = getTypeBadgeStyle(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleType(type)}
                    className={cn(
                      "group flex items-center justify-between gap-2.5 rounded-[14px] border p-3 text-left transition-all",
                      selected
                        ? "border-primary/40 bg-white/[0.07] text-white shadow-sm"
                        : "border-white/[0.06] bg-white/[0.02] text-text-muted/60 opacity-60 hover:opacity-100 hover:bg-white/[0.05] hover:text-text",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-white transition-transform group-hover:scale-105",
                          selected ? style.bg : "bg-white/10 text-text-subtle",
                        )}
                      >
                        {style.icon}
                      </span>
                      <span className="truncate text-[13px] font-semibold">
                        {type}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                        selected
                          ? "border-primary bg-primary text-white"
                          : "border-white/15 bg-white/5 text-transparent group-hover:border-white/30",
                      )}
                    >
                      <Check size={12} strokeWidth={2.5} className={cn(!selected && "opacity-0")} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="relative flex items-center justify-between border-t border-white/[0.08] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted">
              <strong className="font-semibold text-text">{typeFilter.length}</strong> of {visibleTypes.length} types included
            </span>
            {typeFilter.length === 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-400">
                <AlertCircle size={13} />
                Requires at least 1 type
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {typeFilter.length > 0 && typeFilter.length < visibleTypes.length && (
              <button
                type="button"
                onClick={() => onSelectTypes(visibleTypes)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-white/5 hover:text-text"
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-semibold text-white shadow-lg shadow-primary/25 transition-transform hover:brightness-110 active:scale-95"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
