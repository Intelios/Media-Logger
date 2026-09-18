import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Layers } from "lucide-react";
import { getTypeBadgeStyle, getVisibleEntryTypeOptions } from "../lib/media-config";
import { cn } from "../lib/utils_ui";
import { useEscapeToClose } from "../lib/useEscapeToClose";

interface AwardTypeMenuProps {
  /** The award's media type — null means the catch-all "General" group. */
  value: string | null;
  onChange: (type: string | null) => void;
  /** Extra classes on the outer relative container (e.g. for positioning). */
  className?: string;
  /**
   * Fired when the dropdown opens or closes. Entrance animations retain their
   * final transform (fill-mode: forwards), so neighbouring cards keep a
   * permanent stacking context and paint over this dropdown — parents should
   * raise their own z-index while this reports open.
   */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Media-type picker for an award template. Follows the CollectionSortMenu
 * dropdown idiom (anchored panel, close on outside mousedown) rather than a
 * native <select>, which can't be themed to match the rest of the page.
 */
export function AwardTypeMenu({ value, onChange, className, onOpenChange }: AwardTypeMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEscapeToClose(isOpen, () => setIsOpen(false));

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const badge = getTypeBadgeStyle(value);
  const options = [
    { value: null as string | null, label: "General", icon: <Layers size={14} /> },
    ...getVisibleEntryTypeOptions().map(o => ({ value: o.value as string | null, label: o.value, icon: o.icon })),
  ];

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          setIsOpen(open => !open);
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Set award type"
        className={cn(
          "flex items-center gap-1.5 rounded-full text-xs font-semibold transition-all",
          value
            ? cn("px-2.5 py-1 text-white shadow-md", badge.bg)
            : "px-2.5 py-1 border border-dashed border-white/20 text-gray-400 hover:border-amber-500/40 hover:text-amber-300"
        )}
      >
        {value ? badge.icon : <Layers size={12} />}
        <span>{value ?? "General"}</span>
        <ChevronDown size={11} className={cn("transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute left-0 mt-2 w-48 max-h-72 overflow-y-auto custom-scrollbar bg-[#1a1a1a] border border-white/10 rounded-xl shadow-xl z-50 backdrop-blur-3xl p-1.5 space-y-0.5"
        >
          {options.map(option => {
            const isActive = option.value === value;
            return (
              <button
                key={option.label}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={e => {
                  e.stopPropagation();
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                  isActive ? "bg-amber-500/10 text-amber-300 font-medium" : "text-gray-300 hover:bg-white/5"
                )}
              >
                <span className={cn("flex items-center justify-center w-5", isActive ? "text-amber-400" : "text-gray-500")}>
                  {option.icon}
                </span>
                <span className="flex-1 truncate">{option.label}</span>
                {isActive && <Check size={14} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
