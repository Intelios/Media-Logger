import { ReactNode } from "react";
import { cn } from "../lib/utils_ui";

interface DashboardStatCardProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  subtext: string;
  colorClass: string;
  progress?: number;
}

export function DashboardStatCard({ icon, value, label, subtext, colorClass, progress }: DashboardStatCardProps) {
  // Map color class to gradient and glow classes
  const gradientClass = {
    blue: "stat-gradient-blue",
    amber: "stat-gradient-amber",
    green: "stat-gradient-green",
    purple: "stat-gradient-purple",
  }[colorClass] || "";

  const textColors = {
    blue: "text-blue-400",
    amber: "text-amber-400",
    green: "text-green-400",
    purple: "text-purple-400",
  }[colorClass] || "text-gray-400";

  const iconBgColors = {
    blue: "bg-blue-500/20 text-blue-400",
    amber: "bg-amber-500/20 text-amber-400",
    green: "bg-green-500/20 text-green-400",
    purple: "bg-purple-500/20 text-purple-400",
  }[colorClass] || "bg-gray-500/20 text-gray-400";

  const barColors = {
    blue: "bg-gradient-to-r from-blue-600 to-blue-400 progress-glow-blue",
    amber: "bg-gradient-to-r from-amber-600 to-amber-400 progress-glow-amber",
    green: "bg-gradient-to-r from-green-600 to-green-400 progress-glow-green",
    purple: "bg-gradient-to-r from-purple-600 to-purple-400 progress-glow-purple",
  }[colorClass] || "bg-gray-500";

  const glowOrbs = {
    blue: "bg-blue-500/30",
    amber: "bg-amber-500/30",
    green: "bg-green-500/30",
    purple: "bg-purple-500/30",
  }[colorClass] || "bg-gray-500/30";

  return (
    <div className={cn(
      "relative p-5 rounded-2xl border transition-all duration-500 backdrop-blur-xl card-shine group",
      gradientClass
    )}>
      {/* Decorative glow orb */}
      <div className={cn(
        "absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-50 group-hover:opacity-80 transition-opacity duration-500 pointer-events-none",
        glowOrbs
      )} />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className={cn(
            "p-3 rounded-xl backdrop-blur-sm shadow-lg transition-all duration-300 group-hover:scale-110",
            iconBgColors
          )}>
            {icon}
          </div>
        </div>

        <div className="space-y-1">
          <h4 className="text-3xl font-bold text-white tracking-tight">{value}</h4>
          <p className={cn("font-semibold text-sm", textColors)}>{label}</p>
          <p className="text-xs text-gray-400 font-medium">{subtext}</p>
        </div>

        {progress !== undefined && (
          <div className="mt-4 h-2 w-full bg-black/30 rounded-full overflow-hidden backdrop-blur-sm">
            <div
              className={cn("h-full rounded-full transition-all duration-1000 ease-out", barColors)}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}