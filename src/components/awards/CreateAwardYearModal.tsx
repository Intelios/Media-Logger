import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { AwardYearSummary } from "../../lib/awards-logic";
import { useEscapeToClose } from "../../lib/useEscapeToClose";
import { useFocusTrap } from "../../lib/useFocusTrap";

interface CreateAwardYearModalProps {
  isOpen: boolean;
  years: AwardYearSummary[];
  onClose: () => void;
  onSubmit: (year: number, copyFromYear: number | null) => Promise<void>;
}

export function CreateAwardYearModal({ isOpen, years, onClose, onSubmit }: CreateAwardYearModalProps) {
  const [value, setValue] = useState("");
  const [copyFromYear, setCopyFromYear] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const close = () => {
    if (!submittingRef.current) onClose();
  };

  useEscapeToClose(isOpen, close);
  useFocusTrap(isOpen, modalRef);

  useEffect(() => {
    if (!isOpen) return;
    setValue(new Date().getFullYear().toString());
    setCopyFromYear(null);
    setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const sourceYears = years.filter(year => year.categories > 0);
  const source = sourceYears.find(year => year.year === copyFromYear);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const trimmed = value.trim();
    const year = Number(trimmed);
    if (!/^\d{4}$/.test(trimmed) || year < 1900 || year > 9999) {
      setError("Enter a 4-digit year between 1900 and 9999.");
      return;
    }
    if (years.some(existing => existing.year === year)) {
      setError(`${year} already has an award year.`);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(year, copyFromYear);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-award-year-title"
        aria-busy={submitting}
        className="bg-[#1a1a1a] border border-white/10 w-full max-w-md rounded-2xl shadow-2xl p-6"
      >
        <div className="flex justify-between items-center mb-5">
          <h3 id="create-award-year-title" className="text-xl font-bold">Create New Award Year</h3>
          <button onClick={close} disabled={submitting} aria-label="Close" className="p-1 hover:bg-white/10 rounded-full disabled:opacity-50">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="award-year" className="block mb-2 text-sm font-medium text-gray-300">Year</label>
            <input
              id="award-year"
              autoFocus
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="e.g. 2026"
              value={value}
              disabled={submitting}
              aria-invalid={!!error}
              aria-describedby={error ? "award-year-error" : undefined}
              onChange={event => { setValue(event.target.value); setError(null); }}
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-primary outline-none disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="award-year-categories" className="block mb-2 text-sm font-medium text-gray-300">Categories</label>
            <select
              id="award-year-categories"
              value={copyFromYear ?? ""}
              disabled={submitting}
              aria-describedby="award-year-copy-detail"
              onChange={event => { setCopyFromYear(event.target.value ? Number(event.target.value) : null); setError(null); }}
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-primary outline-none disabled:opacity-50"
            >
              <option value="" className="bg-[#1a1a1a]">Start with no categories</option>
              {sourceYears.map(year => (
                <option key={year.year} value={year.year} className="bg-[#1a1a1a]">
                  Copy from {year.year} · {year.categories} {year.categories === 1 ? "category" : "categories"}
                </option>
              ))}
            </select>
            <p id="award-year-copy-detail" className="mt-2 text-sm text-gray-400">
              {source
                ? `Reuses all ${source.categories} ${source.categories === 1 ? "category" : "categories"} from ${source.year}, including their order and media types. Winners start blank.`
                : sourceYears.length > 0
                  ? "Start empty, or reuse the categories from an existing year."
                  : "Add categories after creating the year. Once you have a year with categories, you can reuse them here."}
            </p>
          </div>

          {error && <p id="award-year-error" role="alert" className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={close} disabled={submitting} className="px-4 py-2 rounded-lg font-medium hover:bg-white/5 text-gray-300 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={!value.trim() || submitting} className="px-4 py-2 rounded-lg font-bold bg-primary hover:bg-primary/90 text-white disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? "Creating…" : "Create Year"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
