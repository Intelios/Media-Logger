import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Home, Calendar, BarChart3, Search, Award, Users, Layers, Plus, ChevronDown, ChevronRight, PanelLeftClose, PanelLeft, Sparkles, Settings } from "lucide-react";
import { cn } from "../lib/utils_ui";
import { EntryForm } from "./EntryForm";
import { dbService, type MediaEntry } from "../lib/db";

// Configurable Years matching your python config
const YEARS = ["2023", "2024", "2025", "2026"];
const CURRENT_YEAR = "2026";

export function Layout() {
  const [isYearsCollapsed, setIsYearsCollapsed] = useState(false);
  const [isCompact, setIsCompact] = useState(() => {
    const saved = localStorage.getItem("sidebar-compact");
    return saved === "true";
  });
  const [showEntryForm, setShowEntryForm] = useState(false);
  const navigate = useNavigate();

  // Persist compact mode
  useEffect(() => {
    localStorage.setItem("sidebar-compact", String(isCompact));
  }, [isCompact]);

  const handleEntryCreated = async (entryData: Partial<MediaEntry>) => {
    try {
      // Save to database
      await dbService.addEntry(entryData as Omit<MediaEntry, "id">);
      setShowEntryForm(false);
      // Navigate to the year view for the new entry
      if (entryData.year_completed) {
        navigate(`/year/${entryData.year_completed}`);
      }
    } catch (error) {
      console.error("Failed to save entry:", error);
    }
  };

  return (
    <div className="flex h-screen bg-[#121212] text-white overflow-hidden">

      {/* Sidebar */}
      <aside className={cn(
        "bg-[#1E1E1E]/50 backdrop-blur-xl border-r border-white/5 flex flex-col transition-all duration-300 ease-out",
        isCompact ? "w-[72px] p-3" : "w-64 p-4"
      )}>
        {/* Logo */}
        <div className={cn("mb-6", isCompact ? "px-0 text-center" : "px-2")}>
          {isCompact ? (
            <div className="w-10 h-10 mx-auto rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20 animate-pulse-subtle">
              <Sparkles size={20} className="text-white" />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
                <Sparkles size={20} className="text-white" />
              </div>
              <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
                Media Logger
              </h1>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1 overflow-y-auto pr-1 custom-scrollbar">

          {/* Overview Section */}
          {!isCompact && <SectionLabel label="Overview" />}
          <NavItem to="/" icon={<Home size={18} />} label="Home" shortcut="⌘1" isCompact={isCompact} />

          {/* Years Section */}
          <div className="py-2">
            {!isCompact && (
              <button
                onClick={() => setIsYearsCollapsed(!isYearsCollapsed)}
                className="w-full flex items-center justify-between px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-400 transition-colors"
              >
                <span>Years</span>
                {isYearsCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
            )}

            <div className={cn(
              "space-y-1 overflow-hidden transition-all duration-200",
              isYearsCollapsed && !isCompact ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"
            )}>
              {YEARS.map(year => (
                <NavItem
                  key={year}
                  to={`/year/${year}`}
                  icon={<Calendar size={18} />}
                  label={year}
                  isCompact={isCompact}
                  badge={year === CURRENT_YEAR ? "NOW" : undefined}
                />
              ))}
            </div>
          </div>

          {/* Library Section */}
          {!isCompact && <SectionLabel label="Library" />}
          <NavItem to="/stats" icon={<BarChart3 size={18} />} label="Stats" shortcut="⌘2" isCompact={isCompact} />
          <NavItem to="/search" icon={<Search size={18} />} label="Search" shortcut="⌘3" isCompact={isCompact} />
          <NavItem to="/awards" icon={<Award size={18} />} label="Awards" isCompact={isCompact} />
          <NavItem to="/profiles" icon={<Users size={18} />} label="Profiles" isCompact={isCompact} />
          <NavItem to="/collections" icon={<Layers size={18} />} label="Collections" isCompact={isCompact} />

          {/* System Section */}
          {!isCompact && <SectionLabel label="System" />}
          <NavItem to="/settings" icon={<Settings size={18} />} label="Settings" isCompact={isCompact} />
        </nav>

        {/* Bottom Actions */}
        <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
          {/* Add Entry Button */}
          <button
            onClick={() => setShowEntryForm(true)}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold transition-all duration-200",
              "bg-gradient-to-r from-primary to-secondary hover:shadow-lg hover:shadow-primary/25 hover:scale-[1.02] active:scale-[0.98]",
              isCompact ? "px-2" : "px-4"
            )}
          >
            <Plus size={18} />
            {!isCompact && <span>Add Entry</span>}
          </button>

          {/* Compact Toggle */}
          <button
            onClick={() => setIsCompact(!isCompact)}
            className={cn(
              "w-full flex items-center gap-2 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all",
              isCompact ? "justify-center px-2" : "px-3"
            )}
            title={isCompact ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCompact ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
            {!isCompact && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
        <Outlet />
      </main>

      {/* Entry Form Modal */}
      {showEntryForm && (
        <EntryForm
          isOpen={showEntryForm}
          onClose={() => setShowEntryForm(false)}
          onSave={handleEntryCreated}
        />
      )}
    </div>
  );
}

// Section label component
function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-3">
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</span>
      <div className="flex-1 h-px bg-white/5" />
    </div>
  );
}

// Enhanced NavItem component
function NavItem({
  to,
  icon,
  label,
  shortcut,
  isCompact,
  badge
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  isCompact?: boolean;
  badge?: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-200",
          isCompact ? "justify-center px-2 py-2.5" : "px-3 py-2",
          isActive
            ? "bg-primary/15 text-white"
            : "text-gray-400 hover:bg-white/5 hover:text-white"
        )
      }
      title={isCompact ? label : undefined}
    >
      {({ isActive }) => (
        <>
          {/* Left accent bar */}
          <div className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full transition-all duration-200",
            isActive ? "h-5 bg-primary" : "h-0 bg-transparent"
          )} />

          {/* Icon with subtle animation */}
          <span className={cn(
            "transition-transform duration-200 group-hover:scale-110",
            isActive && "text-primary"
          )}>
            {icon}
          </span>

          {/* Label */}
          {!isCompact && (
            <>
              <span className="flex-1">{label}</span>

              {/* Current year badge */}
              {badge && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-secondary/20 text-secondary">
                  {badge}
                </span>
              )}

              {/* Keyboard shortcut (shown on hover) */}
              {shortcut && !badge && (
                <span className="text-[10px] text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  {shortcut}
                </span>
              )}
            </>
          )}
        </>
      )}
    </NavLink>
  );
}