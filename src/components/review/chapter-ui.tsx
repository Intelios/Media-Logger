import {
  Award,
  BarChart3,
  BookHeart,
  Crown,
  Flame,
  Globe,
  Layers,
  Play,
  Repeat,
  Sparkles,
  Star,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { ReelChapterId } from "../../lib/review-logic";

/**
 * Icon and accent per chapter, keyed by the same id the specs use.
 *
 * Kept beside the components rather than in lib/review/chapters.ts so the
 * gating logic there stays free of React and lucide.
 */
export const CHAPTER_UI: Record<ReelChapterId, { icon: LucideIcon; tint: string; color: string }> = {
  overview: { icon: Sparkles, tint: "rgba(94,53,177,0.16)", color: "#a78bfa" },
  "type-champion": { icon: Crown, tint: "rgba(30,136,229,0.16)", color: "#60a5fa" },
  "biggest-month": { icon: Flame, tint: "rgba(249,115,22,0.14)", color: "#fb923c" },
  bookends: { icon: BookHeart, tint: "rgba(244,63,94,0.14)", color: "#fb7185" },
  "top-genre": { icon: Layers, tint: "rgba(236,72,153,0.14)", color: "#f472b6" },
  constellation: { icon: Globe, tint: "rgba(139,92,246,0.16)", color: "#c4b5fd" },
  "top-franchise": { icon: Repeat, tint: "rgba(6,182,212,0.14)", color: "#22d3ee" },
  ratings: { icon: BarChart3, tint: "rgba(99,102,241,0.16)", color: "#818cf8" },
  "perfect-tens": { icon: Star, tint: "rgba(251,191,36,0.14)", color: "#fbbf24" },
  versus: { icon: TrendingUp, tint: "rgba(16,185,129,0.14)", color: "#34d399" },
  awards: { icon: Award, tint: "rgba(251,191,36,0.14)", color: "#fbbf24" },
  signature: { icon: Play, tint: "rgba(251,191,36,0.16)", color: "#fbbf24" },
  finale: { icon: Sparkles, tint: "rgba(255,255,255,0.06)", color: "#ffffff" },
};
