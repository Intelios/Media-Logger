import {
  Building2,
  Calendar,
  Gamepad2,
  Hash,
  Heart,
  PieChart as PieIcon,
  RefreshCw,
  Sparkles,
  Star,
  Trophy,
  User,
} from "lucide-react";
import type { FullStats } from "../../lib/stats-logic";
import { StatsPageHeader } from "./StatsPageHeader";
import { StatsSummaryRibbon, type StatsSummaryRibbonCard } from "./StatsSummaryRibbon";
import type { StatsFilterPreset, StatsPresetKey } from "./stats-config";
import { BreakdownListWidget } from "./widgets/BreakdownListWidget";
import { ContentTypeBreakdownWidget } from "./widgets/ContentTypeBreakdownWidget";
import { MonthlyActivityWidget } from "./widgets/MonthlyActivityWidget";
import { RatingDistributionWidget } from "./widgets/RatingDistributionWidget";
import { TopGenresWidget } from "./widgets/TopGenresWidget";

interface StatsDashboardProps {
  activeYear: string;
  yearOptions: string[];
  entryTypes: string[];
  selectedTypes: string[];
  onSelectedTypesChange: (types: string[]) => void;
  presets: StatsFilterPreset[];
  activePreset: StatsPresetKey;
  onPresetClick: (presetKey: Exclude<StatsPresetKey, null>) => void;
  onResetPreset: () => void;
  onActiveYearChange: (year: string) => void;
  data: FullStats;
  onPerfect10Click: () => void;
  onThisMonthClick: () => void;
  onViewAllGenres: () => void;
  onGenreClick: (genreName: string) => void;
}

export function StatsDashboard({
  activeYear,
  yearOptions,
  entryTypes,
  selectedTypes,
  onSelectedTypesChange,
  presets,
  activePreset,
  onPresetClick,
  onResetPreset,
  onActiveYearChange,
  data,
  onPerfect10Click,
  onThisMonthClick,
  onViewAllGenres,
  onGenreClick,
}: StatsDashboardProps) {
  const summaryCards: StatsSummaryRibbonCard[] = [
    {
      widgetId: "total-entries",
      icon: <Hash />,
      value: data.total,
      color: "blue",
    },
    {
      widgetId: "average-score",
      icon: <Star />,
      value: data.average_score.toFixed(1),
      color: "amber",
    },
    {
      widgetId: "rewatches",
      icon: <RefreshCw />,
      value: data.rewatch_count,
      color: "green",
    },
    {
      widgetId: "perfect-tens",
      icon: <Trophy />,
      value: data.perfectTenCount,
      color: "pink",
      onClick: onPerfect10Click,
    },
    {
      widgetId: "this-month",
      icon: <Calendar />,
      value: data.entriesThisMonth,
      color: "cyan",
      onClick: onThisMonthClick,
    },
    {
      widgetId: "genres-count",
      icon: <PieIcon />,
      value: data.genres.length,
      color: "purple",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-20">
      <StatsPageHeader
        title="Statistics"
        subtitle={`Deep dive analytics for ${activeYear}`}
        entryTypes={entryTypes}
        selectedTypes={selectedTypes}
        onSelectedTypesChange={onSelectedTypesChange}
        yearOptions={yearOptions}
        activeYear={activeYear}
        onActiveYearChange={onActiveYearChange}
        presets={presets}
        activePreset={activePreset}
        onPresetClick={onPresetClick}
        onResetPreset={onResetPreset}
      />

      <StatsSummaryRibbon cards={summaryCards} />

      {activeYear !== "All Time" ? <MonthlyActivityWidget monthlyCompletions={data.monthlyCompletions} /> : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <RatingDistributionWidget ratings={data.ratings} />
        <TopGenresWidget genres={data.genres} onViewAllGenres={onViewAllGenres} onGenreClick={onGenreClick} />
      </div>

      <ContentTypeBreakdownWidget items={data.mediaTypeBreakdown} totalEntries={data.total} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <BreakdownListWidget
          widgetId="platforms"
          icon={<Gamepad2 size={18} />}
          items={data.platforms.filter((item) => item.count >= 3)}
          accentColor="blue"
        />
        <BreakdownListWidget
          widgetId="franchises"
          icon={<Sparkles size={18} />}
          items={data.franchises.filter((item) => item.count >= 3)}
          accentColor="cyan"
        />
        <BreakdownListWidget
          widgetId="studios"
          icon={<Building2 size={18} />}
          items={data.studios.filter((item) => item.count >= 3)}
          accentColor="purple"
        />
        <BreakdownListWidget
          widgetId="authors"
          icon={<User size={18} />}
          items={data.authors.filter((item) => item.count >= 3)}
          accentColor="green"
        />
        <BreakdownListWidget
          widgetId="actresses"
          icon={<Heart size={18} />}
          items={data.actresses.filter((item) => item.count >= 3)}
          accentColor="pink"
        />
      </div>
    </div>
  );
}
