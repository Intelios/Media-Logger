import { Children, isValidElement, useState, useEffect, useCallback, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Home, BarChart3, Search, Award, Users, Layers, Plus, ChevronDown, ChevronRight, PanelLeftClose, PanelLeft, Settings, PartyPopper, Bookmark, Database, X, ImageOff, RefreshCw } from "lucide-react";
import { cn } from "../lib/utils_ui";
import { EntryForm } from "./EntryForm";
import { WelcomeScreen } from "./WelcomeScreen";
import { dbService, type MediaEntry, DB_FILENAME, DB_MIGRATED_FLAG_KEY } from "../lib/db";
import { listen } from "@tauri-apps/api/event";
import { shouldShowWelcome } from "../lib/onboarding-logic";
import { getNavigationYears } from "../lib/settings";
import { getAvailableNavigationYears, getCurrentYearString, NAVIGATION_YEARS_UPDATED_EVENT } from "../lib/navigation-years";
import { getReportedImageFailures, retryFailedImages, type ImageLoadFailureDetail } from "../lib/utils";

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

const iconLayoutTransition = {
  type: "spring",
  stiffness: 400,
  damping: 25,
} as const;

const hoverSpringTransition = {
  type: "spring",
  stiffness: 420,
  damping: 16,
} as const;

const labelTransition = {
  duration: 0.18,
  ease: "easeOut",
} as const;

const navIconVariants = {
  rest: { scale: 1 },
  hover: {
    scale: 1.16,
    transition: hoverSpringTransition,
  },
};

const navGlowVariants = {
  rest: { opacity: 0, scale: 0.4 },
  hover: {
    opacity: 0.18,
    scale: 1.65,
    transition: hoverSpringTransition,
  },
};

const yearTrailTransition = {
  type: "spring",
  stiffness: 200,
  damping: 30,
} as const;

