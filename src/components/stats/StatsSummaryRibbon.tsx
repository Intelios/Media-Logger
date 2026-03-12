import { type ReactNode } from "react";
import { StatsSummaryCard, type SummaryCardColor } from "./StatsSummaryCard";
import { STATS_WIDGET_META, type SummaryWidgetId } from "./stats-config";

export interface StatsSummaryRibbonCard {
  widgetId: SummaryWidgetId;
  icon: ReactNode;
  value: string | number;
  color: SummaryCardColor;
  onClick?: () => void;
}

interface StatsSummaryRibbonProps {
  cards: StatsSummaryRibbonCard[];
}

export function StatsSummaryRibbon({ cards }: StatsSummaryRibbonProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <StatsSummaryCard
          key={card.widgetId}
          widgetId={card.widgetId}
          icon={card.icon}
          label={STATS_WIDGET_META[card.widgetId].title}
          value={card.value}
          color={card.color}
          onClick={card.onClick}
        />
      ))}
    </div>
  );
}
