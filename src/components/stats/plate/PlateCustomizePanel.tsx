import { RotateCcw, X } from "lucide-react";
import { cn } from "../../../lib/utils_ui";
import {
  PLATE_FIGURE_DEFINITIONS,
  PLATE_FIGURE_IDS,
  PLATE_PANEL_DEFINITIONS,
  PLATE_PANEL_IDS,
  TIMELINE_LAYER_DEFINITIONS,
  TIMELINE_LAYER_IDS,
  type PlateFigureId,
  type PlatePanelId,
  type PlatePreferences,
  type TimelineLayerId,
} from "./plate-config";

interface PlateCustomizePanelProps {
  preferences: PlatePreferences;
  onSlotChange: (slotIndex: number, panelId: PlatePanelId) => void;
  onToggleFigure: (figureId: PlateFigureId) => void;
  onToggleLayer: (layerId: TimelineLayerId) => void;
  onReset: () => void;
  onClose: () => void;
}

function SectionHeading({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white">{children}</h3>
      {hint ? <p className="text-[11px] leading-snug text-gray-500">{hint}</p> : null}
    </div>
  );
}

export function PlateCustomizePanel({
  preferences,
  onSlotChange,
  onToggleFigure,
  onToggleLayer,
  onReset,
  onClose,
}: PlateCustomizePanelProps) {
  const usedPanels = new Set(preferences.slots);

  return (
    <aside className="glass-surface absolute inset-y-0 right-0 z-30 flex w-[320px] flex-col overflow-hidden rounded-2xl border border-white/10 animate-in slide-in-from-right-4 fade-in duration-200">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-white">Customise</h2>
          <p className="text-[11px] text-gray-500">Changes apply immediately</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close customise"
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
        <section className="flex flex-col gap-2.5">
          <SectionHeading hint="Each of the four panels holds one stat. A stat can only sit in one slot.">
            Panels
          </SectionHeading>

          {preferences.slots.map((panelId, slotIndex) => (
            <label key={slotIndex} className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-500">
                Slot {slotIndex + 1}
              </span>
              <select
                value={panelId}
                onChange={(event) => onSlotChange(slotIndex, event.target.value as PlatePanelId)}
                className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-[12px] text-white outline-none transition-colors hover:border-white/20 focus:border-primary/50"
              >
                {PLATE_PANEL_IDS.map((candidate) => (
                  <option
                    key={candidate}
                    value={candidate}
                    disabled={candidate !== panelId && usedPanels.has(candidate)}
                    className="bg-surface text-white"
                  >
                    {PLATE_PANEL_DEFINITIONS[candidate].label}
                  </option>
                ))}
              </select>
              <span className="text-[10px] leading-snug text-gray-600">
                {PLATE_PANEL_DEFINITIONS[panelId].description}
              </span>
            </label>
          ))}
        </section>

        <section className="flex flex-col gap-2.5 border-t border-white/10 pt-4">
          <SectionHeading hint="The single row of numbers above the timeline.">Figures</SectionHeading>
          <div className="flex flex-wrap gap-1.5">
            {PLATE_FIGURE_IDS.map((figureId) => {
              const isOn = preferences.figures.includes(figureId);

              return (
                <button
                  key={figureId}
                  type="button"
                  onClick={() => onToggleFigure(figureId)}
                  className={cn(
                    "rounded-lg border px-2 py-1 text-[11px] transition-colors",
                    isOn
                      ? "border-primary/50 bg-primary/15 font-medium text-white"
                      : "border-white/10 bg-white/[0.03] text-gray-500 hover:text-gray-300"
                  )}
                >
                  {PLATE_FIGURE_DEFINITIONS[figureId].label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2.5 border-t border-white/10 pt-4">
          <SectionHeading hint="Which series the timeline draws by default.">Timeline layers</SectionHeading>
          <div className="flex flex-wrap gap-1.5">
            {TIMELINE_LAYER_IDS.map((layerId) => {
              const isOn = preferences.layers.includes(layerId);
              const definition = TIMELINE_LAYER_DEFINITIONS[layerId];

              return (
                <button
                  key={layerId}
                  type="button"
                  onClick={() => onToggleLayer(layerId)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-colors",
                    isOn
                      ? "border-white/25 bg-white/10 font-medium text-white"
                      : "border-white/10 bg-white/[0.03] text-gray-500 hover:text-gray-300"
                  )}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: isOn ? definition.color : "currentColor" }}
                  />
                  {definition.label}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <footer className="shrink-0 border-t border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-gray-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
        >
          <RotateCcw size={13} />
          Reset to defaults
        </button>
      </footer>
    </aside>
  );
}
