import { useState, useEffect, useCallback } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, BarChart3, Search, Award, Users, Layers, Plus, ChevronDown, ChevronRight, PanelLeftClose, PanelLeft, Settings, PartyPopper, Bookmark, Database, X } from "lucide-react";
import { cn } from "../lib/utils_ui";
import { EntryForm } from "./EntryForm";
import { WelcomeScreen } from "./WelcomeScreen";
import { dbService, type MediaEntry, DB_FILENAME, DB_MIGRATED_FLAG_KEY } from "../lib/db";
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
  const [years, setYears] = useState<string[]>(() => getNavigationYears());
  const [isCompact, setIsCompact] = useState(() => {
    const saved = localStorage.getItem("sidebar-compact");
    return saved === "true";
  });
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showDbMigratedBanner, setShowDbMigratedBanner] = useState(false);
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

  // Check if we should show welcome screen. This awaits a DB query, which runs the
  // lazy connect() (and thus any one-time legacy DB migration) — so afterwards we can
  // reliably read the migration flag to decide whether to show the one-time banner.
  useEffect(() => {
    const checkWelcome = async () => {
      const show = await shouldShowWelcome();
      setShowWelcome(show);
      if (localStorage.getItem(DB_MIGRATED_FLAG_KEY)) {
        setShowDbMigratedBanner(true);
      }
    };
    checkWelcome();
  }, []);

  const handleDismissDbMigratedBanner = () => {
    localStorage.removeItem(DB_MIGRATED_FLAG_KEY);
    setShowDbMigratedBanner(false);
  };

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
        {/* Navigation Items */}
        <nav className="flex-1 space-y-1 overflow-y-auto pr-1 custom-scrollbar">

          {/* Overview Section */}
          {!isCompact && <SectionLabel label="Overview" />}
          <NavItem to="/" icon={<Home size={18} />} label="Home" shortcut={getShortcutLabel("1")} isCompact={isCompact} />

          {/* Years Section - vertical timeline rail */}
          <CollapsibleSection label="Years" storageKey="years" isCompact={isCompact}>
            <div className={cn("relative", isCompact ? "" : "pl-1")}>
              {/* Rail line connecting the dots */}
              <div
                className="absolute top-3 bottom-3 w-px"
                style={{
                  left: isCompact ? "50%" : "21px",
                  transform: isCompact ? "translateX(-0.5px)" : undefined,
                  backgroundColor: "var(--color-border)",
                }}
              />
              {years.map(year => (
                <YearTimelineItem
                  key={year}
                  year={year}
                  isCompact={isCompact}
                  isCurrent={year === currentYear}
                  shortcut={year === currentYear ? getShortcutLabel("2") : undefined}
                />
              ))}
            </div>
          </CollapsibleSection>

          {/* Library Section */}
          <CollapsibleSection label="Library" storageKey="library" isCompact={isCompact}>
            <NavItem to="/stats" icon={<BarChart3 size={18} />} label="Stats" shortcut={getShortcutLabel("4")} isCompact={isCompact} />
            <NavItem to="/search" icon={<Search size={18} />} label="Search" shortcut={getShortcutLabel("3")} isCompact={isCompact} />
            <NavItem to="/backlog" icon={<Bookmark size={18} />} label="Backlog" shortcut={getShortcutLabel("8")} isCompact={isCompact} />
            <NavItem to="/awards" icon={<Award size={18} />} label="Awards" shortcut={getShortcutLabel("6")} isCompact={isCompact} />
            <NavItem to="/profiles" icon={<Users size={18} />} label="Profiles" shortcut={getShortcutLabel("5")} isCompact={isCompact} />
            <NavItem to="/collections" icon={<Layers size={18} />} label="Collections" shortcut={getShortcutLabel("7")} isCompact={isCompact} />
            <NavItem to="/review" icon={<PartyPopper size={18} />} label="Review" isCompact={isCompact} />
          </CollapsibleSection>

          {/* System Section */}
          <CollapsibleSection label="System" storageKey="system" isCompact={isCompact}>
            <NavItem to="/settings" icon={<Settings size={18} />} label="Settings" shortcut={getShortcutLabel(",")} isCompact={isCompact} />
          </CollapsibleSection>
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
        {showDbMigratedBanner && (
          <div
            className="mb-4 flex items-start gap-3 rounded-xl border px-4 py-3"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface, rgba(0,0,0,0.03))",
            }}
          >
            <Database size={18} className="mt-0.5 shrink-0 text-primary" />
            <div className="flex-1 text-sm text-[var(--color-text)]">
              Your library was upgraded to the new <code className="font-mono">{DB_FILENAME}</code> format.
              A backup of your old database file was kept and your data is fully intact.
            </div>
            <button
              onClick={handleDismissDbMigratedBanner}
              className="shrink-0 rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-black/5 hover:text-[var(--color-text)]"
              title="Dismiss"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        )}
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

