import { ReactNode } from "react";
import { cn } from "../lib/utils_ui";

interface DashboardStatCardProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  subtext: string;
  colorClass: string; // Tailwind color class prefix e.g., "blue"
  progress?: number;
}

export function DashboardStatCard({ icon, value, label, subtext, colorClass, progress }: DashboardStatCardProps) {
  // Dynamic color mapping for Tailwind
  const bgStyles = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:border-blue-500/40",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:border-amber-500/40",
    green: "bg-green-500/10 text-green-400 border-green-500/20 hover:border-green-500/40",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20 hover:border-purple-500/40",
  }[colorClass] || "bg-gray-500/10 text-gray-400";

  const barColor = {
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    green: "bg-green-500",
    purple: "bg-purple-500",
  }[colorClass];

  return (
    <div className={cn(
      "relative p-5 rounded-2xl border transition-all duration-300 backdrop-blur-md",
      bgStyles
    )}>
      <div className="flex items-start justify-between mb-4">
        <div className="p-3 rounded-xl bg-white/5 backdrop-blur-sm shadow-sm">
          {icon}
        </div>
        {/* Optional Trend Indicator could go here */}
      </div>

      <div className="space-y-1">
        <h4 className="text-3xl font-bold text-white tracking-tight">{value}</h4>
        <p className="font-semibold text-sm opacity-90">{label}</p>
        <p className="text-xs opacity-60 font-medium">{subtext}</p>
      </div>

      {progress !== undefined && (
        <div className="mt-4 h-1.5 w-full bg-black/20 rounded-full overflow-hidden">
          <div 
            className={cn("h-full rounded-full transition-all duration-1000 ease-out", barColor)} 
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}