export function Layout() {
  const [years, setYears] = useState<string[]>(() => getNavigationYears());
  const [isCompact, setIsCompact] = useState(() => {
    const saved = localStorage.getItem("sidebar-compact");
    return saved === "true";
  });
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showDbMigratedBanner, setShowDbMigratedBanner] = useState(false);
  const [imageFailures, setImageFailures] = useState<Map<string, ImageLoadFailureDetail>>(new Map());
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

  useEffect(() => {
    const handleImageFailure = (event: CustomEvent<ImageLoadFailureDetail>) => {
      setImageFailures((current) => {
        const key = `${event.detail.operation}:${event.detail.path}`;
        const next = new Map(current);
        next.set(key, event.detail);
        return next;
      });
    };
    window.addEventListener('image-load-failed', handleImageFailure);
    for (const detail of getReportedImageFailures()) {
      handleImageFailure(new CustomEvent('image-load-failed', { detail }));
    }
    return () => window.removeEventListener('image-load-failed', handleImageFailure);
  }, []);

  // Listen for menu events from Tauri backend.
  // listen() resolves to its unlisten fn asynchronously; under React 19
  // StrictMode the effect mounts→unmounts→mounts in dev, so we guard with a
  // `cancelled` flag to unlisten as soon as the promise resolves if cleanup
  // already ran — preventing double-registration (menu events firing twice).
  useEffect(() => {
    let cancelled = false;
    let offNav: (() => void) | undefined;
    let offNewEntry: (() => void) | undefined;

    listen<string>("menu-navigate", (event) => {
      navigate(event.payload);
    }).then((fn) => {
      if (cancelled) fn();
      else offNav = fn;
    });

    listen("menu-new-entry", () => {
      setShowEntryForm(true);
    }).then((fn) => {
      if (cancelled) fn();
      else offNewEntry = fn;
    });

    return () => {
      cancelled = true;
      offNav?.();
      offNewEntry?.();
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
        "9": "/review",
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

  const handleRetryImages = () => {
    setImageFailures(new Map());
    retryFailedImages();
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

        window.dispatchEvent(new CustomEvent('entry-added', { detail: { year: entryData.year_completed } }));
      }
    } catch (error) {
      console.error("Failed to save entry:", error);
    }
  };

  const readFailureCount = [...imageFailures.values()].filter(
    (failure) => failure.operation === 'read'
  ).length;
  const thumbnailFailureCount = imageFailures.size - readFailureCount;

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
        <nav className="flex-1 -ml-3 space-y-1 overflow-y-auto pl-3 pr-1 custom-scrollbar">

          <NavItem to="/" icon={<Home size={18} />} label="Home" shortcut={getShortcutLabel("1")} isCompact={isCompact} />

          {/* Years Section - vertical timeline rail */}
          <CollapsibleSection label="Years" storageKey="years" isCompact={isCompact}>
            {(isCollapsed) => (
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
                <StaggerContainer isCollapsed={isCollapsed}>
                  {years.map(year => (
                    <YearTimelineItem
                      key={year}
                      year={year}
                      isCompact={isCompact}
                      shortcut={year === currentYear ? getShortcutLabel("2") : undefined}
                    />
                  ))}
                </StaggerContainer>
              </div>
            )}
          </CollapsibleSection>

          {/* Library Section */}
          <CollapsibleSection label="Library" storageKey="library" isCompact={isCompact}>
            {(isCollapsed) => (
              <StaggerContainer isCollapsed={isCollapsed}>
                <NavItem to="/stats" icon={<BarChart3 size={18} />} label="Stats" shortcut={getShortcutLabel("4")} isCompact={isCompact} />
                <NavItem to="/search" icon={<Search size={18} />} label="Search" shortcut={getShortcutLabel("3")} isCompact={isCompact} />
                <NavItem to="/backlog" icon={<Bookmark size={18} />} label="Backlog" shortcut={getShortcutLabel("8")} isCompact={isCompact} />
                <NavItem to="/awards" icon={<Award size={18} />} label="Awards" shortcut={getShortcutLabel("6")} isCompact={isCompact} />
                <NavItem to="/profiles" icon={<Users size={18} />} label="Profiles" shortcut={getShortcutLabel("5")} isCompact={isCompact} />
                <NavItem to="/collections" icon={<Layers size={18} />} label="Collections" shortcut={getShortcutLabel("7")} isCompact={isCompact} />
                <NavItem to="/review" icon={<PartyPopper size={18} />} label="Review" isCompact={isCompact} />
              </StaggerContainer>
            )}
          </CollapsibleSection>

          {/* System Section */}
          <CollapsibleSection label="System" storageKey="system" isCompact={isCompact}>
            {(isCollapsed) => (
              <StaggerContainer isCollapsed={isCollapsed}>
                <NavItem to="/settings" icon={<Settings size={18} />} label="Settings" shortcut={getShortcutLabel(",")} isCompact={isCompact} />
              </StaggerContainer>
            )}
          </CollapsibleSection>
        </nav>

        {/* Bottom Actions */}
        <div className="mt-4 pt-4 border-t space-y-2" style={{ borderColor: "var(--color-border-subtle)" }}>
          {/* Add Entry Button */}
          <button
            onClick={() => setShowEntryForm(true)}
            className={cn(
              "group w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold transition-all duration-200",
              "bg-gradient-to-r from-primary to-secondary hover:shadow-lg hover:shadow-primary/25 hover:scale-[1.02] active:scale-[0.98]",
              isCompact ? "px-2" : "px-4"
            )}
          >
            <motion.span layout transition={iconLayoutTransition} className="flex h-5 w-5 items-center justify-center">
              <span className="flex h-5 w-5 items-center justify-center motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out motion-safe:group-hover:rotate-[360deg]">
                <Plus size={18} />
              </span>
            </motion.span>
            <AnimatePresence initial={false}>
              {!isCompact && (
                <AnimatedSidebarText key="add-entry-label">
                  Add Entry
                </AnimatedSidebarText>
              )}
            </AnimatePresence>
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
            <motion.span layout transition={iconLayoutTransition} className="flex h-5 w-5 items-center justify-center">
              {isCompact ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
            </motion.span>
            <AnimatePresence initial={false}>
              {!isCompact && (
                <AnimatedSidebarText key="collapse-label">
                  Collapse
                </AnimatedSidebarText>
              )}
            </AnimatePresence>
          </button>
        </div>
      </aside>

      {/* Main Content Area.
          The themed background tint lives on a non-scrolling, viewport-sized
          layer rather than on the scroll container itself. When a translucent
          background sits on an `overflow-y-auto` element whose content exceeds
          the viewport, WebKit promotes that element to its own compositing
          layer and the translucency stops reading through the native window
          backdrop (Clear glass / vibrancy) — so tall pages looked darkened
          while short ones stayed clear. Keeping the tint on a fixed-size layer
          composites it once over the backdrop regardless of scroll height. */}
      <div className="relative flex-1 min-w-0">
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{ backgroundColor: 'var(--color-background)' }}
        />
        <main className="relative z-[1] h-full overflow-y-auto p-6 scroll-smooth">
          {imageFailures.size > 0 && (
            <div
              className="mb-4 flex items-start gap-3 rounded-xl border px-4 py-3"
              style={{
                borderColor: "rgba(245, 158, 11, 0.35)",
                backgroundColor: "rgba(245, 158, 11, 0.10)",
              }}
            >
              <ImageOff size={18} className="mt-0.5 shrink-0 text-amber-400" />
              <div className="flex-1 text-sm text-[var(--color-text)]">
                {readFailureCount > 0 ? (
                  <>
                    {readFailureCount === 1
                      ? 'One cover could not be loaded.'
                      : `${readFailureCount} covers could not be loaded.`}
                    {' '}Fallback artwork is being shown.
                    {thumbnailFailureCount > 0 && ` ${thumbnailFailureCount} other cover thumbnails are using their originals.`}
                  </>
                ) : (
                  <>
                    {thumbnailFailureCount === 1
                      ? 'One cover thumbnail could not be generated.'
                      : `${thumbnailFailureCount} cover thumbnails could not be generated.`}
                    {' '}Original covers are being used.
                  </>
                )}
              </div>
              <button
                onClick={handleRetryImages}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/15"
              >
                <RefreshCw size={14} />
                Retry
              </button>
              <button
                onClick={() => setImageFailures(new Map())}
                className="shrink-0 rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-black/5 hover:text-[var(--color-text)]"
                title="Dismiss image warning"
                aria-label="Dismiss image warning"
              >
                <X size={16} />
              </button>
            </div>
          )}
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
      </div>

      {showEntryForm && (
        <EntryForm
          isOpen={showEntryForm}
          onClose={() => setShowEntryForm(false)}
          onSave={handleEntryCreated}
        />
      )}

      {/* Welcome Screen for New Users */}
      {showWelcome && (
        <WelcomeScreen onComplete={handleWelcomeComplete} />
      )}
    </div>
  );
}