// Collapsible sidebar section with persisted state. Header hides in compact mode.
function CollapsibleSection({
  label,
  storageKey,
  isCompact,
  children,
}: {
  label: string;
  storageKey: string;
  isCompact?: boolean;
  children: React.ReactNode;
}) {
  const persistKey = `sidebar-section-${storageKey}`;
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem(persistKey) === "true");

  useEffect(() => {
    localStorage.setItem(persistKey, String(isCollapsed));
  }, [persistKey, isCollapsed]);

  return (
    <div className="py-2">
      {!isCompact && (
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wider mb-2 transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <span>{label}</span>
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
      )}

      <div className={cn(
        "space-y-1 overflow-hidden transition-all duration-200",
        isCollapsed && !isCompact ? "max-h-0 opacity-0" : "max-h-[1000px] opacity-100"
      )}>
        {children}
      </div>
    </div>
  );
}

// Year entry rendered as a dot on the vertical timeline rail.
function YearTimelineItem({
  year,
  isCompact,
  isCurrent,
  shortcut,
}: {
  year: string;
  isCompact?: boolean;
  isCurrent?: boolean;
  shortcut?: string;
}) {
  return (
    <NavLink
      to={`/year/${year}`}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center rounded-lg text-sm font-medium transition-all duration-200",
          isCompact ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2",
          isActive
            ? "text-[var(--color-text)]"
            : "text-[var(--color-text-muted)] hover:bg-black/5 hover:text-[var(--color-text)]"
        )
      }
      title={isCompact ? year : undefined}
    >
      {({ isActive }) => {
        // Dot marker sitting on the rail: glowing for the current year,
        // filled for the active route, hollow otherwise.
        const dot = (
          <span
            className={cn(
              "block w-2.5 h-2.5 rounded-full transition-all duration-200 z-10",
              isCurrent && "animate-pulse-subtle"
            )}
            style={
              isCurrent || isActive
                ? {
                    backgroundColor: "var(--color-primary)",
                    boxShadow: isCurrent ? "0 0 8px 2px var(--color-primary)" : undefined,
                  }
                : {
                    backgroundColor: "var(--color-surface)",
                    boxShadow: "0 0 0 2px var(--color-border)",
                  }
            }
          />
        );

        if (isCompact) return dot;

        return (
          <>
            <span className="relative flex w-2.5 items-center justify-center transition-transform duration-200 group-hover:scale-110">
              {dot}
            </span>
            <span className="flex-1">{year}</span>
            {shortcut && (
              <span className="text-[10px] text-[var(--color-text-subtle)] opacity-0 group-hover:opacity-100 transition-opacity">
                {shortcut}
              </span>
            )}
          </>
        );
      }}
    </NavLink>
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
          {isActive && (
            <motion.div
              layoutId="nav-active-bar"
              className="absolute left-0 top-[calc(50%-0.625rem)] w-1 h-5 rounded-r-full bg-primary"
              transition={{
                type: "spring",
                stiffness: 350,
                damping: 25,
              }}
            />
          )}

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
