import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { PosterData, PosterRow, ReviewContext } from "./types";

/**
 * The keepsake: a 1080×1350 PNG drawn from the run the user just watched.
 *
 * Hand-rendered on a canvas rather than rasterising DOM. Three reasons:
 *
 * 1. It cannot taint. The poster carries no cover art by design, so nothing
 *    cross-origin ever reaches the canvas. CoverImage never sets `crossOrigin`,
 *    so a DOM rasteriser that captured a cover would throw SecurityError on
 *    toBlob — even though the media:// responses do send an ACAO header.
 * 2. It is deterministic. Output is exactly 1080×1350 whatever the window size
 *    or display DPR; a DOM capture is at the mercy of the current layout.
 * 3. It adds no dependency. html2canvas exists to reuse existing markup, and
 *    this layout deliberately resembles no on-screen chapter.
 */

const WIDTH = 1080;
const HEIGHT = 1350;
const MARGIN = 72;

const SERIF_STACK = '"Instrument Serif", Georgia, serif';
const SANS_STACK = "Inter, system-ui, sans-serif";

const INK = "#ffffff";
const MUTED = "rgba(255,255,255,0.62)";
const FAINT = "rgba(255,255,255,0.30)";
const RULE = "rgba(255,255,255,0.14)";
const AMBER = "#fbbf24";

/** Derives the poster's content from the same context the chapters read. */
export function buildPosterData(ctx: ReviewContext): PosterData {
  const top5: PosterRow[] = [...ctx.dataset.ratedEntries]
    .sort((left, right) => right.review_score - left.review_score || right.id - left.id)
    .slice(0, 5)
    .map((entry, index) => ({
      rank: index + 1,
      name: entry.name,
      type: entry.entry_type,
      score: entry.review_score,
    }));

  const replayShare =
    ctx.basics.total > 0 ? ctx.basics.rewatch_count / ctx.basics.total : 0;
  const perfectShare =
    ctx.dataset.ratedEntries.length > 0
      ? ctx.basics.perfectTenCount / ctx.dataset.ratedEntries.length
      : 0;

  // A read of the run's shape, earned from the numbers rather than asserted.
  const archetype =
    replayShare >= 0.2
      ? "The Devotee"
      : perfectShare >= 0.25
        ? "The Enthusiast"
        : ctx.types.length >= 5
          ? "The Explorer"
          : ctx.genres.length >= 20
            ? "The Omnivore"
            : "The Regular";

  return {
    year: ctx.period.year,
    label: ctx.period.label,
    archetype,
    headline: `${ctx.basics.total} finished. ${ctx.basics.perfectTenCount} of them perfect.`,
    stats: [
      { label: "Finished", value: String(ctx.basics.total) },
      { label: "Average", value: ctx.basics.average_score.toFixed(1) },
      { label: "Perfect", value: String(ctx.basics.perfectTenCount), accent: AMBER },
      { label: "Replays", value: String(ctx.basics.rewatch_count) },
    ],
    top5,
    // Genre counts, normalised — the bloom is literally the shape of the run.
    bloom: (() => {
      const counts = ctx.genres.slice(0, 44).map((genre) => genre.count);
      const peak = counts[0] ?? 1;
      return counts.map((count) => count / peak);
    })(),
    footer: `${ctx.period.label} · ${ctx.types.length} ${ctx.types.length === 1 ? "kind" : "kinds"} of media · kept offline, on your machine`,
  };
}

/**
 * The canvas 2D `font` shorthand only resolves faces the document has already
 * loaded. With font-display: swap, Instrument Serif may not be loaded when we
 * draw — and the failure mode is silent: Times New Roman in the PNG, no error.
 * document.fonts.ready alone is not enough; it resolves without pulling in a
 * face nothing has rendered yet.
 */
async function ensureFonts(): Promise<boolean> {
  if (typeof document === "undefined" || !document.fonts) return false;
  try {
    await Promise.all([
      document.fonts.load(`400 168px ${SERIF_STACK}`),
      document.fonts.load(`italic 400 34px ${SERIF_STACK}`),
      document.fonts.load(`400 30px ${SERIF_STACK}`),
      document.fonts.load(`700 40px ${SANS_STACK}`),
      document.fonts.load(`600 20px ${SANS_STACK}`),
    ]);
    await document.fonts.ready;
    return document.fonts.check(`400 168px ${SERIF_STACK}`);
  } catch {
    return false;
  }
}

