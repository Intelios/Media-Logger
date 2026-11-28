import { useId, type HTMLAttributes, type MouseEventHandler, type ReactNode, type Ref } from "react";
import { X } from "lucide-react";
import { cn } from "../lib/utils_ui";

/**
 * The shared modal chrome: the modal's purpose sits on a folder-style tab
 * notched into the panel's top-left edge, and the subject leads the panel as
 * its title. Presentational only: each modal keeps its own overlay, backdrop,
 * z-index, click-outside rules, Escape handling and entrance animation.
 * Styles live in index.css (`.index-tab`, `.index-panel`).
 */

export type IndexTabTone = "primary" | "purple" | "amber" | "red" | "sky" | "yellow" | "emerald";

const TONE_DOT: Record<IndexTabTone, string> = {
  primary: "bg-primary",
  purple: "bg-purple-400",
  amber: "bg-amber-400",
  red: "bg-red-400",
  sky: "bg-sky-400",
  yellow: "bg-yellow-400",
  emerald: "bg-emerald-400",
};

type IndexTabSize = "compact" | "sheet";

interface IndexTabPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** The modal's purpose, shown on the tab ("Details", "Delete Entry"). */
  tab: ReactNode;
  tone?: IndexTabTone;
  /** The subject, shown as the panel's title. Truncates to one line. */
  title?: ReactNode;
  /** A muted line under the title. */
  meta?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  closeDisabled?: boolean;
  /** `sheet` is for the full-screen sheets: a larger title, and the panel fills the wrapper's height. */
  size?: IndexTabSize;
  panelClassName?: string;
  ref?: Ref<HTMLDivElement>;
  children?: ReactNode;
}

export function IndexTabPanel({
  tab,
  tone = "primary",
  title,
  meta,
  onClose,
  closeLabel = "Close",
  closeDisabled = false,
  size = "compact",
  className,
  panelClassName,
  ref,
  children,
  ...rest
}: IndexTabPanelProps) {
  const id = useId();
  const tabId = `${id}-tab`;
  const titleId = `${id}-title`;
  const sheet = size === "sheet";
  const hasHeader = Boolean(title || meta || onClose);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? `${tabId} ${titleId}` : tabId}
      {...rest}
      // The strip beside the tab is part of this box but reads as backdrop,
      // so clicks there fall through to the overlay (which closes the modal).
      className={cn("pointer-events-none flex flex-col", className)}
    >
      <div className={cn("index-tab pointer-events-auto", sheet && "index-tab-sheet", tone === "red" && "text-red-300")}>
        <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[tone])} />
        <span id={tabId} className="truncate">{tab}</span>
      </div>

      <div className={cn("index-panel pointer-events-auto", sheet && "index-panel-sheet flex min-h-0 flex-1 flex-col", panelClassName)}>
        {hasHeader && (
          <header className={cn("flex shrink-0 items-start gap-4", sheet ? "px-6 pt-5" : "px-5 pt-4")}>
            <div className="min-w-0 flex-1">
              {title && (
                <h2
                  id={titleId}
                  className={cn(
                    "truncate font-semibold tracking-tight text-white",
                    sheet ? "text-2xl leading-8" : "text-xl leading-7"
                  )}
                >
                  {title}
                </h2>
              )}
              {meta && (
                <p className={cn("mt-0.5 truncate text-white/45", sheet ? "text-sm" : "text-[13px]")}>{meta}</p>
              )}
            </div>
            {onClose && (
              <IndexTabCloseButton
                onClick={onClose}
                label={closeLabel}
                disabled={closeDisabled}
                size={size}
              />
            )}
          </header>
        )}
        {children}
      </div>
    </div>
  );
}

interface IndexTabCloseButtonProps {
  onClick: MouseEventHandler<HTMLButtonElement> | (() => void);
  label?: string;
  disabled?: boolean;
  size?: IndexTabSize;
  className?: string;
}

/** The round ghost close button, for panels that lay out their own first row. */
export function IndexTabCloseButton({
  onClick,
  label = "Close",
  disabled = false,
  size = "compact",
  className,
}: IndexTabCloseButtonProps) {
  const sheet = size === "sheet";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "-mr-1 flex shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/55 transition-colors",
        "hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
        "disabled:cursor-not-allowed disabled:opacity-40",
        sheet ? "h-8 w-8" : "h-7 w-7",
        className
      )}
    >
      <X size={sheet ? 17 : 15} />
    </button>
  );
}
