import { Check, SlidersHorizontal } from "lucide-react";
import { cn } from "../../lib/utils_ui";
import { MultiSelectFilter } from "../MultiSelectFilter";
import type {
  StatsDashboardViewDefinition,
  StatsDashboardViewId,
  StatsFilterPreset,
  StatsPresetKey,
} from "./stats-config";

interface StatsPageHeaderProps {
  title: string;
  subtitle: string;
  views: StatsDashboardViewDefinition[];
  activeView: StatsDashboardViewId;
  onActiveViewChange: (viewId: StatsDashboardViewId) => void;
  isCustomizing: boolean;
  onToggleCustomize: () => void;
  entryTypes: string[];
  selectedTypes: string[];
  onSelectedTypesChange: (types: string[]) => void;
  yearOptions: string[];
  activeYear: string;
  onActiveYearChange: (year: string) => void;
  presets: StatsFilterPreset[];
  activePreset: StatsPresetKey;
  onPresetClick: (presetKey: Exclude<StatsPresetKey, null>) => void;
  onResetPreset: () => void;
}

export function StatsPageHeader({
  title,
  subtitle,
  views,
  activeView,
  onActiveViewChange,
  isCustomizing,
  onToggleCustomize,
  entryTypes,
  selectedTypes,
  onSelectedTypesChange,
  yearOptions,
  activeYear,
  onActiveYearChange,
  presets,
  activePreset,
  onPresetClick,
  onResetPreset,
}: StatsPageHeaderProps) {
  return (
    <header className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-3xl font-bold text-transparent">
            {title}
          </h2>
          <p className="text-gray-400">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
          <div className="flex overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-1">
            {views.map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => onActiveViewChange(view.id)}
                className={cn(
                  "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                  activeView === view.id
                    ? "bg-white/12 text-white shadow-lg"
                    : "text-gray-400 hover:bg-white/5 hover:text-white"
                )}
              >
                {view.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onToggleCustomize}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all",
              isCustomizing
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                : "border-white/10 bg-white/5 text-gray-200 hover:bg-white/10 hover:text-white"
            )}
          >
            {isCustomizing ? <Check size={16} /> : <SlidersHorizontal size={16} />}
            <span>{isCustomizing ? "Done" : "Customize"}</span>
          </button>

          <MultiSelectFilter
            options={entryTypes}
            selected={selectedTypes}
            onChange={onSelectedTypesChange}
            label="Content Types"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {presets.map((preset) => {
          const Icon = preset.icon;
          const isActive = activePreset === preset.key;

          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => onPresetClick(preset.key)}
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold shadow-lg transition-all duration-200",
                isActive
                  ? `bg-gradient-to-r ${preset.gradient} scale-105 text-white shadow-lg`
                  : "border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon size={18} />
              <span>{preset.label}</span>
            </button>
          );
        })}

        {activePreset ? (
          <button
            type="button"
            onClick={onResetPreset}
            className="text-sm text-gray-400 underline underline-offset-2 transition-colors hover:text-white"
          >
            Reset
          </button>
        ) : null}
      </div>

      <div className="flex w-fit overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-1">
        {yearOptions.map((year) => (
          <button
            key={year}
            type="button"
            onClick={() => onActiveYearChange(year)}
            className={cn(
              "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all",
              activeYear === year
                ? "bg-primary text-white shadow-lg"
                : "text-gray-400 hover:bg-white/5 hover:text-white"
            )}
          >
            {year}
          </button>
        ))}
      </div>
    </header>
  );
}
