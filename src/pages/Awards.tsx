import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import {
  awardsLogic,
  GENERAL_GROUP,
  withCreditedPerson,
  type AwardCategoryWithWinner,
  type AwardTemplate,
  type AwardYearSummary,
  type MostAwardedEntry,
  type TemplateDeletionImpact,
  type TemplateWinnerHistory,
} from "../lib/awards-logic";
import { useAdultMediaEnabled } from "../lib/media-config";
import { invalidateMediaQueries, mediaQueryKeys } from "../lib/query-client";
import { WinnerPicker } from "../components/WinnerPicker";
import { CreateAwardYearModal } from "../components/awards/CreateAwardYearModal";
import { CategoryPicker } from "../components/CategoryPicker";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { AwardReorderModal, type AwardReorderGroup } from "../components/awards/AwardReorderModal";
import { AwardHomeView } from "../components/awards/AwardHomeView";
import { AwardYearView } from "../components/awards/AwardYearView";
import { AwardDetailView } from "../components/awards/AwardDetailView";
import { AwardMostAwardedView } from "../components/awards/AwardMostAwardedView";
import type { InspectorAward } from "../components/awards/AwardInspector";
import { useMainScrollContainer } from "../lib/scroll-container";

// Toast for award/year mutation failures. Rendered by the controller so an
// error is never raised into a view that has nowhere to show it.
function AwardErrorToast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div className="app-error-toast fixed bottom-6 right-6 z-[80] flex items-start gap-3 max-w-sm bg-[#2a1a1a] border border-red-500/40 rounded-xl p-4 shadow-2xl">
      <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-red-200 flex-1">{message}</p>
      <button
        onClick={onDismiss}
        className="p-1 hover:bg-white/10 rounded-full transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
        aria-label="Dismiss error"
      >
        <X size={14} className="text-red-300" />
      </button>
    </div>
  );
}

type ViewType = "main" | "year" | "category" | "most-awarded";

interface PickerTarget {
  categoryId: number;
  year: number;
  entryType: string | null;
  /** The award asks who to credit alongside the winner. */
  creditsPerson: boolean;
  /** The current winner and its name, so re-picking that entry keeps the name. */
  current: { mediaId: number; name: string | null } | null;
}

/** What opening the winner picker needs to know about an award. */
type PickerSource = Pick<
  InspectorAward,
  "categoryId" | "year" | "entryType" | "creditsPerson" | "winner" | "creditedPerson"
>;

/**
 * Awards controller. Owns the three views' data, every mutation handler and
 * every modal; the views themselves are presentation + local selection state.
 */
