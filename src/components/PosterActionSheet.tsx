import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { motion, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { MoreVertical, X } from "lucide-react";
import { cn } from "../lib/utils_ui";
import { useEscapeToClose } from "../lib/useEscapeToClose";

export interface PosterMenuAction {
  id: string;
  /** Full name: read by screen readers and shown in the header line on hover. */
  label: string;
  /** Under-button label. Small cards drop it and lean on the header line. */
  shortLabel: string;
  icon: ReactNode;
  onSelect: () => void;
  /** Danger actions leave the grid for a full-width pill at the foot. */
  tone?: "danger";
}

interface PosterActionSheetProps {
  entryName: string;
  actions: PosterMenuAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The card's palette shadow (#rrggbb): the trigger disc and the dimmed face. */
  shadow: string;
  /** The card's palette accent: the lit button. */
  accent: string;
  /** Position classes for the trigger, which parks beside the score ring. */
  anchorClass: string;
}

const GRID_COLUMNS = 3;

/** A quick, slightly underdamped pop, so a hovered ball swells with a wobble. */
const POP_SPRING = { stiffness: 520, damping: 15, mass: 0.6 };
/** A softer spring for leaning toward the pointer. */
const LEAN_SPRING = { stiffness: 300, damping: 18, mass: 0.6 };
const HOVER_SCALE = 1.12;
const PRESS_SCALE = 0.9;
/** Furthest the ball leans toward the pointer, in px. */
const LEAN_PX = 3.5;

const clampUnit = (value: number) => Math.max(-1, Math.min(1, value));

// The poster card's ⋯ menu. Rather than pop a list out of the card, the card's
// own face dims to its palette shadow and becomes the menu: round buttons that
// echo the score ring, lit in the cover's accent, with Delete set apart at the
// foot. It lives inside the card, so it scrolls with it and needs no portal or
// positioning. Rendered inside the poster's article, above the details.
export function PosterActionSheet({
  entryName,
  actions,
  open,
  onOpenChange,
  shadow,
  accent,
  anchorClass,
}: PosterActionSheetProps) {
  const triggerWrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // What the header line names: the hovered or keyboard-focused action, else
  // the entry itself.
  const [named, setNamed] = useState<string | null>(null);

  const gridActions = actions.filter((action) => action.tone !== "danger");
  const dangerActions = actions.filter((action) => action.tone === "danger");
  const ordered = [...gridActions, ...dangerActions];

  // Held in a ref so a parent re-render never re-runs the open effect (which
  // would pull focus back to the first button).
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  const closeAndReturnFocus = () => {
    onOpenChange(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  useEscapeToClose(open, closeAndReturnFocus);

  useEffect(() => {
    if (!open) {
      setNamed(null);
      return;
    }
    // A mouse open doesn't count as focus-visible, so this lights nothing
    // until the keyboard moves.
    itemRefs.current[0]?.focus({ preventScroll: true });
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (sheetRef.current?.contains(target) || triggerWrapRef.current?.contains(target)) return;
      onOpenChangeRef.current(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  // Tabbing out closes it. A null relatedTarget (a click on the sheet's own
  // non-focusable parts, or the window losing focus) leaves it open.
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (!next || event.currentTarget.contains(next) || triggerWrapRef.current?.contains(next)) return;
    onOpenChange(false);
  };

  // Arrows walk the three-column grid; Delete sits below its last row.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const count = ordered.length;
    const gridCount = gridActions.length;
    const current = itemRefs.current.findIndex((item) => item === document.activeElement);
    if (current === -1 || count === 0) return;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (current + 1) % count;
        break;
      case "ArrowLeft":
        next = (current - 1 + count) % count;
        break;
      case "ArrowDown":
        if (current >= gridCount) next = current + 1 < count ? current + 1 : 0;
        else next = current + GRID_COLUMNS < gridCount ? current + GRID_COLUMNS : gridCount < count ? gridCount : current % GRID_COLUMNS;
        break;
      case "ArrowUp":
        if (current > gridCount) next = current - 1;
        else if (current === gridCount) next = Math.max(0, gridCount - 1);
        else next = current - GRID_COLUMNS >= 0 ? current - GRID_COLUMNS : count - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    itemRefs.current[next]?.focus({ preventScroll: true });
  };

  const select = (action: PosterMenuAction) => (event: ReactMouseEvent) => {
    event.stopPropagation();
    onOpenChange(false);
    action.onSelect();
  };

  const nameHandlers = (action: PosterMenuAction) => ({
    onMouseEnter: () => setNamed(action.label),
    onMouseLeave: () => setNamed(null),
    onFocus: (event: FocusEvent<HTMLButtonElement>) => {
      if (event.currentTarget.matches(":focus-visible")) setNamed(action.label);
    },
    onBlur: () => setNamed(null),
  });

  return (
    <>
      <div ref={triggerWrapRef} className={cn("absolute z-40", anchorClass)}>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={open ? "Close actions" : `Actions for ${entryName}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpenChange(!open);
          }}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-white/85 shadow-[0_4px_12px_rgba(0,0,0,0.45)] transition-[opacity,color,border-color,background-color] duration-200 hover:border-white/35 hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
            open ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
          style={{ backgroundColor: shadow }}
        >
          {open ? <X size={14} strokeWidth={2.25} /> : <MoreVertical size={14} />}
        </button>
      </div>

      {open && (
        <div
          ref={sheetRef}
          className="poster-actions absolute inset-0 z-30 flex flex-col rounded-[inherit] px-3 pb-3 pt-14"
          style={{ "--sheet-shadow": shadow, "--sheet-accent": accent } as CSSProperties}
          // The whole face is the menu: no click lands on the card or its host
          // (the Collections picker toggles selection on card click).
          onClick={(event) => event.stopPropagation()}
          onBlur={handleBlur}
        >
          <p
            aria-hidden
            className={cn(
              "mb-3 truncate px-0.5 text-xs font-semibold transition-colors duration-150",
              named ? "text-[color:var(--sheet-accent)]" : "text-white/55",
            )}
          >
            {named ?? entryName}
          </p>

          <div
            role="menu"
            aria-label={`Actions for ${entryName}`}
            onKeyDown={handleKeyDown}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex flex-wrap justify-center gap-y-3">
              {gridActions.map((action, index) => (
                <SheetBubble
                  key={action.id}
                  action={action}
                  index={index}
                  buttonRef={(node) => { itemRefs.current[index] = node; }}
                  onSelect={select(action)}
                  onNamed={setNamed}
                />
              ))}
            </div>

            {dangerActions.length > 0 && (
              <div className="mt-auto flex flex-col gap-1.5 pt-3">
                {dangerActions.map((action, index) => {
                  const position = gridActions.length + index;
                  return (
                    <button
                      key={action.id}
                      ref={(node) => { itemRefs.current[position] = node; }}
                      type="button"
                      role="menuitem"
                      onClick={select(action)}
                      {...nameHandlers(action)}
                      className="poster-action poster-action-danger flex h-8 w-full items-center justify-center gap-1.5 rounded-full text-[12.5px] font-semibold"
                      style={{ "--i": position } as CSSProperties}
                    >
                      {action.icon}
                      <span>{action.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

interface SheetBubbleProps {
  action: PosterMenuAction;
  index: number;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onSelect: (event: ReactMouseEvent) => void;
  /** Names the action in the sheet's header line, or clears it with null. */
  onNamed: (label: string | null) => void;
}

// One round action that behaves like a soft ball: hovering swells it with a
// springy wobble and it leans a few pixels toward the pointer, pressing
// squashes it, and leaving lets it spring back. The icon leans further than
// the ball and a sheen slides the other way, so it reads as a lit sphere, not
// a flat disc nudging about. Springs only run while the pointer is moving
// them (nothing idles), and reduced motion keeps every ball still.
function SheetBubble({ action, index, buttonRef, onSelect, onNamed }: SheetBubbleProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const discRef = useRef<HTMLSpanElement>(null);
  const hovered = useRef(false);
  const scale = useSpring(1, POP_SPRING);
  const x = useSpring(0, LEAN_SPRING);
  const y = useSpring(0, LEAN_SPRING);
  const iconX = useTransform(x, (value) => value * 0.5);
  const iconY = useTransform(y, (value) => value * 0.5);
  const sheenX = useTransform(x, (value) => value * -1.6);
  const sheenY = useTransform(y, (value) => value * -1.6);

  const lean = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const disc = discRef.current;
    if (!disc || reduceMotion) return;
    const rect = disc.getBoundingClientRect();
    const reach = rect.width * 0.9;
    x.set(clampUnit((event.clientX - (rect.left + rect.width / 2)) / reach) * LEAN_PX);
    y.set(clampUnit((event.clientY - (rect.top + rect.height / 2)) / reach) * LEAN_PX);
  };

  const settle = () => {
    scale.set(1);
    x.set(0);
    y.set(0);
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      role="menuitem"
      aria-label={action.label}
      onClick={onSelect}
      onPointerEnter={(event) => {
        hovered.current = true;
        onNamed(action.label);
        if (reduceMotion) return;
        scale.set(HOVER_SCALE);
        lean(event);
      }}
      onPointerMove={lean}
      onPointerLeave={() => {
        hovered.current = false;
        onNamed(null);
        settle();
      }}
      onPointerDown={() => {
        if (!reduceMotion) scale.set(PRESS_SCALE);
      }}
      onPointerUp={() => {
        if (!reduceMotion) scale.set(hovered.current ? HOVER_SCALE : 1);
      }}
      onFocus={(event) => {
        if (!event.currentTarget.matches(":focus-visible")) return;
        onNamed(action.label);
        if (!reduceMotion) scale.set(HOVER_SCALE);
      }}
      onBlur={() => {
        onNamed(null);
        if (!hovered.current) settle();
      }}
      className="poster-action flex w-1/3 flex-col items-center gap-[5px]"
      style={{ "--i": index } as CSSProperties}
    >
      <motion.span
        ref={discRef}
        className="poster-action-disc relative flex items-center justify-center overflow-hidden rounded-full"
        style={{ scale, x, y }}
      >
        <motion.span aria-hidden className="poster-action-sheen" style={{ x: sheenX, y: sheenY }} />
        <motion.span className="relative flex" style={{ x: iconX, y: iconY }}>
          {action.icon}
        </motion.span>
      </motion.span>
      <span className="poster-action-label max-w-full truncate px-0.5 text-[11px] font-semibold leading-tight">
        {action.shortLabel}
      </span>
    </button>
  );
}
