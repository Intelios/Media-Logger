import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, RotateCcw, X } from "lucide-react";
import { useCoverPalette } from "../lib/cover-palette";
import {
  COVER_FRAMING_MAX_SCALE,
  COVER_FRAMING_MIN_SCALE,
  DEFAULT_COVER_FRAMING,
  coverFramingStyle,
  framedImageRect,
  normalizeCoverFraming,
  panCoverFraming,
  zoomCoverFraming,
  type CoverFraming,
  type FrameSize,
} from "../lib/cover-framing";
import { FALLBACK_SHADOW, TOP_SCRIM, scrimGradient } from "../lib/poster-scrims";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";
import { cn } from "../lib/utils_ui";
import { CoverImage } from "./CoverImage";
import { IndexTabPanel } from "./IndexTabPanel";

// Edits how a cover is framed on poster cards: drag the art to move the crop,
// scroll / pinch / slider to zoom. The frame is the poster's 2:3 shape, the
// art outside it shows dimmed, and the card's own shading can be laid over it
// to see where the title will sit. Saving hands back the framing; the caller
// decides whether it goes straight to the database (card menu) or rides along
// with the Edit form.

/** The poster's 2:3 shape at editing size. */
const FRAME: FrameSize = { width: 280, height: 420 };
/** Asks for enough pixels to stay sharp at full zoom on a 2x display. */
const ART_SIZES = `${FRAME.width * COVER_FRAMING_MAX_SCALE}px`;
const KEY_NUDGE_PX = 8;
const KEY_NUDGE_FAST_PX = 32;
const KEY_ZOOM_STEP = 0.1;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface CoverFramingDialogProps {
  /** Entry name, shown under the title. */
  name: string;
  /** A committed cover (relative path or https URL). */
  path?: string | null;
  /** A staged cover's preview URL; takes precedence over `path`. */
  src?: string;
  initial: CoverFraming | null;
  onCancel: () => void;
  /** Persist the framing. The dialog stays open (and shows saving) until it settles. */
  onSave: (framing: CoverFraming) => void | Promise<void>;
}

