// Shared visual vocabulary for the Backlog shelf.
//
// The page is a bookcase: media types are spine colours, and every shelf shares
// one set of measurements so a plank, a row of spines and the label rail beneath
// it all line up. Changing a metric here changes it everywhere — do not hardcode
// these numbers in components.

/** Every shelf item is this tall, so a plank always lands on the same line. */
export const ITEM_HEIGHT = 196;

/** How far a spine or case lifts out of the shelf on hover. */
export const HOVER_LIFT = 16;

/** A queued spine. Narrow enough that ~28 fit a shelf at typical window widths. */
export const SPINE_WIDTH = 34;
export const SPINE_GAP = 3;

/** An in-progress item, pulled off the shelf and turned face-out. */
export const FACEOUT_WIDTH = 132;
export const FACEOUT_GAP = 16;

/** Past this, a planning item's age label turns red. */
export const AGE_HOT_DAYS = 180;

/**
 * Spine colour by media type — same hues as the badge colours used across the
 * rest of the app, so a Game is the same purple here as on a MediaCard, but
 * pitched several steps darker.
 *
 * The shade matters: a whole rack of `-700 → -500` gradients reads as a row of
 * neon strips rather than a shelf of physical media. Keeping the stops in the
 * `-950 → -700` range leaves the hue identifiable while letting the printed
 * white type carry the contrast, which is how a real spine works.
 */
export const getSpineGradient = (type: string): string => {
  const t = type.toLowerCase();
  if (t.includes("album")) return "from-emerald-950 to-emerald-700";
  if (t.includes("game")) return "from-purple-950 to-purple-700";
  if (t.includes("anime")) return "from-pink-950 to-pink-700";
  if (t.includes("k-drama")) return "from-teal-950 to-teal-700";
  if (t.includes("movie")) return "from-blue-950 to-blue-700";
  if (t.includes("show")) return "from-cyan-950 to-cyan-700";
  if (t.includes("book")) return "from-amber-950 to-amber-700";
  if (t.includes("jav") || t.includes("hentai")) return "from-rose-950 to-rose-700";
  if (t.includes("visual novel")) return "from-indigo-950 to-indigo-700";
  return "from-gray-900 to-gray-700";
};

/** Solid variant of the spine colour, for tooltip type badges. */
export const getTypeSolid = (type: string): string => {
  const t = type.toLowerCase();
  if (t.includes("album")) return "bg-emerald-600";
  if (t.includes("game")) return "bg-purple-600";
  if (t.includes("anime")) return "bg-pink-500";
  if (t.includes("k-drama")) return "bg-teal-600";
  if (t.includes("movie")) return "bg-blue-600";
  if (t.includes("show")) return "bg-cyan-600";
  if (t.includes("book")) return "bg-amber-600";
  if (t.includes("jav") || t.includes("hentai")) return "bg-rose-600";
  if (t.includes("visual novel")) return "bg-indigo-600";
  return "bg-gray-600";
};