function truncate(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && context.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped.trimEnd()}…`;
}

/** Splits text to fit a width, returning the lines. */
function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** The generated bloom: one spoke per genre, length by share of the run. */
function drawBloom(
  context: CanvasRenderingContext2D,
  centreX: number,
  centreY: number,
  weights: number[],
) {
  const inner = 40;
  const maxLength = 108;
  const palette = ["#9333EA", "#EC4899", "#2563EB", "#0891B2", "#D97706", "#059669"];

  context.save();
  context.strokeStyle = "rgba(255,255,255,0.07)";
  context.lineWidth = 1;
  context.beginPath();
  context.arc(centreX, centreY, 152, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(centreX, centreY, 102, 0, Math.PI * 2);
  context.stroke();

  const count = Math.max(weights.length, 1);
  weights.forEach((weight, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    const length = inner + 14 + Math.pow(weight, 0.6) * maxLength;
    context.strokeStyle = palette[index % palette.length];
    context.globalAlpha = 0.45 + weight * 0.55;
    context.lineWidth = 2 + weight * 3.4;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(centreX + Math.cos(angle) * inner, centreY + Math.sin(angle) * inner);
    context.lineTo(centreX + Math.cos(angle) * length, centreY + Math.sin(angle) * length);
    context.stroke();
  });

  context.globalAlpha = 1;
  context.fillStyle = "#08080A";
  context.strokeStyle = "rgba(255,255,255,0.18)";
  context.lineWidth = 1;
  context.beginPath();
  context.arc(centreX, centreY, 34, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();
}

export async function renderReviewPoster(data: PosterData): Promise<Blob> {
  const fontsReady = await ensureFonts();
  const serif = fontsReady ? SERIF_STACK : "Georgia, serif";

  const canvas = document.createElement("canvas");
  // Set as attributes, not CSS: this is the pixel buffer, not a display size.
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");

  // Ground
  context.fillStyle = "#08080A";
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const wash = context.createRadialGradient(WIDTH / 2, 350, 0, WIDTH / 2, 350, 700);
  wash.addColorStop(0, "rgba(94,53,177,0.42)");
  wash.addColorStop(1, "rgba(94,53,177,0)");
  context.fillStyle = wash;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const foot = context.createRadialGradient(WIDTH / 2, HEIGHT, 0, WIDTH / 2, HEIGHT, 560);
  foot.addColorStop(0, "rgba(30,136,229,0.18)");
  foot.addColorStop(1, "rgba(30,136,229,0)");
  context.fillStyle = foot;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  // Masthead
  context.textBaseline = "alphabetic";
  context.font = `700 15px ${SANS_STACK}`;
  context.fillStyle = MUTED;
  context.letterSpacing = "4px";
  context.textAlign = "left";
  context.fillText("MEDIA LOGGER", MARGIN, MARGIN + 16);
  context.textAlign = "right";
  context.fillStyle = FAINT;
  context.fillText("ANNUAL REPORT", WIDTH - MARGIN, MARGIN + 16);
  context.letterSpacing = "0px";

  drawBloom(context, WIDTH / 2, 356, data.bloom);

  // The year
  context.textAlign = "center";
  context.fillStyle = INK;
  context.font = `400 168px ${serif}`;
  context.fillText(String(data.year), WIDTH / 2, 620);

  // Archetype line
  context.font = `500 22px ${SANS_STACK}`;
  const lead = `${data.headline} You were `;
  context.fillStyle = MUTED;
  const leadWidth = context.measureText(lead).width;
  context.font = `700 22px ${SANS_STACK}`;
  const nameWidth = context.measureText(data.archetype).width;
  const startX = WIDTH / 2 - (leadWidth + nameWidth) / 2;
  context.textAlign = "left";
  context.font = `500 22px ${SANS_STACK}`;
  context.fillStyle = MUTED;
  context.fillText(lead, startX, 672);
  context.font = `700 22px ${SANS_STACK}`;
  context.fillStyle = "#a3e635";
  context.fillText(data.archetype, startX + leadWidth, 672);

  // Stat row
  const cellWidth = (WIDTH - MARGIN * 2 - 3 * 20) / 4;
  data.stats.forEach((stat, index) => {
    const x = MARGIN + index * (cellWidth + 20);
    const y = 716;
    context.fillStyle = "rgba(255,255,255,0.03)";
    context.strokeStyle = "rgba(255,255,255,0.07)";
    context.lineWidth = 1;
    const radius = 18;
    context.beginPath();
    context.roundRect(x, y, cellWidth, 106, radius);
    context.fill();
    context.stroke();

    context.textAlign = "center";
    context.fillStyle = stat.accent ?? INK;
    context.font = `800 40px ${SANS_STACK}`;
    context.fillText(stat.value, x + cellWidth / 2, y + 56);
    context.fillStyle = "rgba(255,255,255,0.42)";
    context.font = `700 11px ${SANS_STACK}`;
    context.letterSpacing = "2px";
    context.fillText(stat.label.toUpperCase(), x + cellWidth / 2, y + 82);
    context.letterSpacing = "0px";
  });

  // Top five
  let y = 892;
  context.textAlign = "left";
  context.fillStyle = MUTED;
  context.font = `700 13px ${SANS_STACK}`;
  context.letterSpacing = "3px";
  context.fillText("THE TOP FIVE", MARGIN, y);
  context.textAlign = "right";
  context.fillStyle = FAINT;
  context.fillText("BY YOUR SCORE", WIDTH - MARGIN, y);
  context.letterSpacing = "0px";

  y += 18;
  context.strokeStyle = RULE;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(MARGIN, y);
  context.lineTo(WIDTH - MARGIN, y);
  context.stroke();

  const rowHeight = 68;
  data.top5.forEach((row, index) => {
    const rowY = y + rowHeight * (index + 1);

    context.textAlign = "left";
    context.fillStyle = index < 3 ? "#a78bfa" : "rgba(255,255,255,0.35)";
    context.font = `700 17px ${SANS_STACK}`;
    context.fillText(String(row.rank).padStart(2, "0"), MARGIN, rowY - 22);

    // Score and type are drawn first so the title knows its budget.
    const scoreText = row.score == null ? "" : Number.isInteger(row.score) ? String(row.score) : row.score.toFixed(1);
    context.textAlign = "right";
    context.fillStyle = row.score != null && row.score >= 9 ? AMBER : INK;
    context.font = `800 21px ${SANS_STACK}`;
    context.fillText(scoreText, WIDTH - MARGIN, rowY - 22);

    const typeText = (row.type ?? "").toUpperCase();
    context.font = `600 12px ${SANS_STACK}`;
    context.fillStyle = "rgba(255,255,255,0.42)";
    context.letterSpacing = "1.6px";
    const typeWidth = typeText ? context.measureText(typeText).width : 0;
    if (typeText) context.fillText(typeText, WIDTH - MARGIN - 62, rowY - 22);
    context.letterSpacing = "0px";

    context.textAlign = "left";
    context.fillStyle = INK;
    context.font = `400 30px ${serif}`;
    const titleBudget = WIDTH - MARGIN * 2 - 54 - typeWidth - 96;
    context.fillText(truncate(context, row.name, titleBudget), MARGIN + 54, rowY - 20);

    if (index < data.top5.length - 1) {
      context.strokeStyle = "rgba(255,255,255,0.07)";
      context.beginPath();
      context.moveTo(MARGIN, rowY);
      context.lineTo(WIDTH - MARGIN, rowY);
      context.stroke();
    }
  });

  // Footer
  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.beginPath();
  context.moveTo(MARGIN, HEIGHT - MARGIN - 40);
  context.lineTo(WIDTH - MARGIN, HEIGHT - MARGIN - 40);
  context.stroke();

  context.textAlign = "center";
  context.fillStyle = FAINT;
  context.font = `500 13px ${SANS_STACK}`;
  const footerLines = wrapText(context, data.footer, WIDTH - MARGIN * 2);
  footerLines.forEach((line, index) => {
    context.fillText(line, WIDTH / 2, HEIGHT - MARGIN - 12 + index * 18);
  });

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Could not encode the poster");
  return blob;
}

export type PosterSaveResult =
  | { ok: true; path: string }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "error"; message: string };

export async function saveReviewPoster(data: PosterData): Promise<PosterSaveResult> {
  let filePath: string | null;
  try {
    filePath = await save({
      defaultPath: `media-logger-${data.label.replace(/\s+/g, "-").toLowerCase()}-poster.png`,
      filters: [{ name: "PNG image", extensions: ["png"] }],
    });
  } catch (error) {
    console.error("Poster save dialog failed:", error);
    return { ok: false, reason: "error", message: "Could not open the save dialog." };
  }

  // Cancelling is a normal outcome, never an error state.
  if (!filePath) return { ok: false, reason: "cancelled" };

  try {
    const blob = await renderReviewPoster(data);
    await writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
    return { ok: true, path: filePath };
  } catch (error) {
    console.error("Failed to save review poster:", error);
    // The granted fs scope covers the home directory and its usual children;
    // an external volume or a system path throws here.
    return {
      ok: false,
      reason: "error",
      message: "Couldn’t save there. Choose a folder inside your home directory.",
    };
  }
}

export async function revealPoster(path: string | undefined): Promise<void> {
  if (!path) return;
  try {
    await revealItemInDir(path);
  } catch (error) {
    console.error("Failed to reveal the poster:", error);
  }
}
