import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { MediaFilterPreset } from "../../../lib/media-config";
import {
  PLATE_PANEL_DEFINITIONS,
  type PlateFigureId,
  type PlatePanelId,
  type PlatePreferences,
  type TimelineLayerId,
} from "./plate-config";
import type { PlateComparison, PlateData, StatsRange } from "./plate-data";
import { FigureStrip } from "./FigureStrip";
import { PlateToolbar } from "./PlateToolbar";
import { PlateCustomizePanel } from "./PlateCustomizePanel";
import { PanelExpandOverlay } from "./PanelExpandOverlay";
import { TimelineHero } from "./TimelineHero";
import { DayHeatmap } from "./DayHeatmap";
import { renderPlatePanel, type PlatePanelContext } from "./PlatePanels";

type ExpandedTarget = PlatePanelId | "timeline" | null;

interface StatsPlateProps {
  activeYear: string;
  yearOptions: string[];
  onActiveYearChange: (year: string) => void;
  entryTypes: string[];
  typeCounts: Map<string, number>;
  selectedTypes: string[];
  onSelectedTypesChange: (types: string[]) => void;
  presets: MediaFilterPreset[];
  activePreset: string | null;
  onPresetClick: (presetKey: string) => void;

  preferences: PlatePreferences;
  onSlotChange: (slotIndex: number, panelId: PlatePanelId) => void;
  onToggleFigure: (figureId: PlateFigureId) => void;
  onToggleLayer: (layerId: TimelineLayerId) => void;
  onResetPreferences: () => void;
  onToggleCompare: () => void;
  onCompareYearChange: (year: string) => void;
  comparisonYearOptions: string[];
  isCustomizing: boolean;
  onToggleCustomize: () => void;

  plate: PlateData;
  comparison: PlateComparison | null;
  range: StatsRange | null;
  onRangeChange: (range: StatsRange | null) => void;

  onGenreClick: (genre: string) => void;
  onPerfectClick: () => void;
  onThisMonthClick: () => void;
  onDateClick: (date: string) => void;
}

