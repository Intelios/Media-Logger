// Shading shared by the poster card and the cover framing editor, so the
// editor previews exactly where a card's chips and details darken the art.

/** Stands in for the palette shadow until it arrives, and for coverless entries. */
export const FALLBACK_SHADOW = "#0c0c0e";

/** Darkens the top edge so the corner chips and score ring read on any art. */
export const TOP_SCRIM = "linear-gradient(to bottom, rgba(0, 0, 0, 0.38) 0%, rgba(0, 0, 0, 0) 24%)";

/** Bottom-up fade into a solid colour. `color` must be #rrggbb so alpha can be appended. */
export const scrimGradient = (color: string) =>
  `linear-gradient(to top, ${color} 0%, ${color}f2 30%, ${color}a6 50%, ${color}00 72%)`;