export default function AwardsPage() {
  const [view, setView] = useState<ViewType>("main");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  // Template to select when the year view mounts (history cover navigation).
  const [initialTemplateId, setInitialTemplateId] = useState<number | null>(null);
  // Which side a year switch enters from: +1 for a later year, -1 for earlier.
  const [yearDirection, setYearDirection] = useState<1 | -1>(1);
  // Set while the outgoing year is playing its exit animation.
  const [yearExit, setYearExit] = useState<1 | -1 | null>(null);

  // Data state
  const [years, setYears] = useState<AwardYearSummary[]>([]);
  const [yearLeads, setYearLeads] = useState<Map<number, string | null>>(
    () => new Map()
  );
  const [categories, setCategories] = useState<AwardCategoryWithWinner[]>([]);
  const [templates, setTemplates] = useState<AwardTemplate[]>([]);
  const [mostAwarded, setMostAwarded] = useState<MostAwardedEntry[]>([]);
  // Every name credited so far, for the picker's and inspector's suggestions.
  const [creditedPeople, setCreditedPeople] = useState<string[]>([]);

  const adultMediaEnabled = useAdultMediaEnabled();

  // Award detail state
  const [selectedTemplate, setSelectedTemplate] = useState<AwardTemplate | null>(null);
  const [templateHistory, setTemplateHistory] = useState<TemplateWinnerHistory[]>([]);

  // Incremented after every mutation that invalidates a view's per-template /
  // per-year caches (winner changes, deletes, retags, new years).
  const [mutationVersion, setMutationVersion] = useState(0);

  // Every award mutation bumps the views' cache version and drops Review's
  // cached "Award Night" (its staleTime is infinite, so it never refetches on
  // its own).
  const noteAwardsChanged = () => {
    setMutationVersion((version) => version + 1);
    void invalidateMediaQueries(mediaQueryKeys.review);
  };

  // Modals
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<AwardCategoryWithWinner | null>(null);
  const [yearToDelete, setYearToDelete] = useState<AwardYearSummary | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<AwardTemplate | null>(null);
  // Loaded when the delete dialog opens so the confirmation can name exactly
  // how many years and winners the cascade will remove.
  const [templateImpact, setTemplateImpact] = useState<TemplateDeletionImpact | null>(null);
  const [createYearOpen, setCreateYearOpen] = useState(false);

  // Visible error message for award/year mutation failures.
  const [awardError, setAwardError] = useState<string | null>(null);

  const { scrollToTop } = useMainScrollContainer();

  // Guards against a slow year fetch landing after the user has moved on.
  const categoryLoadRef = useRef(0);

  const loadYears = async () => {
    const [yearRows, leads] = await Promise.all([
      awardsLogic.getAwardYears(),
      awardsLogic.getAwardYearLeads(),
    ]);
    setYears(yearRows);
    setYearLeads(leads);
  };

  const loadTemplates = () => awardsLogic.getAllTemplates().then(setTemplates);

  const loadMostAwarded = () =>
    awardsLogic.getMostAwardedEntries().then(setMostAwarded);

  const loadCreditedPeople = () =>
    awardsLogic
      .getCreditedPeople()
      .then(setCreditedPeople)
      .catch(() => {
        // Suggestions are advisory; the name fields still work without them.
      });

  const loadCategories = async (year: number) => {
    const token = ++categoryLoadRef.current;
    const data = await awardsLogic.getAwardsForYear(year);
    if (token === categoryLoadRef.current) setCategories(data);
  };

  const loadTemplateDetail = async (templateId: number) => {
    const template = await awardsLogic.getTemplateById(templateId);
    if (!template) {
      setSelectedTemplate(null);
      setTemplateHistory([]);
      setView("main");
      return;
    }
    const history = await awardsLogic.getTemplateHistory(templateId);
    setSelectedTemplate(template);
    setTemplateHistory(history);
  };

  useEffect(() => {
    void loadYears();
    void loadTemplates();
  }, []);

  useEffect(() => {
    void loadMostAwarded();
    void loadCreditedPeople();
  }, [adultMediaEnabled]);

  // Auto-dismiss the error toast after a few seconds.
  useEffect(() => {
    if (!awardError) return;
    const timer = window.setTimeout(() => setAwardError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [awardError]);

  // Categories grouped by media type. `categories` arrives sorted by
  // sort_order, so first-seen order is the stored group order — a group sits
  // wherever its earliest category does, and the reorder modal edits both
  // levels back into the same flat sequence.
  const categoryGroups = useMemo<[string, AwardCategoryWithWinner[]][]>(() => {
    const byType = new Map<string, AwardCategoryWithWinner[]>();
    for (const category of categories) {
      const key = category.entry_type ?? GENERAL_GROUP;
      const group = byType.get(key);
      if (group) group.push(category);
      else byType.set(key, [category]);
    }
    return [...byType.entries()];
  }, [categories]);

  // A filter pointing at a group that no longer exists (e.g. its last award
  // was retagged) falls back to All instead of showing a blank list.
  const activeTypeFilter =
    typeFilter !== null && categoryGroups.some(([key]) => key === typeFilter)
      ? typeFilter
      : null;

  const visibleGroups = useMemo<[string, AwardCategoryWithWinner[]][]>(
    () =>
      activeTypeFilter === null
        ? categoryGroups
        : categoryGroups.filter(([key]) => key === activeTypeFilter),
    [categoryGroups, activeTypeFilter]
  );

  // Memoized so an unrelated re-render doesn't hand the open modal a fresh
  // array and reset an in-progress drag.
  const reorderGroups = useMemo<AwardReorderGroup[]>(
    () =>
      categoryGroups.map(([key, group]) => ({
        key,
        items: group.map((category) => ({
          id: category.id,
          name: category.name,
          subtitle: category.winner
            ? `Winner: ${withCreditedPerson(category.winner.name, category.credited_person)}`
            : "No winner yet",
          imageUrl: category.winner?.image_url ?? undefined,
        })),
      })),
    [categoryGroups]
  );

  const goBackToMain = () => {
    // Abandon any year swap still in flight so its timer can't reopen a year.
    categoryLoadRef.current += 1;
    setYearExit(null);
    setView("main");
    setInitialTemplateId(null);
    setTypeFilter(null);
    void loadYears();
    void loadTemplates();
    void loadMostAwarded();
    scrollToTop();
  };

  const handleOpenMostAwarded = () => {
    categoryLoadRef.current += 1;
    setYearExit(null);
    setInitialTemplateId(null);
    setTypeFilter(null);
    setView("most-awarded");
    void loadMostAwarded();
    scrollToTop();
  };

  const handleYearSelect = (year: number, templateId: number | null = null) => {
    // Clicking the year already on screen (a history cover for the current
    // year) must not clear and reload the list it is already showing.
    if (view === "year" && selectedYear === year) {
      if (templateId !== null) setInitialTemplateId(templateId);
      return;
    }

    // A year change is a page turn, not a reload. The outgoing year plays a
    // short exit while the next year's rows are fetched, then year, data and
    // view swap in one commit so the keyed view mounts straight onto real
    // content and slides in from the side that year sits on — a later year
    // from the right, an earlier one from the left.
    const direction: 1 | -1 =
      view === "year" && selectedYear !== null && year < selectedYear ? -1 : 1;
    const leavingCurrent = view === "year" && selectedYear !== null;
    setYearDirection(direction);
    if (leavingCurrent) setYearExit(direction);

    const startedAt = performance.now();
    const token = ++categoryLoadRef.current;
    void awardsLogic
      .getAwardsForYear(year)
      .then((data) => {
        if (token !== categoryLoadRef.current) return;
        const swap = () => {
          if (token !== categoryLoadRef.current) return;
          setCategories(data);
          setSelectedYear(year);
          setInitialTemplateId(templateId);
          setTypeFilter(null);
          setView("year");
          setYearExit(null);
          scrollToTop();
        };
        if (!leavingCurrent) {
          swap();
          return;
        }
        const remaining = Math.max(0, 150 - (performance.now() - startedAt));
        window.setTimeout(swap, remaining);
      })
      .catch((error) => {
        if (token !== categoryLoadRef.current) return;
        setYearExit(null);
        setAwardError(error instanceof Error ? error.message : String(error));
      });
  };

  const handleTemplateSelect = (templateId: number) => {
    setView("category");
    setSelectedTemplate(null);
    setTemplateHistory([]);
    scrollToTop();
    void loadTemplateDetail(templateId).catch((error) => {
      setAwardError(error instanceof Error ? error.message : String(error));
      setView("main");
    });
  };

  const handleCreateYear = async (year: number, copyFromYear: number | null) => {
    // A creation failure rejects into the modal, which shows its own error.
    await awardsLogic.createNewYear(year, copyFromYear);
    setCreateYearOpen(false);
    setAwardError(null);
    noteAwardsChanged();
    try {
      await Promise.all([loadYears(), loadTemplates(), loadCategories(year)]);
      setSelectedYear(year);
      setInitialTemplateId(null);
      setTypeFilter(null);
      setView("year");
      scrollToTop();
    } catch (error) {
      setAwardError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleCreateNewCategory = async (
    name: string,
    entryType: string | null,
    creditsPerson: boolean
  ) => {
    if (!selectedYear) return;
    try {
      await awardsLogic.createCategory(name, selectedYear, entryType, creditsPerson);
      // Reset the filter so the new row is visible wherever it lands.
      setTypeFilter(null);
      noteAwardsChanged();
      await loadCategories(selectedYear);
      await loadTemplates();
      setAwardError(null);
    } catch (error) {
      setAwardError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleUseExistingCategory = async (templateId: number) => {
    if (!selectedYear) return;
    try {
      await awardsLogic.createCategoryFromTemplate(templateId, selectedYear);
      setTypeFilter(null);
      noteAwardsChanged();
      await loadCategories(selectedYear);
      setAwardError(null);
    } catch (error) {
      setAwardError(error instanceof Error ? error.message : String(error));
    }
  };

  // Retag an award's media type from the award detail view. The tag lives on
  // the template, so it applies to every year the award appears in.
  const handleTemplateTypeChange = async (entryType: string | null) => {
    if (!selectedTemplate) return;
    try {
      await awardsLogic.updateTemplateType(selectedTemplate.id, entryType);
      noteAwardsChanged();
      await Promise.all([loadTemplateDetail(selectedTemplate.id), loadTemplates()]);
      setAwardError(null);
    } catch (error) {
      setAwardError(error instanceof Error ? error.message : String(error));
    }
  };

  const openPickerFor = (award: PickerSource) => {
    setPickerTarget({
      categoryId: award.categoryId,
      year: award.year,
      entryType: award.entryType,
      creditsPerson: award.creditsPerson,
      current: award.winner
        ? { mediaId: award.winner.id, name: award.creditedPerson }
        : null,
    });
  };

  const handleWinnerSelect = async (mediaId: number, creditedPerson?: string | null) => {
    if (!pickerTarget) return;
    const target = pickerTarget;
    try {
      // Replacing the winner row means a new winner never inherits a name; an
      // award that doesn't credit a person stores none.
      await awardsLogic.setWinner(
        target.categoryId,
        mediaId,
        target.creditsPerson ? creditedPerson ?? null : null
      );
      setPickerTarget(null);
      noteAwardsChanged();
      void loadMostAwarded();
      if (target.creditsPerson) void loadCreditedPeople();
      if (view === "year" && selectedYear === target.year) {
        await loadCategories(target.year);
      }
      if (view === "category" && selectedTemplate) {
        await loadTemplateDetail(selectedTemplate.id);
      }
    } catch (error) {
      setPickerTarget(null);
      setAwardError(error instanceof Error ? error.message : String(error));
    }
  };

  // Inline name edits from the inspector. Rejects on failure so the editor
  // stays open with the typed name; the toast carries the message.
  const handleCreditedPersonSave = async (categoryId: number, name: string | null) => {
    try {
      await awardsLogic.setCreditedPerson(categoryId, name);
    } catch (error) {
      setAwardError(error instanceof Error ? error.message : String(error));
      throw error;
    }
    setAwardError(null);
    noteAwardsChanged();
    void loadMostAwarded();
    void loadCreditedPeople();
    try {
      if (view === "year" && selectedYear !== null) await loadCategories(selectedYear);
      if (view === "category" && selectedTemplate) await loadTemplateDetail(selectedTemplate.id);
    } catch (error) {
      setAwardError(error instanceof Error ? error.message : String(error));
    }
  };

  // The "Credit a person" switch lives on the template, so it flips the award
  // in every year. Turning it off hides names; turning it on brings them back.
  const handleCreditsPersonChange = async (templateId: number, enabled: boolean) => {
    try {
      await awardsLogic.updateTemplateCreditsPerson(templateId, enabled);
      noteAwardsChanged();
      const reloads: Promise<unknown>[] = [loadTemplates(), loadMostAwarded()];
      if (view === "year" && selectedYear !== null) reloads.push(loadCategories(selectedYear));
      if (view === "category" && selectedTemplate) {
        reloads.push(loadTemplateDetail(selectedTemplate.id));
      }
      await Promise.all(reloads);
      setAwardError(null);
    } catch (error) {
      setAwardError(error instanceof Error ? error.message : String(error));
    }
  };

  // The modal edits grouped sections, then flattens back to one sort_order
  // sequence (group order = each group's earliest member).
  const handleReorderSave = async (groups: AwardReorderGroup[]) => {
    if (!selectedYear) return;
    const ids = groups.flatMap((group) => group.items.map((item) => item.id));
    await awardsLogic.updateCategoryOrder(selectedYear, ids);
    // Review's "Award Night" lists awards in this order.
    void invalidateMediaQueries(mediaQueryKeys.review);
    const byId = new Map(categories.map((category) => [category.id, category]));
    setCategories(
      ids
        .map((id) => byId.get(id))
        .filter((category): category is AwardCategoryWithWinner => !!category)
    );
    setReorderOpen(false);
  };

  const confirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    const target = categoryToDelete;
    try {
      await awardsLogic.deleteCategory(target.id);
      setCategoryToDelete(null);
      noteAwardsChanged();
      await Promise.all([loadYears(), loadTemplates(), loadMostAwarded()]);
      if (selectedYear) await loadCategories(selectedYear);
    } catch (error) {
      setCategoryToDelete(null);
      setAwardError(error instanceof Error ? error.message : String(error));
    }
  };

  const confirmDeleteYear = async () => {
    if (!yearToDelete) return;
    const target = yearToDelete;
    try {
      await awardsLogic.deleteYear(target.year);
      setYearToDelete(null);
      noteAwardsChanged();
      await Promise.all([loadYears(), loadTemplates()]);
    } catch (error) {
      setYearToDelete(null);
      setAwardError(error instanceof Error ? error.message : String(error));
    }
  };

  const openDeleteTemplate = async (template: AwardTemplate) => {
    setTemplateImpact(null);
    setTemplateToDelete(template);
    try {
      setTemplateImpact(await awardsLogic.getTemplateDeletionImpact(template.id));
    } catch {
      // Counts are advisory — the dialog falls back to generic wording.
    }
  };

  const confirmDeleteTemplate = async () => {
    if (!templateToDelete) return;
    const target = templateToDelete;

    try {
      await awardsLogic.deleteTemplate(target.id);
    } catch (error) {
      setTemplateToDelete(null);
      setTemplateImpact(null);
      setAwardError(error instanceof Error ? error.message : String(error));
      return;
    }

    setTemplateToDelete(null);
    setTemplateImpact(null);
    noteAwardsChanged();
    // Removing an award changes year category/winner counts too.
    try {
      await Promise.all([loadYears(), loadTemplates(), loadMostAwarded()]);
    } catch (error) {
      setAwardError(error instanceof Error ? error.message : String(error));
    }

    // The detail view for this award no longer has anything to show.
    if (view === "category" && selectedTemplate?.id === target.id) {
      setSelectedTemplate(null);
      setTemplateHistory([]);
      setView("main");
    }
  };

  const describeTemplateImpact = (impact: TemplateDeletionImpact | null): string => {
    if (!impact) return "Checking where this award is used…";
    if (impact.years === 0) return "This award isn't used in any year yet.";

    const yearsLabel = `${impact.years} year${impact.years !== 1 ? "s" : ""}`;
    if (impact.winners === 0) {
      return `Removes it from ${yearsLabel}. No winners were recorded.`;
    }
    const winnersLabel = `${impact.winners} recorded winner${impact.winners !== 1 ? "s" : ""}`;
    return `Removes it from ${yearsLabel} and clears ${winnersLabel}.`;
  };

  // Shared by the home grid and the award detail view, which delete from
  // different places but ask the same question.
  const templateDeleteDialog = (
    <ConfirmDialog
      isOpen={templateToDelete !== null}
      onClose={() => {
        setTemplateToDelete(null);
        setTemplateImpact(null);
      }}
      onConfirm={confirmDeleteTemplate}
      title="Delete Award"
      subject={templateToDelete?.name}
      confirmLabel="Delete Award"
      detail={describeTemplateImpact(templateImpact)}
    >
      This removes the award from every year it appears in.
    </ConfirmDialog>
  );

  const pickerEntryType = pickerTarget?.entryType ?? null;

  return (
    <>
      <AwardErrorToast message={awardError} onDismiss={() => setAwardError(null)} />

      {view === "year" && selectedYear !== null ? (
        <AwardYearView
          key={selectedYear}
          year={selectedYear}
          direction={yearDirection}
          years={years}
          categories={categories}
          groups={categoryGroups}
          visibleGroups={visibleGroups}
          typeFilter={activeTypeFilter}
          initialTemplateId={initialTemplateId}
          historyVersion={mutationVersion}
          leaving={yearExit}
          onTypeFilterChange={setTypeFilter}
          onSelectYear={(year) => handleYearSelect(year)}
          onYearSelectWithTemplate={(year, templateId) => handleYearSelect(year, templateId)}
          onOpenPicker={(category) =>
            openPickerFor({
              categoryId: category.id,
              year: category.year,
              entryType: category.entry_type,
              creditsPerson: category.credits_person === 1,
              winner: category.winner,
              creditedPerson: category.credited_person,
            })
          }
          onDeleteCategory={setCategoryToDelete}
          onAddAward={() => setCategoryPickerOpen(true)}
          onReorder={() => setReorderOpen(true)}
          onBack={goBackToMain}
          creditSuggestions={creditedPeople}
          onSaveCreditedPerson={handleCreditedPersonSave}
          onToggleCreditsPerson={(templateId, enabled) =>
            void handleCreditsPersonChange(templateId, enabled)
          }
        />
      ) : view === "category" ? (
        selectedTemplate ? (
          <AwardDetailView
            key={selectedTemplate.id}
            template={selectedTemplate}
            history={templateHistory}
            version={mutationVersion}
            onBack={goBackToMain}
            onTypeChange={(type) => void handleTemplateTypeChange(type)}
            onDeleteTemplate={() => void openDeleteTemplate(selectedTemplate)}
            onOpenYear={handleYearSelect}
            onChangeWinner={openPickerFor}
            creditSuggestions={creditedPeople}
            onSaveCreditedPerson={handleCreditedPersonSave}
            onToggleCreditsPerson={(templateId, enabled) =>
              void handleCreditsPersonChange(templateId, enabled)
            }
          />
        ) : (
          <div className="min-h-[40vh]" />
        )
      ) : view === "most-awarded" ? (
        <AwardMostAwardedView
          entries={mostAwarded}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          onOpenYear={(year, templateId) => handleYearSelect(year, templateId)}
          onBack={goBackToMain}
        />
      ) : (
        <AwardHomeView
          years={years}
          templates={templates}
          yearLeads={yearLeads}
          mostAwarded={mostAwarded}
          onOpenYear={(year) => handleYearSelect(year)}
          onOpenTemplate={handleTemplateSelect}
          onOpenMostAwarded={handleOpenMostAwarded}
          onCreateYear={() => setCreateYearOpen(true)}
          onDeleteYear={setYearToDelete}
          onDeleteTemplate={(template) => void openDeleteTemplate(template)}
        />
      )}

      <WinnerPicker
        isOpen={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        onSelect={handleWinnerSelect}
        year={pickerTarget?.year}
        title={pickerEntryType ? `Select ${pickerEntryType} Winner` : undefined}
        entryFilter={
          pickerEntryType ? (entry) => entry.entry_type === pickerEntryType : undefined
        }
        personCredit={
          pickerTarget?.creditsPerson
            ? { current: pickerTarget.current, suggestions: creditedPeople }
            : undefined
        }
      />

      <AwardReorderModal
        isOpen={reorderOpen}
        onClose={() => setReorderOpen(false)}
        groups={reorderGroups}
        onSave={handleReorderSave}
        title={`Reorder ${selectedYear} Awards`}
      />

      <CategoryPicker
        isOpen={categoryPickerOpen}
        onClose={() => setCategoryPickerOpen(false)}
        onSelectExisting={handleUseExistingCategory}
        onCreateNew={handleCreateNewCategory}
        year={selectedYear ?? new Date().getFullYear()}
      />

      <CreateAwardYearModal
        isOpen={createYearOpen}
        years={years}
        onClose={() => setCreateYearOpen(false)}
        onSubmit={handleCreateYear}
      />

      <ConfirmDialog
        isOpen={categoryToDelete !== null}
        onClose={() => setCategoryToDelete(null)}
        onConfirm={confirmDeleteCategory}
        title={`Remove Award from ${selectedYear}`}
        subject={categoryToDelete?.name}
        confirmLabel="Remove"
        detail="Any winner selected here will be cleared."
      >
        The award itself stays in your library and in any other years.
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={yearToDelete !== null}
        onClose={() => setYearToDelete(null)}
        onConfirm={confirmDeleteYear}
        title="Delete Award Year"
        subject={yearToDelete ? String(yearToDelete.year) : undefined}
        confirmLabel="Delete Year"
      >
        Only the empty year shell will be removed. Award templates and other years will stay intact.
      </ConfirmDialog>

      {templateDeleteDialog}
    </>
  );
}