function AnimatedSidebarText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -6 }}
      transition={labelTransition}
      className={className}
    >
      {children}
    </motion.span>
  );
}

function StaggerContainer({ children, isCollapsed }: { children: ReactNode; isCollapsed: boolean }) {
  const items = Children.toArray(children);

  return (
    <>
      {items.map((child, index) => (
        <motion.div
          key={isValidElement(child) && child.key != null ? child.key : index}
          initial={false}
          animate={isCollapsed ? { opacity: 0, x: -8 } : { opacity: 1, x: 0 }}
          transition={
            isCollapsed
              ? {
                  duration: 0.12,
                  delay: (items.length - index - 1) * 0.015,
                  ease: "easeOut",
                }
              : {
                  type: "spring",
                  stiffness: 420,
                  damping: 30,
                  delay: index * 0.04,
                }
          }
        >
          {child}
        </motion.div>
      ))}
    </>
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
  children: ReactNode | ((isCollapsed: boolean) => ReactNode);
}) {
  const persistKey = `sidebar-section-${storageKey}`;
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem(persistKey) === "true");
  const isContentCollapsed = isCollapsed && !isCompact;
  const content = typeof children === "function" ? children(isContentCollapsed) : children;

  useEffect(() => {
    localStorage.setItem(persistKey, String(isCollapsed));
  }, [persistKey, isCollapsed]);

  return (
    <div className="py-2">
      <AnimatePresence initial={false}>
        {!isCompact && (
          <motion.button
            key={`${storageKey}-section-toggle`}
            layout
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={labelTransition}
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wider mb-2 transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <span>{label}</span>
            <motion.span layout transition={iconLayoutTransition} className="flex h-4 w-4 items-center justify-center">
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>

      <div className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200",
        isContentCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
      )}>
        <div className={cn(
          "min-h-0 space-y-1",
          isContentCollapsed ? "overflow-hidden" : "overflow-visible"
        )}>
          {content}
        </div>
      </div>
    </div>
  );
}

