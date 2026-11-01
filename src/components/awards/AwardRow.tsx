import { Plus, Trash2 } from "lucide-react";
import { CoverImage } from "../CoverImage";
import { useHoverTooltip } from "../HoverTooltip";
import { cn } from "../../lib/utils_ui";

/** Gold focus ring shared by every interactive control on the Awards page. */
export const AWARD_FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d6ab5c]/60";

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
  imagePath: string | null;
  /** Whether a winner exists — drives cover vs dashed slot (a winner may lack art). */
  decided: boolean;
  selected?: boolean;
  onSelect: () => void;
  /** Position in the list — drives the mount-only entrance stagger. */
  index?: number;
  /** 40px cover variant used by the home view's “Every award” list. */
  compact?: boolean;
  /** Optional hover delete affordance (home view only). */
  onDelete?: () => void;
  deleteLabel?: string;
  deleteTooltip?: string;
}

/**
 * One award line in the Folio layout: a 2:3 cover, a dim label and a headline.
 * Selection is a gold wash plus inset ring; undecided rows swap the cover for a
 * dashed slot and prompt for a winner.
 */
export function AwardRow({
  label,
  headline,
  imagePath,
  decided,
  selected = false,
  onSelect,
  index = 0,
  compact = false,
  onDelete,
  deleteLabel = "Delete award",
  deleteTooltip = "Delete award",
}: AwardRowProps) {
  const { bindTooltip } = useHoverTooltip();
  const placeholder = headline == null || headline.length === 0;

  return (
    <div
      className="group award-item-enter relative"
      style={{ animationDelay: `${Math.min(Math.max(index, 0) * 40, 300)}ms` }}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "grid w-full items-center gap-3.5 rounded-[10px] p-2 text-left transition-colors duration-150",
          compact
            ? "grid-cols-[40px_minmax(0,1fr)]"
            : "grid-cols-[48px_minmax(0,1fr)]",
          selected
            ? "bg-[#d6ab5c]/[0.10] ring-1 ring-inset ring-[#d6ab5c]/[0.28]"
            : "hover:bg-white/5",
          onDelete && "pr-11",
          AWARD_FOCUS_RING
        )}
      >
        <span
          className={cn(
            "relative block aspect-[2/3] overflow-hidden rounded-[5px]",
            decided
              ? "shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
              : "border-[1.5px] border-dashed border-white/[0.18] bg-white/[0.02]"
          )}
        >
          {decided ? (
            <CoverImage
              path={imagePath}
              alt={headline ?? label}
              variant="small"
              priority="low"
              containerClassName="h-full w-full"
              imageClassName="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-white/25">
              <Plus size={compact ? 14 : 16} />
            </span>
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
          <span
            className={cn(
              "block truncate tracking-tight",
              placeholder
                ? "text-[15px] font-medium text-white/40"
                : cn(
                    "text-[16.5px] font-semibold",
                    selected ? "text-[#f0d391]" : "text-white"
                  )
            )}
          >
            {placeholder ? "Choose a winner" : headline}
          </span>
        </span>
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
