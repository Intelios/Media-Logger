import { useState, useEffect, useCallback } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Home, Calendar, BarChart3, Search, Award, Users, Layers, Plus, ChevronDown, ChevronRight, PanelLeftClose, PanelLeft, Sparkles, Settings, PartyPopper, Bookmark } from "lucide-react";
import { cn } from "../lib/utils_ui";
import { EntryForm } from "./EntryForm";
import { WelcomeScreen } from "./WelcomeScreen";
import { dbService, type MediaEntry } from "../lib/db";
import { listen } from "@tauri-apps/api/event";
import { shouldShowWelcome } from "../lib/onboarding-logic";
import { getNavigationYears } from "../lib/settings";
import { getAvailableNavigationYears, getCurrentYearString, NAVIGATION_YEARS_UPDATED_EVENT } from "../lib/navigation-years";

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac/i.test(navigator.platform) || /mac os/i.test(navigator.userAgent);
}

function getShortcutLabel(key: string): string {
  return isMacPlatform() ? `⌘${key}` : `Ctrl+${key}`;
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function Layout() {
  const [isYearsCollapsed, setIsYearsCollapsed] = useState(false);
  const [years, setYears] = useState<string[]>(() => getNavigationYears());
  const [isCompact, setIsCompact] = useState(() => {
    const saved = localStorage.getItem("sidebar-compact");
    return saved === "true";
  });
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [allEntries, setAllEntries] = useState<MediaEntry[]>([]);
  const navigate = useNavigate();
  const currentYear = getCurrentYearString();

  // Persist compact mode
  useEffect(() => {
    localStorage.setItem("sidebar-compact", String(isCompact));
  }, [isCompact]);

  const refreshYears = useCallback(async () => {
    const availableYears = await getAvailableNavigationYears();
    setYears(availableYears);
  }, []);

  useEffect(() => {
    void refreshYears();

    const handleYearsChanged = () => {
      void refreshYears();
    };

    window.addEventListener(NAVIGATION_YEARS_UPDATED_EVENT, handleYearsChanged);
    window.addEventListener("entry-added", handleYearsChanged as EventListener);

    return () => {
      window.removeEventListener(NAVIGATION_YEARS_UPDATED_EVENT, handleYearsChanged);
      window.removeEventListener("entry-added", handleYearsChanged as EventListener);
    };
  }, [refreshYears]);

  // Listen for menu events from Tauri backend
  useEffect(() => {
    const unlistenNav = listen<string>("menu-navigate", (event) => {
      navigate(event.payload);
    });

    const unlistenNewEntry = listen("menu-new-entry", () => {
      setShowEntryForm(true);
    });

    return () => {
      unlistenNav.then((fn) => fn());
      unlistenNewEntry.then((fn) => fn());
    };
  }, [navigate]);

  // Windows/Linux do not use the native macOS menu bar, so handle shortcuts here.
  useEffect(() => {
    if (isMacPlatform()) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || isEditableShortcutTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const routes: Record<string, string> = {
        "1": "/",
        "2": `/year/${currentYear}`,
        "3": "/search",
        "4": "/stats",
        "5": "/profiles",
        "6": "/awards",
        "7": "/collections",
        "8": "/backlog",
        ",": "/settings",
      };

      if (key === "n") {
        event.preventDefault();
        setShowEntryForm(true);
        return;
      }

      const route = routes[key];
      if (route) {
        event.preventDefault();
        navigate(route);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentYear, navigate]);

  // Fetch all entries for autocomplete when the entry form opens
  useEffect(() => {
    if (showEntryForm) {
      dbService.getAllEntries().then(setAllEntries).catch(console.error);
    }
  }, [showEntryForm]);

  // Check if we should show welcome screen
  useEffect(() => {
    const checkWelcome = async () => {
      const show = await shouldShowWelcome();
      setShowWelcome(show);
    };
    checkWelcome();
  }, []);

  const handleWelcomeComplete = (openEntryForm?: boolean) => {
    setShowWelcome(false);
    if (openEntryForm) {
      setShowEntryForm(true);
    }
  };


  const handleEntryCreated = async (entryData: Partial<MediaEntry>) => {
    try {
      // Save to database
      await dbService.addEntry(entryData as Omit<MediaEntry, "id">);
      setShowEntryForm(false);

      // Navigate to the year view for the new entry
      if (entryData.year_completed) {
        navigate(`/year/${entryData.year_completed}`);

        // Dispatch event after navigation with delay to ensure YearView is mounted
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('entry-added', { detail: { year: entryData.year_completed } }));
        }, 100);
      }
    } catch (error) {
      console.error("Failed to save entry:", error);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ color: "var(--color-text)" }}>

      {/* Sidebar - transparent to show the native desktop backdrop */}
      <aside className={cn(
        "bg-transparent border-r flex flex-col transition-all duration-300 ease-out",
        isCompact ? "w-[72px] p-3" : "w-64 p-4"
      )}
        style={{ borderColor: "var(--color-border)" }}
      >
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
          <NavItem to="/" icon={<Home size={18} />} label="Home" shortcut={getShortcutLabel("1")} isCompact={isCompact} />

          {/* Years Section */}
          <div className="py-2">
            {!isCompact && (
              <button
                onClick={() => setIsYearsCollapsed(!isYearsCollapsed)}
                className="w-full flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wider mb-2 transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                <span>Years</span>
                {isYearsCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
            )}

            <div className={cn(
              "space-y-1 overflow-hidden transition-all duration-200",
              isYearsCollapsed && !isCompact ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"
            )}>
              {years.map(year => (
                <NavItem
                  key={year}
                  to={`/year/${year}`}
                  icon={<Calendar size={18} />}
                  label={year}
                  isCompact={isCompact}
                  badge={year === currentYear ? "NOW" : undefined}
                  shortcut={year === currentYear ? getShortcutLabel("2") : undefined}
                />
              ))}
            </div>
          </div>

          {/* Library Section */}
          {!isCompact && <SectionLabel label="Library" />}
          <NavItem to="/stats" icon={<BarChart3 size={18} />} label="Stats" shortcut={getShortcutLabel("4")} isCompact={isCompact} />
          <NavItem to="/search" icon={<Search size={18} />} label="Search" shortcut={getShortcutLabel("3")} isCompact={isCompact} />
          <NavItem to="/backlog" icon={<Bookmark size={18} />} label="Backlog" shortcut={getShortcutLabel("8")} isCompact={isCompact} />
          <NavItem to="/awards" icon={<Award size={18} />} label="Awards" shortcut={getShortcutLabel("6")} isCompact={isCompact} />
          <NavItem to="/profiles" icon={<Users size={18} />} label="Profiles" shortcut={getShortcutLabel("5")} isCompact={isCompact} />
          <NavItem to="/collections" icon={<Layers size={18} />} label="Collections" shortcut={getShortcutLabel("7")} isCompact={isCompact} />
          <NavItem to="/review" icon={<PartyPopper size={18} />} label="Review" isCompact={isCompact} />

          {/* System Section */}
          {!isCompact && <SectionLabel label="System" />}
          <NavItem to="/settings" icon={<Settings size={18} />} label="Settings" shortcut={getShortcutLabel(",")} isCompact={isCompact} />
        </nav>

        {/* Bottom Actions */}
        <div className="mt-4 pt-4 border-t space-y-2" style={{ borderColor: "var(--color-border-subtle)" }}>
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
              "w-full flex items-center gap-2 py-2 rounded-lg text-sm transition-all text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-black/5",
              isCompact ? "justify-center px-2" : "px-3"
            )}
            title={isCompact ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCompact ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
            {!isCompact && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area - uses theme variable for background */}
      <main className="flex-1 overflow-y-auto p-6 scroll-smooth" style={{ backgroundColor: 'var(--color-background)' }}>
        <Outlet />
      </main>

      {showEntryForm && (
        <EntryForm
          isOpen={showEntryForm}
          onClose={() => setShowEntryForm(false)}
          onSave={handleEntryCreated}
          allEntries={allEntries}
        />
      )}

      {/* Welcome Screen for New Users */}
      {showWelcome && (
        <WelcomeScreen onComplete={handleWelcomeComplete} />
      )}
    </div>
  );
}

// Section label component
function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">{label}</span>
      <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border-subtle)" }} />
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
            ? "bg-primary/15 text-[var(--color-text)]"
            : "text-[var(--color-text-muted)] hover:bg-black/5 hover:text-[var(--color-text)]"
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
              {shortcut && (
                <span className="text-[10px] text-[var(--color-text-subtle)] opacity-0 group-hover:opacity-100 transition-opacity">
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
