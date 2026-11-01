import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, ChevronDown, Layers, Minus, Plus, Trophy, X } from "lucide-react";
import type { AwardYearSummary } from "../../lib/awards-logic";
import { useEscapeToClose } from "../../lib/useEscapeToClose";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { cn } from "../../lib/utils_ui";

interface CreateAwardYearModalProps {
  isOpen: boolean;
  years: AwardYearSummary[];
  onClose: () => void;
  onSubmit: (year: number, copyFromYear: number | null) => Promise<void>;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d6ab5c]/60";

const STEP_BUTTON =
  `flex h-14 w-11 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04] text-white/55 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`;

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Create a year shell, optionally reusing another year's category list. The
 * dropdown is an in-house listbox (anchored panel, outside-click close) rather
 * than a native <select>, which can't carry the rest of the app's chrome.
 */
export function CreateAwardYearModal({ isOpen, years, onClose, onSubmit }: CreateAwardYearModalProps) {
  const [value, setValue] = useState("");
  const [copyFromYear, setCopyFromYear] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => {
    if (!submittingRef.current) onClose();
  };

  useEscapeToClose(isOpen, () => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    close();
  });
  useFocusTrap(isOpen, modalRef);

  // Open on the first year that is actually free — pre-filling a year the
  // archive already has just moves the error to submit time.
  useEffect(() => {
    if (!isOpen) return;
    const current = new Date().getFullYear();
    const highest = years.reduce((max, year) => Math.max(max, year.year), current);
    const taken = new Set(years.map((year) => year.year));
    let suggestion = current;
    while (taken.has(suggestion) && suggestion < 9999) suggestion += 1;
    setValue(String(taken.has(current) ? highest + 1 : suggestion));
    setCopyFromYear(null);
    setMenuOpen(false);
    setError(null);
  }, [isOpen, years]);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  const sourceYears = useMemo(() => years.filter((year) => year.categories > 0), [years]);
  const source = sourceYears.find((year) => year.year === copyFromYear) ?? null;

  const trimmed = value.trim();
  const parsed = Number(trimmed);
  const formatValid = /^\d{4}$/.test(trimmed) && parsed >= 1900 && parsed <= 9999;
  const alreadyExists = formatValid && years.some((year) => year.year === parsed);
  const yearHint = alreadyExists
    ? `${parsed} already has an award year.`
    : trimmed.length === 4 && !formatValid
      ? "Years run from 1900 to 9999."
      : null;
  const canSubmit = formatValid && !alreadyExists && !submitting;

  const stepYear = (delta: number) => {
    const base = /^\d{4}$/.test(trimmed) ? parsed : new Date().getFullYear();
    const next = Math.min(9999, Math.max(1900, base + delta));
    setValue(String(next));
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;
    if (!formatValid) {
      setError("Enter a 4-digit year between 1900 and 9999.");
      return;
    }
    if (alreadyExists) {
      setError(`${parsed} already has an award year.`);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    setMenuOpen(false);
    try {
      await onSubmit(parsed, copyFromYear);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const copyHint = source
    ? `Reuses all ${countLabel(source.categories, "category", "categories")} from ${source.year}, in their stored order and with their media types. Winners start blank.`
    : sourceYears.length > 0
      ? "Start empty and add categories later, or copy an existing year's list."
      : "Start empty and add categories after the year exists.";

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      onClick={close}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-award-year-title"
        aria-busy={submitting}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[440px] rounded-[20px] border border-white/10 bg-gradient-to-b from-[#1c1916] to-[#131110] shadow-2xl shadow-black/60"
      >
        <div className="flex items-start gap-3 rounded-t-[20px] border-b border-white/5 bg-gradient-to-r from-[#d6ab5c]/[0.10] via-transparent to-transparent px-5 py-4">
          <div className="rounded-[12px] bg-[#d6ab5c]/15 p-2.5 text-[#f0d391]">
            <Trophy size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="create-award-year-title"
              className="text-[17px] font-semibold leading-tight text-white"
            >
              New award year
            </h2>
            <p className="mt-0.5 text-[12.5px] text-white/45">Add a year to the awards archive.</p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            aria-label="Close"
            className={cn(
              "rounded-lg p-1.5 text-white/45 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40",
              FOCUS_RING
            )}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-5 px-5 py-5">
            <div>
              <label
                htmlFor="award-year"
                className="mb-2 block text-[12.5px] font-medium text-white/50"
              >
                Year
              </label>
              <div className="flex items-stretch gap-2">
                <input
                  id="award-year"
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={value}
                  disabled={submitting}
                  aria-invalid={Boolean(yearHint)}
                  aria-describedby={yearHint ? "award-year-hint" : undefined}
                  onChange={(event) => {
                    setValue(event.target.value.replace(/\D/gu, ""));
                    setError(null);
                  }}
                  className={cn(
                    "h-14 min-w-0 flex-1 rounded-[12px] border bg-white/[0.04] px-4 text-[24px] font-semibold tabular-nums tracking-tight text-white outline-none transition-colors focus:bg-white/[0.06] disabled:opacity-50",
                    yearHint
                      ? "border-amber-400/40 focus:border-amber-400/60"
                      : "border-white/10 focus:border-[#d6ab5c]/50"
                  )}
                />
                <button
                  type="button"
                  onClick={() => stepYear(-1)}
                  disabled={submitting}
                  aria-label="Previous year"
                  className={STEP_BUTTON}
                >
                  <Minus size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => stepYear(1)}
                  disabled={submitting}
                  aria-label="Next year"
                  className={STEP_BUTTON}
                >
                  <Plus size={16} />
                </button>
              </div>
              {yearHint && (
                <p
                  id="award-year-hint"
                  className="mt-2 flex items-center gap-1.5 text-[12px] text-amber-300/90"
                >
                  <AlertCircle size={12} className="shrink-0" />
                  {yearHint}
                </p>
              )}
            </div>

            <div ref={menuRef} className="relative">
              <span id="award-copy-label" className="mb-2 block text-[12.5px] font-medium text-white/50">
                Start from
              </span>
              {/* The menu is anchored to the control itself; the hint below it
                  must not push it down. */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  disabled={submitting}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-labelledby="award-copy-label award-copy-value"
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[12px] border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    menuOpen
                      ? "border-[#d6ab5c]/50 bg-white/[0.06]"
                      : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.06]",
                    FOCUS_RING
                  )}
                >
                  <Layers size={15} className="shrink-0 text-white/45" />
                  <span
                    id="award-copy-value"
                    className="min-w-0 flex-1 truncate text-[14px] font-medium text-white"
                  >
                    {source ? `Copy ${source.year}` : "Start empty"}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-white/35">
                    {source ? countLabel(source.categories, "category", "categories") : "No categories"}
                  </span>
                  <ChevronDown
                    size={14}
                    className={cn(
                      "shrink-0 text-white/40 transition-transform",
                      menuOpen && "rotate-180"
                    )}
                  />
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    aria-labelledby="award-copy-label"
                    className="custom-scrollbar absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-64 overflow-y-auto rounded-[12px] border border-white/10 bg-[#211d18] p-1 shadow-2xl shadow-black/60"
                  >
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={copyFromYear === null}
                      onClick={() => {
                        setCopyFromYear(null);
                        setMenuOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors",
                        copyFromYear === null ? "bg-[#d6ab5c]/10" : "hover:bg-white/5",
                        FOCUS_RING
                      )}
                    >
                      <span className="flex w-4 shrink-0 justify-center text-[#d6ab5c]">
                        {copyFromYear === null && <Check size={13} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-white">
                        Start empty
                      </span>
                      <span className="shrink-0 text-[11.5px] text-white/35">No categories</span>
                    </button>

                    {sourceYears.map((year) => {
                      const selected = copyFromYear === year.year;
                      return (
                        <button
                          key={year.year}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selected}
                          onClick={() => {
                            setCopyFromYear(year.year);
                            setMenuOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors",
                            selected ? "bg-[#d6ab5c]/10" : "hover:bg-white/5",
                            FOCUS_RING
                          )}
                        >
                          <span className="flex w-4 shrink-0 justify-center text-[#d6ab5c]">
                            {selected && <Check size={13} />}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13.5px] text-white">
                            Copy {year.year}
                          </span>
                          <span className="shrink-0 text-[11.5px] tabular-nums text-white/35">
                            {countLabel(year.categories, "category", "categories")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <p className="mt-2 text-[12px] leading-relaxed text-white/35">{copyHint}</p>
            </div>

            {error && (
              <p role="alert" className="flex items-start gap-1.5 text-[12.5px] text-red-400">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 rounded-b-[20px] border-t border-white/5 bg-black/20 px-5 py-4">
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              className={cn(
                "h-[38px] rounded-[10px] px-3.5 text-[13px] font-semibold text-white/60 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40",
                FOCUS_RING
              )}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                "h-[38px] rounded-[10px] bg-[#d6ab5c] px-4 text-[13px] font-semibold text-[#1d150a] transition-colors hover:bg-[#e0b76b] disabled:cursor-not-allowed disabled:opacity-40",
                FOCUS_RING
              )}
            >
              {submitting ? "Creating…" : "Create year"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
