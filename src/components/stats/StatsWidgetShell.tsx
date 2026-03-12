import { type ReactNode } from "react";
import { cn } from "../../lib/utils_ui";
import type { StatsWidgetHeightPreset, StatsWidgetId } from "./stats-config";

interface StatsWidgetShellProps {
  widgetId: StatsWidgetId;
  title: string;
  icon: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  isEmpty?: boolean;
  emptyState?: ReactNode;
  headerAsButton?: boolean;
  onHeaderClick?: () => void;
  heightPreset?: StatsWidgetHeightPreset;
  fillBody?: boolean;
}

function DefaultEmptyState({ title }: { title: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 py-10 text-center">
      <p className="text-sm text-gray-400">No data available for {title.toLowerCase()}.</p>
    </div>
  );
}

export function StatsWidgetShell({
  widgetId,
  title,
  icon,
  subtitle,
  badge,
  action,
  children,
  className,
  headerClassName,
  bodyClassName,
  isEmpty = false,
  emptyState,
  headerAsButton = false,
  onHeaderClick,
  heightPreset = "standard",
  fillBody = false,
}: StatsWidgetShellProps) {
  const headerContent = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <div className="rounded-xl bg-white/5 p-2 text-current">{icon}</div>
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-xl font-bold text-white">
            <span className="truncate">{title}</span>
            {badge}
          </h3>
          {subtitle ? <div className="text-sm text-gray-400">{subtitle}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </>
  );

  return (
    <section
      data-stats-widget={widgetId}
      data-stats-height-preset={heightPreset}
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/5",
        className
      )}
    >
      {headerAsButton ? (
        <button
          type="button"
          onClick={onHeaderClick}
          className={cn(
            "group flex w-full shrink-0 items-start justify-between gap-4 px-6 pb-5 pt-6 text-left",
            headerClassName
          )}
        >
          {headerContent}
        </button>
      ) : (
        <div
          className={cn(
            "flex shrink-0 items-start justify-between gap-4 px-6 pb-5 pt-6",
            headerClassName
          )}
        >
          {headerContent}
        </div>
      )}

      <div className={cn("px-6 pb-6", fillBody && "flex min-h-0 flex-1 flex-col", bodyClassName)}>
        {isEmpty ? emptyState ?? <DefaultEmptyState title={title} /> : children}
      </div>
    </section>
  );
}
