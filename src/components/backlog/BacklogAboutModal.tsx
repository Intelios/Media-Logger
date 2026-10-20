import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Globe, Info, Loader2 } from "lucide-react";
import type { BacklogItem } from "../../lib/db";
import { CoverImage } from "../CoverImage";
import { useEscapeToClose } from "../../lib/useEscapeToClose";
import { useFocusTrap } from "../../lib/useFocusTrap";
import {
  fetchSynopsis,
  getCoverSearchProviderName,
  getSynopsisAvailability,
  type MediaSynopsis,
} from "../../lib/cover-search";
import { openWebSearch } from "../../lib/web-search";
import { getSpineGradient } from "./backlog-visuals";
import { cn } from "../../lib/utils_ui";

interface BacklogAboutModalProps {
  item: BacklogItem | null;
  onClose: () => void;
}

type SynopsisState =
  | { kind: "loading" }
  | { kind: "found"; synopsis: MediaSynopsis }
  | { kind: "none" }
  | { kind: "error"; message: string };

// "What was this about again?" — the provider synopsis when Cover Art can
// fetch one for this type, and a web search that always works as a fallback.
// Nothing here is saved to the item.
export function BacklogAboutModal({ item, onClose }: BacklogAboutModalProps) {
  const isOpen = item !== null;
  const modalRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<SynopsisState>({ kind: "loading" });
  const [webError, setWebError] = useState<string | null>(null);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  const availability = item ? getSynopsisAvailability(item.entry_type) : "unsupported";

  useEffect(() => {
    if (!item || availability !== "ready") return;
    let cancelled = false;
    setState({ kind: "loading" });
    setWebError(null);
    fetchSynopsis(item.name, item.entry_type)
      .then((synopsis) => {
        if (!cancelled) setState(synopsis ? { kind: "found", synopsis } : { kind: "none" });
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [item, availability]);

  if (!item) return null;

  const provider = getCoverSearchProviderName(item.entry_type);

  const handleWebSearch = () => {
    setWebError(null);
    openWebSearch(item.name, item.entry_type).catch(() =>
      setWebError("Couldn't open your browser.")
    );
  };

  const unavailableMessage =
    availability === "disabled"
      ? "Turn on Cover Art in Settings to show a synopsis here."
      : availability === "needs-key"
        ? `${provider} needs an API key before it can look this up. Add it in Settings → Cover Art.`
        : `There's no synopsis source for ${item.entry_type} entries.`;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-label={`About ${item.name}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[85vh] rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        {/* Header */}
        <div className="flex items-start gap-4 px-6 py-5 border-b border-white/10">
          <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-md border border-white/10">
            {item.image_url ? (
              <CoverImage
                path={item.image_url}
                variant="small"
                alt={item.name}
                sizes="64px"
                priority="high"
                containerClassName="absolute inset-0"
                imageClassName="h-full w-full object-cover"
              />
            ) : (
              <div className={cn("h-full w-full bg-gradient-to-br", getSpineGradient(item.entry_type))} />
            )}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h2 className="text-lg font-bold leading-tight text-white">{item.name}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {item.entry_type}
              {item.genre ? ` · ${item.genre}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors shrink-0"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* Synopsis */}
        <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
          {availability !== "ready" ? (
            <Muted>{unavailableMessage}</Muted>
          ) : state.kind === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={14} className="spin" />
              <span>Looking it up on {provider}…</span>
            </div>
          ) : state.kind === "found" ? (
            <div>
              <p className="mb-3 text-xs text-gray-500">
                Matched{" "}
                <span className="font-medium text-gray-300">{state.synopsis.title}</span>
                {state.synopsis.subtitle ? ` · ${state.synopsis.subtitle}` : ""} on{" "}
                {state.synopsis.provider}
              </p>
              <div className="space-y-3 text-sm leading-relaxed text-gray-200">
                {state.synopsis.overview.split("\n\n").map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </div>
          ) : state.kind === "none" ? (
            <Muted>{provider} has no synopsis for “{item.name}”. Try a web search instead.</Muted>
          ) : (
            <Muted>{state.message}</Muted>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-white/10">
          <p className="min-w-0 truncate text-[11px] text-gray-600">
            {webError ??
              (state.kind === "found" && state.synopsis.provider === "TMDB"
                ? "This product uses the TMDB API but is not endorsed or certified by TMDB."
                : "")}
          </p>
          <button
            type="button"
            onClick={handleWebSearch}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Globe size={14} />
            <span>Search the web</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm text-gray-400">
      <Info size={14} className="mt-0.5 shrink-0 text-gray-500" />
      <p>{children}</p>
    </div>
  );
}