export function StatsPlate({
  activeYear,
  yearOptions,
  onActiveYearChange,
  entryTypes,
  typeCounts,
  selectedTypes,
  onSelectedTypesChange,
  presets,
  activePreset,
  onPresetClick,
  preferences,
  onSlotChange,
  onToggleFigure,
  onToggleLayer,
  onResetPreferences,
  onToggleCompare,
  onCompareYearChange,
  comparisonYearOptions,
  isCustomizing,
  onToggleCustomize,
  plate,
  comparison,
  range,
  onRangeChange,
  onGenreClick,
  onPerfectClick,
  onThisMonthClick,
  onDateClick,
}: StatsPlateProps) {
  const [expanded, setExpanded] = useState<ExpandedTarget>(null);
  const prefersReducedMotion = useReducedMotion();

  // Mount-only reveal. StatsPlate mounts once the first row set has loaded, so
  // this fires on page entry — deliberately not keyed to the range, or the whole
  // plate would re-animate on every frame of a brush drag.
  const reveal = (order: number) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.3, delay: order * 0.05, ease: "easeOut" as const },
        };

  const panelContext: PlatePanelContext = {
    stats: plate.stats,
    comparisonStats: comparison?.stats ?? null,
    genreCount: plate.genreCount,
    rangedEntries: plate.rangedEntries,
    onGenreClick,
    onPerfectClick,
    onDateClick,
  };

  const expandedPanelId = expanded && expanded !== "timeline" ? expanded : null;

  return (
    <div className="relative flex h-full min-h-[860px] flex-col gap-3 xl:min-h-[620px]">
      <motion.div className="shrink-0" {...reveal(0)}>
        <PlateToolbar
          activeYear={activeYear}
        yearOptions={yearOptions}
        onActiveYearChange={onActiveYearChange}
        entryTypes={entryTypes}
        typeCounts={typeCounts}
        selectedTypes={selectedTypes}
        onSelectedTypesChange={onSelectedTypesChange}
        presets={presets}
        activePreset={activePreset}
        onPresetClick={onPresetClick}
        compareEnabled={preferences.compareEnabled}
        compareYear={preferences.compareYear}
        comparisonYearOptions={comparisonYearOptions}
        onToggleCompare={onToggleCompare}
        onCompareYearChange={onCompareYearChange}
          isCustomizing={isCustomizing}
          onToggleCustomize={onToggleCustomize}
        />
      </motion.div>

      <motion.div className="shrink-0" {...reveal(1)}>
        <FigureStrip
          stats={plate.stats}
          comparisonStats={comparison?.stats ?? null}
          genreCount={plate.genreCount}
          comparisonGenreCount={comparison?.genreCount ?? null}
          figures={preferences.figures}
          range={range}
          onPerfectClick={onPerfectClick}
          onThisMonthClick={onThisMonthClick}
        />
      </motion.div>

      <motion.div className="flex min-h-0 flex-1 flex-col" {...reveal(2)}>
        <TimelineHero
          timeline={plate.timeline}
          comparisonTimeline={comparison?.timeline ?? null}
          comparisonYear={comparison?.year ?? null}
          layers={preferences.layers}
          onToggleLayer={onToggleLayer}
          brushCells={plate.brushCells}
          range={range}
          onRangeChange={onRangeChange}
          activeYear={activeYear}
          rangedTotal={plate.stats.total}
          onExpand={() => setExpanded("timeline")}
        />
      </motion.div>

      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3 xl:grid-cols-4 xl:grid-rows-1">
        {preferences.slots.map((panelId, slotIndex) => (
          <motion.div
            key={`${panelId}-${slotIndex}`}
            className="flex min-h-0 min-w-0 flex-col"
            {...reveal(3 + slotIndex)}
          >
            {renderPlatePanel(panelId, panelContext, "compact", () => setExpanded(panelId))}
          </motion.div>
        ))}
      </div>

      {isCustomizing ? (
        <PlateCustomizePanel
          preferences={preferences}
          onSlotChange={onSlotChange}
          onToggleFigure={onToggleFigure}
          onToggleLayer={onToggleLayer}
          onReset={onResetPreferences}
          onClose={onToggleCustomize}
        />
      ) : null}

      <PanelExpandOverlay
        isOpen={expanded === "timeline"}
        title="Timeline"
        subtitle={range ? `${range.from} — ${range.to}` : `${activeYear} · full range`}
        onClose={() => setExpanded(null)}
      >
        <div className="flex flex-col gap-6">
          <TimelineHero
            timeline={plate.timeline}
            comparisonTimeline={comparison?.timeline ?? null}
            comparisonYear={comparison?.year ?? null}
            layers={preferences.layers}
            onToggleLayer={onToggleLayer}
            brushCells={plate.brushCells}
            range={range}
            onRangeChange={onRangeChange}
            activeYear={activeYear}
            rangedTotal={plate.stats.total}
            chartClassName="h-[340px]"
          />

          <section className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <div>
              <h3 className="text-sm font-bold text-white">Completion heatmap</h3>
              <p className="text-[12px] text-gray-500">
                Every logged day at full resolution. Click a day to open its entries.
              </p>
            </div>
            <DayHeatmap
              dailyCompletions={plate.stats.dailyCompletions}
              activeYear={activeYear}
              onDateClick={(date) => {
                setExpanded(null);
                onDateClick(date);
              }}
            />
          </section>
        </div>
      </PanelExpandOverlay>

      <PanelExpandOverlay
        isOpen={expandedPanelId !== null}
        title={expandedPanelId ? PLATE_PANEL_DEFINITIONS[expandedPanelId].label : ""}
        subtitle={range ? `${range.from} — ${range.to}` : `${activeYear} · full range`}
        onClose={() => setExpanded(null)}
      >
        {expandedPanelId ? (
          <div className="flex h-full min-h-[60vh] flex-col">
            {renderPlatePanel(expandedPanelId, panelContext, "expanded")}
          </div>
        ) : null}
      </PanelExpandOverlay>
    </div>
  );
}
