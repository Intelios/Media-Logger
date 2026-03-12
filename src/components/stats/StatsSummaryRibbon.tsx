import type { ReactNode } from "react";

interface StatsSummaryRibbonProps {
  children: ReactNode;
}

export function StatsSummaryRibbon({ children }: StatsSummaryRibbonProps) {
  return <div className="grid grid-cols-2 items-stretch gap-4 md:grid-cols-3 lg:grid-cols-6">{children}</div>;
}