export function CoverFramingDialog({ name, path, src, initial, onCancel, onSave }: CoverFramingDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const naturalRef = useRef<FrameSize | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; base: CoverFraming } | null>(null);
  const backdropPressRef = useRef(false);
  const [draft, setDraft] = useState<CoverFraming>(initial ?? DEFAULT_COVER_FRAMING);
  const [natural, setNatural] = useState<FrameSize | null>(null);
  const [dragging, setDragging] = useState(false);
  const [shading, setShading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Staged covers have no palette yet; the neutral shadow stands in.
  const palette = useCoverPalette(src ? null : path);
  const shadow = palette?.shadow ?? FALLBACK_SHADOW;

  useEscapeToClose(true, onCancel);
  useFocusTrap(true, panelRef);

  const recordNaturalSize = useCallback((image: HTMLImageElement | null) => {
    if (!image || image.naturalWidth === 0 || image.naturalHeight === 0) return;
    const size = { width: image.naturalWidth, height: image.naturalHeight };
    const previous = naturalRef.current;
    if (previous && previous.width === size.width && previous.height === size.height) return;
    naturalRef.current = size;
    setNatural(size);
  }, []);

  // A cached cover can be complete before its load event is observed.
  const measureImage = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete) recordNaturalSize(image);
  }, [recordNaturalSize]);

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => recordNaturalSize(event.currentTarget);

  // Wheel and trackpad pinch zoom toward the pointer. Native and non-passive
  // so the page never scrolls underneath.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const size = naturalRef.current;
      const frame = frameRef.current;
      if (!size || !frame) return;
      const rect = frame.getBoundingClientRect();
      const anchor = {
        x: clamp(((event.clientX - rect.left) / rect.width) * FRAME.width, 0, FRAME.width),
        y: clamp(((event.clientY - rect.top) / rect.height) * FRAME.height, 0, FRAME.height),
      };
      // Pinch arrives as ctrl+wheel with small deltas.
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
      setDraft((current) => zoomCoverFraming(current, current.scale * factor, FRAME, size, anchor));
    };
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, []);

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !naturalRef.current || saving) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, base: draft };
    setDragging(true);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const size = naturalRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !size) return;
    setDraft(panCoverFraming(drag.base, event.clientX - drag.startX, event.clientY - drag.startY, FRAME, size));
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const zoomTo = (scale: number) => {
    const size = naturalRef.current;
    setDraft((current) => (
      size ? zoomCoverFraming(current, scale, FRAME, size) : normalizeCoverFraming({ ...current, scale })
    ));
  };

  // Arrow keys move the art like a drag (Shift for bigger steps); +/- zoom.
  const handleFrameKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const size = naturalRef.current;
    if (!size) return;
    const step = event.shiftKey ? KEY_NUDGE_FAST_PX : KEY_NUDGE_PX;
    const pan = (dx: number, dy: number) => setDraft((current) => panCoverFraming(current, dx, dy, FRAME, size));
    switch (event.key) {
      case "ArrowLeft": pan(-step, 0); break;
      case "ArrowRight": pan(step, 0); break;
      case "ArrowUp": pan(0, -step); break;
      case "ArrowDown": pan(0, step); break;
      case "+":
      case "=": zoomTo(draft.scale + KEY_ZOOM_STEP); break;
      case "-":
      case "_": zoomTo(draft.scale - KEY_ZOOM_STEP); break;
      default: return;
    }
    event.preventDefault();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(normalizeCoverFraming(draft));
    } finally {
      setSaving(false);
    }
  };

  const ghostRect = natural ? framedImageRect(draft, FRAME, natural) : null;

  const renderArt = (role: "frame" | "ghost") => {
    const framed = role === "frame";
    if (src) {
      return (
        <img
          ref={framed ? measureImage : undefined}
          src={src}
          alt=""
          draggable={false}
          onLoad={framed ? handleImageLoad : undefined}
          className={cn("h-full w-full", framed ? "absolute inset-0 object-cover" : "block")}
          style={framed ? coverFramingStyle(draft) : undefined}
        />
      );
    }
    return (
      <CoverImage
        ref={framed ? measureImage : undefined}
        path={path}
        variant="hero"
        sizes={ART_SIZES}
        priority="high"
        alt=""
        draggable={false}
        showSkeleton={framed}
        onLoad={framed ? handleImageLoad : undefined}
        containerClassName={framed ? "absolute inset-0" : "h-full w-full"}
        imageClassName={framed ? "h-full w-full object-cover" : "h-full w-full"}
        imageStyle={framed ? coverFramingStyle(draft) : undefined}
      />
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onPointerDown={(event) => {
        backdropPressRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        event.stopPropagation();
        // Only a click that also started on the backdrop closes: a drag
        // released outside the panel must not throw the edit away.
        if (event.target === event.currentTarget && backdropPressRef.current) onCancel();
        backdropPressRef.current = false;
      }}
    >
      <IndexTabPanel
        ref={panelRef}
        tab="Adjust Cover"
        tone="sky"
        title={name}
        onClose={onCancel}
        className="w-full max-w-xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          ref={stageRef}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          className={cn(
            "relative mt-4 flex h-[512px] touch-none select-none items-center justify-center overflow-hidden border-y border-white/5 bg-black/40",
            natural && (dragging ? "cursor-grabbing" : "cursor-grab"),
          )}
        >
          <div className="relative" style={{ width: FRAME.width, height: FRAME.height }}>
            {/* The rest of the art, dimmed, so it's clear what the crop leaves out */}
            {ghostRect && (
              <div
                aria-hidden
                className="pointer-events-none absolute opacity-25"
                style={{ left: ghostRect.left, top: ghostRect.top, width: ghostRect.width, height: ghostRect.height }}
              >
                {renderArt("ghost")}
              </div>
            )}
            <div
              ref={frameRef}
              tabIndex={0}
              role="group"
              aria-label="Cover framing. Arrow keys move the art; plus and minus zoom."
              onKeyDown={handleFrameKeyDown}
              className="absolute inset-0 overflow-hidden rounded-[15px] shadow-[0_20px_50px_rgba(0,0,0,0.55)] outline-none ring-2 ring-white/85 focus-visible:ring-primary"
              style={{ backgroundColor: shadow }}
            >
              {renderArt("frame")}
              {shading && (
                <>
                  <div aria-hidden className="pointer-events-none absolute inset-0 z-[2]" style={{ background: TOP_SCRIM }} />
                  <div aria-hidden className="pointer-events-none absolute inset-0 z-[2]" style={{ background: scrimGradient(shadow) }} />
                </>
              )}
            </div>
          </div>
          {/* Below the frame, and above its shading layers (z-[2]) */}
          <div className="pointer-events-none absolute bottom-2.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-[11px] font-medium text-white/85 backdrop-blur-md">
            Drag to move · Scroll or pinch to zoom
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex items-center gap-3">
            <span className="w-12 text-[11px] font-semibold uppercase tracking-wider text-gray-300">Zoom</span>
            <input
              type="range"
              min={COVER_FRAMING_MIN_SCALE}
              max={COVER_FRAMING_MAX_SCALE}
              step={0.05}
              value={draft.scale}
              onChange={(event) => zoomTo(Number(event.target.value))}
              aria-label="Zoom"
              className="flex-1 cursor-pointer accent-white"
            />
            <span className="w-10 text-right text-xs font-medium tabular-nums text-gray-200">{draft.scale.toFixed(1)}×</span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDraft(DEFAULT_COVER_FRAMING)}
                className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/20"
              >
                <RotateCcw size={14} /> Reset
              </button>
              <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={shading}
                  onChange={(event) => setShading(event.target.checked)}
                  className="cursor-pointer accent-white"
                />
                Card shading
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/20"
              >
                <X size={14} /> Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white shadow-lg shadow-primary/25 transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <Check size={14} /> {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </IndexTabPanel>
    </div>,
    document.body,
  );
}

export default CoverFramingDialog;
