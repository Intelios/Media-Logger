import { cloneElement, type ReactElement } from "react";
import { Layers } from "lucide-react";
import { ENTRY_TYPES, getTypeBadgeStyle } from "../../lib/media-config";
import { cn } from "../../lib/utils_ui";
import { AWARD_FOCUS_RING } from "./AwardRow";

/**
 * getTypeBadgeStyle returns a solid `bg-*-600` badge class for filled chips.
 * Bare icons need the matching 400 tint; this maps one vocabulary onto the
 * other so the tabs and group headings can't drift from the entry-type badges.
 */
const TYPE_ICON_TINT: Record<string, string> = {
  "bg-emerald-600": "text-emerald-400",
  "bg-purple-600": "text-purple-400",
  "bg-pink-500": "text-pink-400",
  "bg-teal-600": "text-teal-400",
  "bg-blue-600": "text-blue-400",
  "bg-cyan-600": "text-cyan-400",
  "bg-amber-600": "text-amber-400",
  "bg-rose-600": "text-rose-400",
  "bg-indigo-600": "text-indigo-400",
  "bg-gray-600": "text-gray-400",
};

export function typeIconTint(type: string | null): string {
  if (!type) return "text-gray-400";
  return TYPE_ICON_TINT[getTypeBadgeStyle(type).bg] ?? "text-gray-400";
}

/** Media-type glyph at an arbitrary size; "General"/null is the Layers icon. */
export function AwardTypeIcon({ type, size = 12 }: { type: string | null; size?: number }) {
  if (!type || !ENTRY_TYPES.includes(type)) {
    return <Layers size={size} />;
  }
  const badge = getTypeBadgeStyle(type);
  return cloneElement(badge.icon as ReactElement<{ size?: number }>, { size });
}

interface AwardTypeTabsProps {
  /** Unfiltered groups in page order — “All” plus one pill per group. */
  groups: [string, unknown[]][];
  /** Active group key, or null for All. */
  value: string | null;
  onChange: (type: string | null) => void;
}

/**
 * Single-row media-type filter. The right edge fades under a mask instead of
 * scrolling, so the row always reads as one quiet line rather than a rail.
 */
export function AwardTypeTabs({ groups, value, onChange }: AwardTypeTabsProps) {
  if (groups.length === 0) return null;

  const pill = (isActive: boolean) =>
    cn(
      "flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-[9px] text-[12.5px] font-medium transition-colors",
      isActive
        ? "border border-transparent bg-white/[0.08] text-white"
        : "border border-white/5 text-gray-400 hover:border-white/10 hover:text-white/70",
      AWARD_FOCUS_RING
    );

  return (
    <div
      className="-my-1 flex items-center gap-1.5 overflow-hidden py-1"
      style={{
        maskImage: "linear-gradient(to right, black calc(100% - 32px), transparent)",
        WebkitMaskImage: "linear-gradient(to right, black calc(100% - 32px), transparent)",
      }}
    >
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        className={pill(value === null)}
      >
        All
      </button>
      {groups.map(([key]) => {
        const isActive = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={isActive}
            className={pill(isActive)}
          >
            <span className={cn("flex items-center", typeIconTint(key))}>
              <AwardTypeIcon type={key} />
            </span>
            <span className="truncate">{key}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * One media-type section heading: glyph, dim label, then a hairline rule that
 * pushes across the remaining width.
 */
export function AwardGroupHeading({ label }: { label: string }) {
  return (
    <h3 className="mb-2 mt-[22px] flex items-center gap-2">
      <span className={cn("flex items-center", typeIconTint(label))}>
        <AwardTypeIcon type={label} size={13} />
      </span>
      <span className="text-[12.5px] font-semibold text-gray-400">{label}</span>
      <span aria-hidden className="h-px flex-1 bg-white/5" />
    </h3>
  );
}
