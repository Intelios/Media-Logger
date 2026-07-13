import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";

interface InputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  /** Optional submit-time validator. Return an error string to block submit and show it inline. */
  validate?: (value: string) => string | null;
}

export function InputModal({ isOpen, onClose, onSubmit, title, placeholder, defaultValue, validate }: InputModalProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEscapeToClose(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue || "");
      setError(null);
    }
  }, [isOpen, defaultValue]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    if (validate) {
      const vErr = validate(trimmed);
      if (vErr) {
        setError(vErr);
        return;
      }
    }
    setError(null);
    onSubmit(trimmed);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div ref={modalRef} className="bg-[#1a1a1a] border border-white/10 w-full max-w-md rounded-2xl shadow-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            autoFocus
            type="text"
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-primary outline-none mb-2"
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
          />
          {error && (
            <div style={{ color: '#EF4444', fontSize: 12, marginBottom: 16 }}>{error}</div>
          )}

          <div className="flex justify-end gap-3" style={{ marginTop: error ? 0 : 16 }}>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg font-medium hover:bg-white/5 text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!value.trim()}
              className="px-4 py-2 rounded-lg font-bold bg-primary hover:bg-primary/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}