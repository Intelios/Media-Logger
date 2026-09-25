import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Dices } from "lucide-react";
import { dbService, type RandomPickFilterOptions, type RandomPickFilters } from "../../lib/db";
import { useAdultMediaEnabled } from "../../lib/media-config";
import {
  DEFAULT_RANDOM_PICK_FILTERS,
  loadRandomPickFilters,
  pruneToOptions,
  saveRandomPickFilters,
  type SearchFilterSnapshot,
} from "../../lib/random-pick/filters";
import { useEscapeToClose } from "../../lib/useEscapeToClose";
import { cn } from "../../lib/utils_ui";
import { CardDeal } from "./CardDeal";
import { RandomPickConsole } from "./RandomPickConsole";

type Step = "configure" | "deal";

interface RandomPickViewProps {
  onBack: () => void;
  /** Search's active filters, offered through "Use search filters". */
  searchFilters: SearchFilterSnapshot | null;
  /** Called after an entry is edited from a pick so Search can refresh. */
  onEntryChanged: () => void;
}

const STEPS: { key: Step; label: string }[] = [
  { key: "configure", label: "Filters" },
  { key: "deal", label: "Result" },
];

/**
 * Full-page Random Pick, reached from the dice in Search's empty query bar.
 * Step 1 sets the table (filters, remembered between visits); step 2 deals a
 * fan of face-down cards from the filtered pool and flips the winner.
 */
export function RandomPickView({ onBack, searchFilters, onEntryChanged }: RandomPickViewProps) {
  const adultEnabled = useAdultMediaEnabled();
  const [filters, setFilters] = useState<RandomPickFilters>(loadRandomPickFilters);
  const [filterOptions, setFilterOptions] = useState<RandomPickFilterOptions | null>(null);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [step, setStep] = useState<Step>("configure");
  const [dealKey, setDealKey] = useState(0);
  const [countToken, setCountToken] = useState(0);

  // Escape steps back one level: deal → filters → Search. Open dialogs sit
  // above this on the escape stack, so they close first.
  useEscapeToClose(true, step === "deal" ? () => setStep("configure") : onBack);

  useEffect(() => {
    let isActive = true;
    dbService.getRandomPickFilterOptions()
      .then((options) => {
        if (!isActive) return;
        setFilterOptions(options);
        setFilters((current) => pruneToOptions(current, options));
      })
      .catch((error) => console.error("Failed to load random pick options:", error));
    return () => {
      isActive = false;
    };
  }, [adultEnabled]);

  useEffect(() => {
    saveRandomPickFilters(filters);
  }, [filters]);



  useEffect(() => {
    let isActive = true;
    const timer = window.setTimeout(() => {
      dbService.getRandomPickCount(filters)
        .then((count) => {
          if (isActive) setMatchCount(count);
        })
        .catch((error) => console.error("Failed to count random pick matches:", error));
    }, 200);
    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [filters, adultEnabled, countToken]);

  const handleDeal = () => {
    setDealKey((current) => current + 1);
    setStep("deal");
  };

  const handleEntryChanged = useCallback(() => {
    setCountToken((current) => current + 1);
    onEntryChanged();
  }, [onEntryChanged]);

  return (
    <div className="flex h-full flex-col gap-5">
      <header className="flex shrink-0 flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft size={16} />
          Search
        </button>
        <div className="h-8 w-px bg-white/10" />
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="shrink-0 rounded-xl p-2.5"
            style={{
              background:
                "linear-gradient(to bottom right, color-mix(in srgb, var(--color-primary) 22%, transparent), color-mix(in srgb, var(--color-secondary) 22%, transparent))",
            }}
          >
            <Dices size={20} style={{ color: "var(--color-primary)" }} />
          </div>
          <div className="min-w-0">
            <h1
              className="bg-clip-text text-2xl font-bold text-transparent"
              style={{ backgroundImage: "linear-gradient(to right, var(--color-primary), var(--color-secondary))" }}
            >
              Random Pick
            </h1>
          </div>
        </div>

        <nav aria-label="Random Pick steps" className="ml-auto flex items-center gap-1 rounded-xl border border-white/5 bg-white/5 p-1">
          {STEPS.map(({ key, label }, index) => {
            const active = step === key;
            const reachable = key === "configure" || step === "deal";
            return (
              <button
                key={key}
                type="button"
                disabled={!reachable || active}
                onClick={() => setStep(key)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  active ? "bg-white/15 text-white shadow-sm" : "text-gray-500",
                  reachable && !active && "hover:text-gray-200",
                )}
              >
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
                  style={
                    active
                      ? { background: "linear-gradient(to bottom right, var(--color-primary), var(--color-secondary))", color: "white" }
                      : { backgroundColor: "rgba(255,255,255,0.08)" }
                  }
                >
                  {index + 1}
                </span>
                {label}
              </button>
            );
          })}
        </nav>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {step === "configure" ? (
            <RandomPickConsole
              filters={filters}
              filterOptions={filterOptions}
              matchCount={matchCount}
              searchFilters={searchFilters}
              onFiltersChange={setFilters}
              onReset={() => setFilters(DEFAULT_RANDOM_PICK_FILTERS)}
              onDeal={handleDeal}
            />
          ) : (
            <CardDeal
              key={dealKey}
              filters={filters}
              matchCount={matchCount}
              onAdjustFilters={() => setStep("configure")}
              onEntryChanged={handleEntryChanged}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
