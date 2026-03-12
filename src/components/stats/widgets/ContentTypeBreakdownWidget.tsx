import { PieChart as PieIcon } from "lucide-react";
import type { StatItem } from "../../../lib/stats-logic";
import { StatsWidgetShell } from "../StatsWidgetShell";
import { STATS_WIDGET_META } from "../stats-config";

interface ContentTypeBreakdownWidgetProps {
  items: StatItem[];
  totalEntries: number;
}

export function ContentTypeBreakdownWidget({ items, totalEntries }: ContentTypeBreakdownWidgetProps) {
  const meta = STATS_WIDGET_META["content-type-breakdown"];

  return (
    <StatsWidgetShell
      widgetId={meta.id}
      title={meta.title}
      icon={<PieIcon className="text-green-400" size={20} />}
      heightPreset={meta.heightPreset}
      fillBody
      isEmpty={items.length === 0}
      emptyState={
        <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
          <p className="text-sm text-gray-400">No content types available for the current filters.</p>
        </div>
      }
    >
      <div className="grid h-full grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {items.map((item) => {
          const percentage = totalEntries > 0 ? (item.count / totalEntries) * 100 : 0;

          return (
            <div
              key={item.name}
              className="flex min-h-[132px] flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/[0.06] px-4 py-5 text-center transition-colors hover:bg-white/10"
            >
              <div className="text-2xl font-bold text-white">{item.count}</div>
              <div className="truncate text-sm text-gray-400">{item.name}</div>
              <div className="mt-1 text-xs text-gray-500">{percentage.toFixed(1)}%</div>
              {item.avgScore ? <div className="mt-1 text-xs text-amber-400">⭐ {item.avgScore.toFixed(1)}</div> : null}
            </div>
          );
        })}
      </div>
    </StatsWidgetShell>
  );
}