// Year entry rendered as a dot on the vertical timeline rail.
function YearTimelineItem({
  year,
  isCompact,
  shortcut,
}: {
  year: string;
  isCompact?: boolean;
  shortcut?: string;
}) {
  return (
    <motion.div initial="rest" animate="rest" whileHover="hover">
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
          <span className="relative flex w-2.5 h-2.5 items-center justify-center z-10">
            <span
              className="block w-2.5 h-2.5 rounded-full transition-colors duration-200"
              style={{
                backgroundColor: "var(--color-surface)",
                boxShadow: "0 0 0 2px var(--color-border)",
              }}
            />
            {isActive && (
              <>
                <motion.span
                  layoutId="year-active-trail"
                  className="absolute z-10 rounded-full bg-primary blur-md opacity-25"
                  style={{ inset: "-5px" }}
                  transition={yearTrailTransition}
                />
                <motion.span
                  layoutId="year-active-dot"
                  className="absolute inset-0 z-20 rounded-full bg-primary"
                  transition={{
                    type: "spring",
                    stiffness: 350,
                    damping: 25,
                  }}
                />
              </>
            )}
          </span>
        );

        return (
          <>
            <motion.span
              layout
              variants={navIconVariants}
              transition={iconLayoutTransition}
              className="relative z-10 flex w-2.5 shrink-0 items-center justify-center"
            >
              {dot}
            </motion.span>
            <AnimatePresence initial={false}>
              {!isCompact && (
                <AnimatedSidebarText key="year-content" className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex-1">{year}</span>
                  {shortcut && (
                    <span className="text-[10px] text-[var(--color-text-subtle)] opacity-0 transition-opacity group-hover:opacity-100">
                      {shortcut}
                    </span>
                  )}
                </AnimatedSidebarText>
              )}
            </AnimatePresence>
          </>
        );
        }}
      </NavLink>
    </motion.div>
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
  icon: ReactNode;
  label: string;
  shortcut?: string;
  isCompact?: boolean;
  badge?: string;
}) {
  return (
    <motion.div initial="rest" animate="rest" whileHover="hover">
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

            {/* Icon with spring hover and a subtle theme-colored glow. */}
            <motion.span
              layout
              variants={navIconVariants}
              transition={iconLayoutTransition}
              className={cn(
                "relative flex h-5 w-5 shrink-0 items-center justify-center",
                isActive && "text-primary"
              )}
            >
              <motion.span
                variants={navGlowVariants}
                className="pointer-events-none absolute inset-0 rounded-full bg-primary blur-md"
              />
              <span className="relative z-10 flex h-5 w-5 items-center justify-center">
                {icon}
              </span>
            </motion.span>

            {/* Label */}
            <AnimatePresence initial={false}>
              {!isCompact && (
                <AnimatedSidebarText key="nav-content" className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex-1 truncate">{label}</span>

                  {/* Current year badge */}
                  {badge && (
                    <span className="rounded bg-secondary/20 px-1.5 py-0.5 text-[10px] font-bold text-secondary">
                      {badge}
                    </span>
                  )}

                  {/* Keyboard shortcut (shown on hover) */}
                  {shortcut && (
                    <span className="text-[10px] text-[var(--color-text-subtle)] opacity-0 transition-opacity group-hover:opacity-100">
                      {shortcut}
                    </span>
                  )}
                </AnimatedSidebarText>
              )}
            </AnimatePresence>
          </>
        )}
      </NavLink>
    </motion.div>
  );
}
