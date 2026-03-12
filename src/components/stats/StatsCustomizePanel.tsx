import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { cn } from "../../lib/utils_ui";
import type { StatsDashboardViewDefinition, StatsWidgetZone, StatsWidgetId } from "./stats-config";

interface StatsCustomizePanelWidget {
  id: StatsWidgetId;
  title: string;
  description: string;
  zone: StatsWidgetZone;
}

interface StatsCustomizePanelProps {
  activeView: StatsDashboardViewDefinition;
  visibleWidgets: StatsCustomizePanelWidget[];
  hiddenWidgets: StatsCustomizePanelWidget[];
  unavailableWidgets: StatsCustomizePanelWidget[];
  onHideWidget: (widgetId: StatsWidgetId) => void;
  onShowWidget: (widgetId: StatsWidgetId) => void;
  onResetView: () => void;
}

interface StatsCustomizeSectionProps {
  title: string;
  description: string;
  items: StatsCustomizePanelWidget[];
  emptyMessage: string;
  actionLabel?: string;
  onAction?: (widgetId: StatsWidgetId) => void;
  actionIcon?: "show" | "hide";
}

function ZoneBadge({ zone }: { zone: StatsWidgetZone }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        zone === "summary" ? "bg-blue-500/10 text-blue-300" : "bg-purple-500/10 text-purple-300"
      )}
    >
      {zone}
    </span>
  );
}

function StatsCustomizeSection({
  title,
  description,
  items,
  emptyMessage,
  actionLabel,
  onAction,
  actionIcon,
}: StatsCustomizeSectionProps) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-1 text-xs text-gray-400">{description}</p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-4 text-sm text-gray-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                    <ZoneBadge zone={item.zone} />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-gray-400">{item.description}</p>
                </div>

                {onAction && actionLabel ? (
                  <button
                    type="button"
                    onClick={() => onAction(item.id)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors",
                      actionIcon === "show"
                        ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                        : "border-red-400/20 bg-red-500/10 text-red-200 hover:bg-red-500/15"
                    )}
                  >
                    {actionIcon === "show" ? <Eye size={14} /> : <EyeOff size={14} />}
                    <span>{actionLabel}</span>
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function StatsCustomizePanel({
  activeView,
  visibleWidgets,
  hiddenWidgets,
  unavailableWidgets,
  onHideWidget,
  onShowWidget,
  onResetView,
}: StatsCustomizePanelProps) {
  return (
    <aside className="sticky top-6 w-[340px] shrink-0">
      <div className="rounded-[28px] border border-white/10 bg-[#101014]/95 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Customize</p>
            <h2 className="mt-1 text-lg font-bold text-white">{activeView.label} Layout</h2>
            <p className="mt-2 text-sm text-gray-400">Drag visible widgets on the canvas to reorder them. Use this panel to hide, restore, or reset widgets.</p>
          </div>

          <button
            type="button"
            onClick={onResetView}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RotateCcw size={14} />
            <span>Reset This View</span>
          </button>
        </div>

        <div className="mt-6 space-y-6">
          <StatsCustomizeSection
            title={`Visible Widgets (${visibleWidgets.length})`}
            description="These widgets are currently shown in this view."
            items={visibleWidgets}
            emptyMessage="No widgets are currently visible."
            actionLabel="Hide"
            actionIcon="hide"
            onAction={onHideWidget}
          />

          <StatsCustomizeSection
            title={`Hidden Widgets (${hiddenWidgets.length})`}
            description="Restore hidden widgets without changing their saved order."
            items={hiddenWidgets}
            emptyMessage="There are no hidden widgets for this view."
            actionLabel="Show"
            actionIcon="show"
            onAction={onShowWidget}
          />

          <StatsCustomizeSection
            title={`Unavailable Right Now (${unavailableWidgets.length})`}
            description="These widgets are excluded by the current filters and will return automatically when available."
            items={unavailableWidgets}
            emptyMessage="All registered widgets are currently available."
          />
        </div>
      </div>
    </aside>
  );
}
