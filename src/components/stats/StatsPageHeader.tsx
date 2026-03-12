import { cn } from "../../lib/utils_ui";
import { MultiSelectFilter } from "../MultiSelectFilter";
import type { StatsFilterPreset, StatsPresetKey } from "./stats-config";

interface StatsPageHeaderProps {
  title: string;
  subtitle: string;
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
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-3xl font-bold text-transparent">
            {title}
          </h2>
          <p className="text-gray-400">{subtitle}</p>
        </div>

        <div className="flex items-center gap-4">
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
