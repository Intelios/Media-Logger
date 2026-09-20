import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, Loader2, AlertCircle, ImageOff } from "lucide-react";
import { cn } from "../lib/utils_ui";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";
import { CoverImage } from "./CoverImage";
import type { StagedCoverImport } from "../lib/image-service";
import {
  getCoverSearchAvailability,
  getCoverSearchProviderName,
  searchCoverArt,
  stageCoverFromUrl,
  type CoverCandidate,
} from "../lib/cover-search";

interface CoverSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  entryType: string;
  initialQuery: string;
  onStaged: (staged: StagedCoverImport) => void;
}

type SearchStatus = "idle" | "loading" | "results" | "empty" | "error";

export function CoverSearchModal({
  isOpen,
  onClose,
  entryType,
  initialQuery,
  onStaged,
}: CoverSearchModalProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [results, setResults] = useState<CoverCandidate[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [stagingId, setStagingId] = useState<string | null>(null);
  const searchRequestRef = useRef(0);
  const modalRef = useRef<HTMLDivElement>(null);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  const availability = getCoverSearchAvailability(entryType);
  const provider = getCoverSearchProviderName(entryType);

  const runSearch = async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) return;
    const requestId = ++searchRequestRef.current;
    setStatus("loading");
    setSearchError(null);
    setPickError(null);
    try {
      const found = await searchCoverArt(trimmed, entryType);
      if (searchRequestRef.current !== requestId) return;
      setResults(found);
      setStatus(found.length > 0 ? "results" : "empty");
    } catch (error) {
      if (searchRequestRef.current !== requestId) return;
      setSearchError(error instanceof Error ? error.message : String(error));
      setStatus("error");
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    // Bump the request id so a search from a previous open can't resolve into
    // this one's result grid.
    searchRequestRef.current += 1;
    setQuery(initialQuery);
    setResults([]);
    setStatus("idle");
    setSearchError(null);
    setPickError(null);
    setStagingId(null);
    if (initialQuery.trim() && getCoverSearchAvailability(entryType) === "ready") {
      void runSearch(initialQuery);
    }
  }, [isOpen, initialQuery, entryType]);

  const handlePick = async (candidate: CoverCandidate) => {
    if (stagingId) return;
    setStagingId(candidate.id);
    setPickError(null);
    try {
      const staged = await stageCoverFromUrl(candidate.originalUrl);
      onStaged(staged);
      onClose();
    } catch (error) {
      setPickError(error instanceof Error ? error.message : String(error));
      setStagingId(null);
    }
  };

  if (!isOpen) return null;

  // Portalled to <body> so a parent's `space-y-*` margin can't offset the
  // fixed overlay — see the note in EntryForm.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[85vh] rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background:
                  "linear-gradient(to bottom right, var(--color-primary), var(--color-secondary))",
              }}
            >
              <Search size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white leading-tight">Cover Art Search</h2>
              <p className="text-xs text-gray-500 truncate">
                {provider} · {entryType}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors shrink-0"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* Search row */}
        <div className="p-4 border-b border-white/10">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(query);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${provider || "providers"} for cover art…`}
              className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 bg-black/30 text-white placeholder-gray-500 themed-field focus:outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={!query.trim() || status === "loading" || stagingId !== null}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all",
                query.trim() && status !== "loading" && stagingId === null
                  ? "themed-cta text-white hover:scale-[1.02] active:scale-[0.98]"
                  : "bg-gray-700 text-gray-500 cursor-not-allowed",
              )}
            >
              {status === "loading" ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
              <span>Search</span>
            </button>
          </form>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {availability === "needs-key" ? (
            <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center gap-2 py-12 px-6">
              <AlertCircle size={28} className="text-amber-400" />
              <p className="text-sm font-medium text-white">
                {provider} needs an API key before it can search.
              </p>
              <p className="text-xs text-gray-500 max-w-md">
                Add it in Settings → Cover Art.{" "}
                {provider === "IGDB"
                  ? "IGDB needs a Client ID and Client Secret from a free Twitch developer app."
                  : `${provider} offers a free API key after creating a developer account.`}
              </p>
            </div>
          ) : status === "loading" ? (
            <div className="grid gap-3 items-start grid-cols-3 sm:grid-cols-4 md:grid-cols-6">
              {Array.from({ length: 12 }).map((_, index) => (
                <div
                  key={index}
                  className="h-44 rounded-lg bg-white/5 border border-white/10 animate-pulse"
                />
              ))}
            </div>
          ) : status === "empty" ? (
            <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center gap-2 py-12">
              <ImageOff size={28} className="text-gray-600" />
              <p className="text-sm text-gray-400">No covers found for “{query.trim()}”.</p>
              <p className="text-xs text-gray-600">Try a shorter or more exact title.</p>
            </div>
          ) : status === "error" ? (
            <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center gap-2 py-12 px-6">
              <AlertCircle size={28} className="text-red-400" />
              <p className="text-sm text-gray-300 max-w-md">{searchError}</p>
              <button
                type="button"
                onClick={() => void runSearch(query)}
                className="mt-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                Try again
              </button>
            </div>
          ) : status === "idle" ? (
            <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center gap-2 py-12">
              <Search size={28} className="text-gray-600" />
              <p className="text-sm text-gray-400">Type a title and press Search.</p>
            </div>
          ) : (
            // Candidates render at their natural aspect ratio — posters
            // portrait, RAWG screenshots wide, album art square — because the
            // media cards themselves are wide object-cover blocks and the
            // picker should preview exactly what will be imported.
            <div className="grid gap-3 items-start grid-cols-3 sm:grid-cols-4 md:grid-cols-6">
              {results.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => void handlePick(candidate)}
                  disabled={stagingId !== null}
                  className="group text-left rounded-lg border border-white/10 bg-white/5 overflow-hidden hover:border-primary/60 transition-all disabled:cursor-wait"
                >
                  <div className="relative w-full min-h-[120px] flex items-center justify-center overflow-hidden bg-black/20">
                    <CoverImage
                      path={candidate.thumbnailUrl}
                      alt={candidate.title}
                      variant="original"
                      priority="low"
                      containerClassName="w-full"
                      imageClassName="w-full h-auto"
                    />
                    {stagingId === candidate.id && (
                      <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center">
                        <Loader2 size={20} className="spin text-white" />
                      </div>
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="text-[11px] text-gray-300 truncate">{candidate.title}</p>
                    {candidate.subtitle && (
                      <p className="text-[10px] text-gray-500 truncate">{candidate.subtitle}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {pickError && (
          <div className="px-6 py-2 border-t border-white/10 bg-red-500/10">
            <p className="text-xs text-red-400">{pickError}</p>
          </div>
        )}

        {/* Footer credit */}
        <div className="px-6 py-3 border-t border-white/10">
          <p className="text-[11px] text-gray-600 truncate">
            {provider === "TMDB"
              ? "This product uses the TMDB API but is not endorsed or certified by TMDB."
              : `Cover images provided by ${provider}.`}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
