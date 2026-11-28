import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  Captions,
  Check,
  Copy,
  FileText,
  RotateCcw,
  StickyNote,
  Trophy,
  X,
} from "lucide-react";
import { dbService, type MediaEntry } from "../lib/db";
import { formatDate } from "../lib/dates";
import { formatCardRating, getReplayTerm } from "../lib/media-config";
import { cn } from "../lib/utils_ui";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";
import { useHoverTooltip } from "./HoverTooltip";
import { CoverImage } from "./CoverImage";
import { IndexTabPanel } from "./IndexTabPanel";
import { CoverFramingDialog } from "./CoverFramingDialog";
import { parseCoverFraming, serializeCoverFraming } from "../lib/cover-framing";
import { reportMutationError } from "./MutationErrorToast";

export type MediaCardDialogKind = "details" | "image" | "cover" | "delete" | "duplicates";

interface MediaCardDialogsProps {
  dialog: MediaCardDialogKind;
  entry: MediaEntry;
  onClose: () => void;
  onConfirmDelete: () => void;
}

export default function MediaCardDialogs({
  dialog,
  entry,
  onClose,
  onConfirmDelete,
}: MediaCardDialogsProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [duplicateEntries, setDuplicateEntries] = useState<MediaEntry[]>([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(dialog === "duplicates");
  const { bindTooltip } = useHoverTooltip();
  useEscapeToClose(true, onClose);
  useFocusTrap(true, modalRef);

  useEffect(() => {
    if (dialog !== "duplicates") return;

    let cancelled = false;
    setDuplicatesLoading(true);
    setDuplicateEntries([]);

    void dbService.getEntriesByName(entry.name)
      .then((entries) => {
        if (!cancelled) setDuplicateEntries(entries);
      })
      .catch((error) => {
        console.error("Error finding duplicates:", error);
        if (!cancelled) setDuplicateEntries([]);
      })
      .finally(() => {
        if (!cancelled) setDuplicatesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dialog, entry.name]);

  const entryMeta = [
    entry.entry_type,
    entry.completion_date ? formatDate(entry.completion_date) : null,
  ].filter(Boolean).join(" · ");
  const duplicateCount = duplicatesLoading ? 0 : duplicateEntries.length;
  const duplicatesMeta = [
    entry.entry_type,
    duplicateCount > 1 ? `${duplicateCount} entries with this name` : null,
  ].filter(Boolean).join(" · ") || undefined;

  if (dialog === "details") {
    return createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <IndexTabPanel
          ref={modalRef}
          tab="Details"
          tone="purple"
          title={entry.name}
          meta={entryMeta || undefined}
          onClose={onClose}
          closeLabel="Close details"
          className="w-full max-w-lg animate-in fade-in zoom-in-95 duration-200"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="p-5 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-4">
            {!entry.description && !entry.notes ? (
              <div className="text-center py-8">
                <FileText size={40} className="mx-auto text-gray-600 mb-3" />
                <p className="text-gray-500 text-sm">No details available</p>
                <p className="text-gray-600 text-xs mt-1">Edit the entry to add a description or notes</p>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-white/5 overflow-hidden">
                  <div className="flex items-center gap-2 px-3.5 py-2.5 bg-purple-500/10 border-b border-white/5">
                    <FileText size={14} className="text-purple-400" />
                    <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider">Description</span>
                  </div>
                  <div className="px-3.5 py-3">
                    {entry.description ? (
                      <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                        {entry.description}
                      </p>
                    ) : (
                      <p className="text-gray-600 text-xs italic">No description</p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-white/5 overflow-hidden">
                  <div className="flex items-center gap-2 px-3.5 py-2.5 bg-amber-500/10 border-b border-white/5">
                    <StickyNote size={14} className="text-amber-400" />
                    <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Notes</span>
                  </div>
                  <div className="px-3.5 py-3">
                    {entry.notes ? (
                      <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                        {entry.notes}
                      </p>
                    ) : (
                      <p className="text-gray-600 text-xs italic">No notes</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </IndexTabPanel>
      </div>,
      document.body
    );
  }

  if (dialog === "cover") {
    return (
      <CoverFramingDialog
        name={entry.name}
        path={entry.image_url}
        initial={parseCoverFraming(entry.cover_framing)}
        onCancel={onClose}
        onSave={async (framing) => {
          try {
            await dbService.setEntryCoverFraming(entry.id, serializeCoverFraming(framing));
            onClose();
          } catch (error) {
            reportMutationError("Could not save the cover framing.", error);
          }
        }}
      />
    );
  }

  if (dialog === "image") {
    return createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/95 backdrop-blur-md"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <button
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-gray-300 hover:text-white z-10"
          aria-label="Close image"
        >
          <X size={24} />
        </button>

        <div
          ref={modalRef}
          className="relative flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-200"
          onClick={(event) => event.stopPropagation()}
        >
          <CoverImage
            path={entry.image_url}
            alt={entry.name}
            variant="original"
            priority="high"
            sizes="90vw"
            containerClassName="flex max-h-[80vh] max-w-[90vw] items-center justify-center"
            imageClassName="max-h-[80vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
          />

          <div className="mt-4 text-center">
            <h3 className="text-xl font-bold text-white">{entry.name}</h3>
            <p className="text-sm text-gray-400 mt-1">{entry.entry_type}</p>
            {entry.image_url && (
              <p className="text-xs text-gray-500 mt-2 font-mono px-4 break-all max-w-[80vw]">
                {entry.image_url}
              </p>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  if (dialog === "delete") {
    return createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <IndexTabPanel
          ref={modalRef}
          tab="Delete Entry"
          tone="red"
          title={entry.name}
          meta="This action cannot be undone"
          onClose={onClose}
          closeLabel="Cancel delete"
          className="w-full max-w-md animate-in fade-in zoom-in-95 duration-200"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="p-5">
            <p className="text-gray-300 text-sm leading-relaxed">
              This will permanently remove the entry from your library.
            </p>
          </div>

          <div className="flex gap-3 p-5 pt-0">
            <button
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onClose();
                onConfirmDelete();
              }}
              className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl font-semibold text-white transition-colors shadow-lg shadow-red-500/25"
            >
              Delete
            </button>
          </div>
        </IndexTabPanel>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <IndexTabPanel
        ref={modalRef}
        tab="Duplicates & Replays"
        tone="amber"
        title={entry.name}
        meta={duplicatesMeta}
        onClose={onClose}
        closeLabel="Close duplicates"
        className="w-full max-w-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {duplicatesLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" />
            </div>
          ) : duplicateEntries.length > 1 ? (
            <div className="space-y-3">
              {duplicateEntries.map((duplicate) => (
                <div
                  key={duplicate.id}
                  className={cn(
                    "flex items-center gap-4 p-3 rounded-xl border transition-colors",
                    duplicate.id === entry.id
                      ? "bg-amber-500/10 border-amber-500/30"
                      : "bg-white/5 border-white/10 hover:bg-white/10"
                  )}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shrink-0",
                    duplicate.review_score !== null
                      ? duplicate.review_score >= 9
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : duplicate.review_score >= 7
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                          : duplicate.review_score >= 5
                            ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                            : "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "bg-gray-500/20 text-gray-400 border border-gray-500/30"
                  )}>
                    {duplicate.review_score !== null ? formatCardRating(duplicate.review_score) : "—"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-gray-200 font-medium truncate">{duplicate.name}</span>
                      {duplicate.id === entry.id && (
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-semibold rounded-full">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {duplicate.completion_date && (
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          {formatDate(duplicate.completion_date)}
                        </span>
                      )}
                      {duplicate.entry_type && (
                        <span className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">
                          {duplicate.entry_type}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {duplicate.entry_type?.toLowerCase().includes("game") && duplicate.is_platinum === 1 && (
                      <div
                        {...bindTooltip(
                          <span className="text-xs font-medium text-cyan-200">Platinum / 100%</span>,
                          { width: "content", className: "rounded-lg px-3 py-1.5 whitespace-nowrap" }
                        )}
                        className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400/30 to-cyan-400/30 border border-cyan-300 flex items-center justify-center"
                      >
                        <Trophy size={12} className="text-cyan-100" />
                      </div>
                    )}
                    {duplicate.is_rewatch === 1 && (
                      <div
                        {...bindTooltip(
                          <span className="text-xs font-medium text-amber-400">{getReplayTerm(duplicate.entry_type).label}</span>,
                          { width: "content", className: "rounded-lg px-3 py-1.5 whitespace-nowrap" }
                        )}
                        className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center"
                      >
                        <RotateCcw size={12} className="text-amber-500" />
                      </div>
                    )}
                    {duplicate.own_local_copy === 1 && (
                      <div
                        {...bindTooltip(
                          <span className="text-xs font-medium text-emerald-400">Local Copy</span>,
                          { width: "content", className: "rounded-lg px-3 py-1.5 whitespace-nowrap" }
                        )}
                        className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center"
                      >
                        <Check size={12} className="text-emerald-500" />
                      </div>
                    )}
                    {duplicate.has_subtitles === 1 && (
                      <div
                        {...bindTooltip(
                          <span className="text-xs font-medium text-orange-400">Subtitles</span>,
                          { width: "content", className: "rounded-lg px-3 py-1.5 whitespace-nowrap" }
                        )}
                        className="w-7 h-7 rounded-full bg-orange-500/20 border border-orange-500 flex items-center justify-center"
                      >
                        <Captions size={12} className="text-orange-400" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Copy size={40} className="mx-auto text-gray-600 mb-3" />
              <p className="text-gray-500 text-sm">No duplicate entries found</p>
              <p className="text-gray-600 text-xs mt-1">This is the only entry with this name</p>
            </div>
          )}
        </div>
      </IndexTabPanel>
    </div>,
    document.body
  );
}
