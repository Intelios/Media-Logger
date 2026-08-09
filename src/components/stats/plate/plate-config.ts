export const PLATE_PANEL_IDS = [
  "genres",
  "scores",
  "catalogue",
  "standouts",
  "content-types",
  "multi-log-days",
] as const;

export const PLATE_FIGURE_IDS = [
  "total",
  "average",
  "rewatches",
  "perfect",
  "this-month",
  "genre-count",
] as const;

export const TIMELINE_LAYER_IDS = ["completions", "score", "rewatches", "platinums"] as const;

export type PlatePanelId = (typeof PLATE_PANEL_IDS)[number];
export type PlateFigureId = (typeof PLATE_FIGURE_IDS)[number];
export type TimelineLayerId = (typeof TIMELINE_LAYER_IDS)[number];
export type PlateAccent = "purple" | "amber" | "blue" | "pink" | "green" | "cyan";

export const PLATE_SLOT_COUNT = 4;

export interface PlatePanelDefinition {
  id: PlatePanelId;
  label: string;
  description: string;
  accent: PlateAccent;
}

export const PLATE_PANEL_DEFINITIONS: Record<PlatePanelId, PlatePanelDefinition> = {
  genres: {
    id: "genres",
    label: "Genres",
    description: "Share and ranking of every genre in the selection.",
    accent: "purple",
  },
  scores: {
    id: "scores",
    label: "Scores",
    description: "Rating distribution, with average score by type behind it.",
    accent: "amber",
  },
  catalogue: {
    id: "catalogue",
    label: "Catalogue",
    description: "Platforms, franchises, studios, authors and actresses.",
    accent: "blue",
  },
  standouts: {
    id: "standouts",
    label: "Standouts",
    description: "Most replayed entries and perfect scores.",
    accent: "pink",
  },
  "content-types": {
    id: "content-types",
    label: "Content Types",
    description: "Share of entries by content type. Also shown on the toolbar chips.",
    accent: "green",
  },
  "multi-log-days": {
    id: "multi-log-days",
    label: "Multiple Logs Per Day",
    description: "Days with more than one entry. Also marked on the timeline strip.",
    accent: "cyan",
  },
};

export interface PlateFigureDefinition {
  id: PlateFigureId;
  label: string;
  accent: PlateAccent;
}

export const PLATE_FIGURE_DEFINITIONS: Record<PlateFigureId, PlateFigureDefinition> = {
  total: { id: "total", label: "Entries", accent: "blue" },
  average: { id: "average", label: "Avg score", accent: "amber" },
  rewatches: { id: "rewatches", label: "Rewatches", accent: "green" },
  perfect: { id: "perfect", label: "Perfect 10s", accent: "pink" },
  "this-month": { id: "this-month", label: "This month", accent: "cyan" },
  "genre-count": { id: "genre-count", label: "Genres", accent: "purple" },
};

export interface TimelineLayerDefinition {
  id: TimelineLayerId;
  label: string;
  color: string;
  /** Score rides its own 0–10 axis; the rest are counts on a shared axis. */
  axis: "count" | "score";
}

export const TIMELINE_LAYER_DEFINITIONS: Record<TimelineLayerId, TimelineLayerDefinition> = {
  completions: { id: "completions", label: "Completions", color: "#8b5cf6", axis: "count" },
  score: { id: "score", label: "Avg score", color: "#34d399", axis: "score" },
  rewatches: { id: "rewatches", label: "Rewatches", color: "#f472b6", axis: "count" },
  platinums: { id: "platinums", label: "Platinums", color: "#fbbf24", axis: "count" },
};

export interface PlatePreferences {
  slots: PlatePanelId[];
  figures: PlateFigureId[];
  layers: TimelineLayerId[];
  compareEnabled: boolean;
  compareYear: string | null;
}

export const DEFAULT_PLATE_PREFERENCES: PlatePreferences = {
  slots: ["genres", "scores", "catalogue", "standouts"],
  figures: [...PLATE_FIGURE_IDS],
  layers: ["completions", "score"],
  compareEnabled: false,
  compareYear: null,
};

const PLATE_PREFERENCES_KEY = "media-logger-stats-plate";

const PANEL_ID_SET = new Set<string>(PLATE_PANEL_IDS);
const FIGURE_ID_SET = new Set<string>(PLATE_FIGURE_IDS);
const LAYER_ID_SET = new Set<string>(TIMELINE_LAYER_IDS);

function sanitizeSlots(value: unknown): PlatePanelId[] {
  const fallback = DEFAULT_PLATE_PREFERENCES.slots;
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const slots = fallback.map((defaultPanel, index) => {
    const candidate = value[index];
    return typeof candidate === "string" && PANEL_ID_SET.has(candidate) ? (candidate as PlatePanelId) : defaultPanel;
  });

  // A panel may only occupy one slot; collapse duplicates back to the default
  // for that position so a corrupted store cannot render the same panel twice.
  const seen = new Set<PlatePanelId>();
  return slots.map((panelId, index) => {
    if (seen.has(panelId)) {
      const replacement = PLATE_PANEL_IDS.find((candidate) => !seen.has(candidate)) ?? fallback[index];
      seen.add(replacement);
      return replacement;
    }

    seen.add(panelId);
    return panelId;
  });
}

function sanitizeIdList<T extends string>(value: unknown, allowed: Set<string>, fallback: T[]): T[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const filtered = value.filter((item): item is T => typeof item === "string" && allowed.has(item));
  return [...new Set(filtered)];
}

export function loadPlatePreferences(): PlatePreferences {
  try {
    const stored = localStorage.getItem(PLATE_PREFERENCES_KEY);
    if (!stored) {
      return { ...DEFAULT_PLATE_PREFERENCES, slots: [...DEFAULT_PLATE_PREFERENCES.slots] };
    }

    const parsed = JSON.parse(stored) as Partial<PlatePreferences>;

    return {
      slots: sanitizeSlots(parsed.slots),
      figures: sanitizeIdList(parsed.figures, FIGURE_ID_SET, DEFAULT_PLATE_PREFERENCES.figures),
      layers: sanitizeIdList(parsed.layers, LAYER_ID_SET, DEFAULT_PLATE_PREFERENCES.layers),
      compareEnabled: typeof parsed.compareEnabled === "boolean" ? parsed.compareEnabled : false,
      compareYear: typeof parsed.compareYear === "string" ? parsed.compareYear : null,
    };
  } catch {
    return { ...DEFAULT_PLATE_PREFERENCES, slots: [...DEFAULT_PLATE_PREFERENCES.slots] };
  }
}

export function savePlatePreferences(preferences: PlatePreferences) {
  try {
    localStorage.setItem(PLATE_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are a convenience; a full or blocked store must not break the page.
  }
}
