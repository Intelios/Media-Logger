import type { CSSProperties } from 'react';
import { CARD_COVER_SIZES, type CoverVariant } from './image-service';

// Non-destructive framing for an entry's cover on poster cards: which part of
// the art the card shows, and how far it is zoomed. Stored as JSON in
// entries.cover_framing (so it travels with the database and backups) and
// applied at render time. The image file and its derivatives are never cropped.
//
// x / y are object-position percentages (0 = left/top edge of the art against
// the frame's edge, 100 = right/bottom), and the zoom scales around that same
// point. With object-fit: cover that puts the art's left edge at
// (x / 100) * (frameWidth - scale * coverWidth), so one framing reads the same
// at any card size, including a poster that has grown taller than 2:3.
//
// NULL means "never framed" and renders centred. The editor always saves JSON,
// even for a reset, so a reset still wins when a backup is merged elsewhere.

export interface CoverFraming {
  x: number;
  y: number;
  scale: number;
}

export interface FrameSize {
  width: number;
  height: number;
}

export interface FramedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const DEFAULT_COVER_FRAMING: CoverFraming = { x: 50, y: 50, scale: 1 };
export const COVER_FRAMING_MIN_SCALE = 1;
export const COVER_FRAMING_MAX_SCALE = 3;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round2 = (value: number) => Math.round(value * 100) / 100;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function normalizeCoverFraming(framing: CoverFraming): CoverFraming {
  return {
    x: round2(clamp(framing.x, 0, 100)),
    y: round2(clamp(framing.y, 0, 100)),
    scale: round2(clamp(framing.scale, COVER_FRAMING_MIN_SCALE, COVER_FRAMING_MAX_SCALE)),
  };
}

/** Malformed or missing framing renders centred, like an unframed cover. */
export function parseCoverFraming(raw: string | null | undefined): CoverFraming | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' && parsed !== null &&
      'x' in parsed && isFiniteNumber(parsed.x) &&
      'y' in parsed && isFiniteNumber(parsed.y) &&
      'scale' in parsed && isFiniteNumber(parsed.scale)
    ) {
      return normalizeCoverFraming({ x: parsed.x, y: parsed.y, scale: parsed.scale });
    }
  } catch {
    // Treated as never framed.
  }
  return null;
}

export function serializeCoverFraming(framing: CoverFraming): string {
  const { x, y, scale } = normalizeCoverFraming(framing);
  return JSON.stringify({ x, y, scale });
}

export function isDefaultCoverFraming(framing: CoverFraming | null): boolean {
  if (!framing) return true;
  return framing.x === DEFAULT_COVER_FRAMING.x
    && framing.y === DEFAULT_COVER_FRAMING.y
    && framing.scale === DEFAULT_COVER_FRAMING.scale;
}

/**
 * Inline style for an `object-fit: cover` image that fills its frame. Callers
 * keep their own hover transforms on a wrapper: this owns the image's transform.
 */
export function coverFramingStyle(framing: CoverFraming | null): CSSProperties | undefined {
  if (!framing) return undefined;
  const origin = `${framing.x}% ${framing.y}%`;
  return {
    objectPosition: origin,
    transformOrigin: origin,
    transform: framing.scale > 1 ? `scale(${framing.scale})` : undefined,
  };
}

/** Size of the art under object-fit: cover, before the framing zoom. */
function coverSize(frame: FrameSize, natural: FrameSize): FrameSize {
  const fit = Math.max(frame.width / natural.width, frame.height / natural.height);
  return { width: natural.width * fit, height: natural.height * fit };
}

/** Where the whole (zoomed) art sits relative to the frame's top-left corner. */
export function framedImageRect(framing: CoverFraming, frame: FrameSize, natural: FrameSize): FramedRect {
  const base = coverSize(frame, natural);
  const width = base.width * framing.scale;
  const height = base.height * framing.scale;
  return {
    left: (framing.x / 100) * (frame.width - width),
    top: (framing.y / 100) * (frame.height - height),
    width,
    height,
  };
}

/** Position percentage that puts the art's leading edge at `edge`, or null when that axis has no overflow. */
function positionForEdge(edge: number, frameLength: number, artLength: number): number | null {
  const overflow = artLength - frameLength;
  if (overflow < 0.5) return null;
  return clamp((-edge / overflow) * 100, 0, 100);
}

/**
 * Moves the framing so the art follows the pointer 1:1. `start` is the framing
 * when the drag began and dx/dy the pointer's travel since then.
 */
export function panCoverFraming(
  start: CoverFraming,
  dx: number,
  dy: number,
  frame: FrameSize,
  natural: FrameSize,
): CoverFraming {
  const rect = framedImageRect(start, frame, natural);
  const x = positionForEdge(rect.left + dx, frame.width, rect.width);
  const y = positionForEdge(rect.top + dy, frame.height, rect.height);
  return normalizeCoverFraming({ ...start, x: x ?? start.x, y: y ?? start.y });
}

/**
 * Changes the zoom while keeping the art under `anchor` (frame pixels, default
 * the frame's centre) where it is, as far as the frame's edges allow.
 */
export function zoomCoverFraming(
  start: CoverFraming,
  nextScale: number,
  frame: FrameSize,
  natural: FrameSize,
  anchor: { x: number; y: number } = { x: frame.width / 2, y: frame.height / 2 },
): CoverFraming {
  const scale = clamp(nextScale, COVER_FRAMING_MIN_SCALE, COVER_FRAMING_MAX_SCALE);
  const before = framedImageRect(start, frame, natural);
  const after = framedImageRect({ ...start, scale }, frame, natural);
  const u = (anchor.x - before.left) / before.width;
  const v = (anchor.y - before.top) / before.height;
  const x = positionForEdge(anchor.x - u * after.width, frame.width, after.width);
  const y = positionForEdge(anchor.y - v * after.height, frame.height, after.height);
  return normalizeCoverFraming({ x: x ?? start.x, y: y ?? start.y, scale });
}

/** Scales the slot length of each `sizes` entry, leaving media conditions alone. */
function scaleSizes(sizes: string, scale: number): string {
  return sizes
    .split(',')
    .map((part) => part.trim().replace(/(\d+(?:\.\d+)?)(px|vw)$/u, (_, length: string, unit: string) => (
      `${Math.round(Number(length) * scale)}${unit}`
    )))
    .join(', ');
}

/**
 * Variant and `sizes` for a framed cover. A zoomed cover asks for proportionally
 * more pixels and switches to the hero srcset (card 768w, hero 1600w), so the
 * browser only fetches the hero derivative when the zoom actually needs it.
 * Unzoomed covers keep the card variant and the caller's sizes.
 */
export function framedCoverSizing(
  framing: CoverFraming | null,
  sizes?: string,
): { variant: CoverVariant; sizes: string | undefined } {
  if (!framing || framing.scale <= 1) return { variant: 'card', sizes };
  return { variant: 'hero', sizes: scaleSizes(sizes ?? CARD_COVER_SIZES, framing.scale) };
}
