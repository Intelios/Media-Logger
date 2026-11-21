import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CoverImage } from "../CoverImage";
import { useHoverTooltip } from "../HoverTooltip";
import { useCoverPalettes } from "../../lib/cover-palette";
import { cn } from "../../lib/utils_ui";

/** Gold focus ring shared by every interactive control on the Awards page. */
export const AWARD_FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d6ab5c]/60";

/** Gold-outline call to action (“Add award”, “New year”). */
export const AWARD_GOLD_ICON_BUTTON =
  "inline-flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-[#d6ab5c]/35 bg-[#d6ab5c]/[0.08] text-[#f0d391] transition-colors hover:border-[#d6ab5c]/60 hover:bg-[#d6ab5c]/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d6ab5c]/60";

/** Gold-outline call to action (“Add award”, “New year”). */
export const AWARD_GOLD_OUTLINE =
  "inline-flex h-[38px] items-center justify-center gap-1.5 rounded-[10px] border border-[#d6ab5c]/35 bg-[#d6ab5c]/[0.08] px-3.5 text-[13px] font-semibold text-[#f0d391] transition-colors hover:border-[#d6ab5c]/60 hover:bg-[#d6ab5c]/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d6ab5c]/60";

/** Quiet bordered icon button (back, reorder, remove). */
export const AWARD_ICON_BUTTON =
  "inline-flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04] text-gray-400 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:bg-white/[0.04] disabled:hover:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d6ab5c]/60";

interface AwardRowProps {
  /** Small dim line above the headline — award name, year, or usage count. */
  label: string;
  /** Winner name (year/award views) or award name (home view). */
  headline: string | null;
  /** Person credited beside the winner, shown after it: "Oppenheimer — Cillian Murphy". */
  credit?: string | null;
  imagePath: string | null;
  /** Whether a winner exists — drives cover vs dashed slot (a winner may lack art). */
  decided: boolean;
  selected?: boolean;
  onSelect: () => void;
  /** Optional right-aligned badge inside the row button (e.g. win count pill). */
  badge?: ReactNode;
  /** Optional hover delete affordance. */
  onDelete?: () => void;
  deleteLabel?: string;
  deleteTooltip?: string;
}

/**
 * One award line in the Folio layout: the print on its mount, a dim label and a
 * headline. Selection is a gold wash plus inset ring; undecided rows show a
 * dashed window and prompt for a winner.
 */
export function AwardRow({
  label,
  headline,
  credit = null,
  imagePath,
  decided,
  selected = false,
  onSelect,
  badge,
  onDelete,
  deleteLabel = "Delete award",
  deleteTooltip = "Delete award",
}: AwardRowProps) {
  const { bindTooltip } = useHoverTooltip();
  const placeholder = headline == null || headline.length === 0;

  // Every thumb is the same window; the artwork sits whole inside it on a
  // mount tinted from its own cover, so a wide key-art banner and a tall poster
  // read as the same kind of object. "Not loaded yet" and "no palette" share
  // the neutral mount.
  const palettes = useCoverPalettes(decided && imagePath ? [imagePath] : []);
  const palette = imagePath ? palettes.get(imagePath) : undefined;
  const mount = palette
    ? `color-mix(in srgb, ${palette.base} 26%, #151219)`
    : "rgba(255, 255, 255, 0.03)";

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "grid w-full items-center gap-3.5 rounded-[10px] p-2 text-left transition-colors duration-150",
          badge
            ? "grid-cols-[112px_minmax(0,1fr)_auto]"
            : "grid-cols-[112px_minmax(0,1fr)]",
          selected
            ? "bg-[#d6ab5c]/[0.10] ring-1 ring-inset ring-[#d6ab5c]/[0.28]"
            : "hover:bg-white/5",
          onDelete && "pr-11",
          AWARD_FOCUS_RING
        )}
      >
        <span
          className={cn(
            "relative flex h-16 w-[112px] shrink-0 items-center justify-center overflow-hidden rounded-[5px]",
            decided
              ? "ring-1 ring-white/[0.08]"
              : "border-[1.5px] border-dashed border-white/[0.18] text-white/25"
          )}
          style={decided ? { background: mount } : { background: "rgba(255,255,255,0.02)" }}
        >
          {decided ? (
            <CoverImage
              path={imagePath}
              alt={headline ?? label}
              variant="small"
              priority="low"
              containerClassName="flex h-full w-full items-center justify-center p-1.5"
              imageClassName="max-h-full max-w-full object-contain"
            />
          ) : (
            <Plus size={16} />
          )}
        </span>

        <span className="min-w-0">
          <span
            className={cn(
              "block truncate text-[12px] font-medium",
              selected ? "text-[#d6ab5c]" : "text-white/40"
            )}
          >
            {label}
          </span>
          {placeholder ? (
            <span className="block truncate text-[15px] font-medium tracking-tight text-white/40">
              No winner yet
            </span>
          ) : (
            // The entry gives way first so the credited person stays readable;
            // the name only truncates once it alone passes 55% of the line.
            <span
              className={cn(
                "flex min-w-0 items-baseline text-[16.5px] font-semibold tracking-tight",
                selected ? "text-[#f0d391]" : "text-white"
              )}
            >
              <span className="min-w-0 truncate">{headline}</span>
              {credit && (
                <span
                  className={cn(
                    "ml-1.5 max-w-[55%] shrink-0 truncate font-medium",
                    selected ? "text-[#f0d391]/70" : "text-white/55"
                  )}
                >
                  — {credit}
                </span>
              )}
            </span>
          )}
        </span>

        {badge && <span className="shrink-0 pr-1">{badge}</span>}
      </button>

      {onDelete && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          aria-label={deleteLabel}
          {...bindTooltip(<span>{deleteTooltip}</span>, {
            width: "content",
            className: "rounded-lg px-3 py-1.5 whitespace-nowrap",
          })}
          className={cn(
            "absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/35 opacity-0 transition-[color,background-color,opacity] duration-150 hover:bg-red-500/10 hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100",
            AWARD_FOCUS_RING
          )}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
