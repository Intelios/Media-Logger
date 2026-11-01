import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import {
  awardsLogic,
  GENERAL_GROUP,
  type AwardCategoryWithWinner,
  type AwardTemplate,
  type AwardYearSummary,
  type TemplateDeletionImpact,
  type TemplateWinnerHistory,
} from "../lib/awards-logic";
import { WinnerPicker } from "../components/WinnerPicker";
import { CreateAwardYearModal } from "../components/awards/CreateAwardYearModal";
import { CategoryPicker } from "../components/CategoryPicker";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { AwardReorderModal, type AwardReorderGroup } from "../components/awards/AwardReorderModal";
import { AwardHomeView } from "../components/awards/AwardHomeView";
import { AwardYearView } from "../components/awards/AwardYearView";
import { AwardDetailView } from "../components/awards/AwardDetailView";
import { useMainScrollContainer } from "../lib/scroll-container";

// Toast for award/year mutation failures. Rendered by the controller so an
// error is never raised into a view that has nowhere to show it.
function AwardErrorToast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[80] flex items-start gap-3 max-w-sm bg-[#2a1a1a] border border-red-500/40 rounded-xl p-4 shadow-2xl">
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

type ViewType = "main" | "year" | "category";

interface PickerTarget {
  categoryId: number;
  year: number;
  entryType: string | null;
}

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

  // Data state
  const [years, setYears] = useState<AwardYearSummary[]>([]);
  const [yearCovers, setYearCovers] = useState<Map<number, (string | null)[]>>(
    () => new Map()
  );
  const [categories, setCategories] = useState<AwardCategoryWithWinner[]>([]);
  const [templates, setTemplates] = useState<AwardTemplate[]>([]);

  // Award detail state
  const [selectedTemplate, setSelectedTemplate] = useState<AwardTemplate | null>(null);
  const [templateHistory, setTemplateHistory] = useState<TemplateWinnerHistory[]>([]);

  // Incremented after every mutation that invalidates a view's per-template /
  // per-year caches (winner changes, deletes, retags, new years).
  const [mutationVersion, setMutationVersion] = useState(0);

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
    const [yearRows, covers] = await Promise.all([
      awardsLogic.getAwardYears(),
      awardsLogic.getAwardYearCovers(),
    ]);
    setYears(yearRows);
    setYearCovers(covers);
  };

  const loadTemplates = () => awardsLogic.getAllTemplates().then(setTemplates);

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
          subtitle: category.winner ? `Winner: ${category.winner.name}` : "No winner yet",
          imageUrl: category.winner?.image_url ?? undefined,
        })),
      })),
    [categoryGroups]
  );

  const goBackToMain = () => {
    setView("main");
    setInitialTemplateId(null);
    setTypeFilter(null);
    void loadYears();
    void loadTemplates();
    scrollToTop();
  };

  const handleYearSelect = (year: number, templateId: number | null = null) => {
    // Clicking the year already on screen (a history cover for the current
    // year) must not clear and reload the list it is already showing.
    if (view === "year" && selectedYear === year) {
      if (templateId !== null) setInitialTemplateId(templateId);
      return;
    }
    setSelectedYear(year);
    setInitialTemplateId(templateId);
    setCategories([]);
    setTypeFilter(null);
    void loadCategories(year);
    setView("year");
    scrollToTop();
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
    setMutationVersion((version) => version + 1);
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

  const handleCreateNewCategory = async (name: string, entryType: string | null) => {
    if (!selectedYear) return;
    try {
      await awardsLogic.createCategory(name, selectedYear, entryType);
      // Reset the filter so the new row is visible wherever it lands.
      setTypeFilter(null);
      setMutationVersion((version) => version + 1);
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
      setMutationVersion((version) => version + 1);
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
      setMutationVersion((version) => version + 1);
      await Promise.all([loadTemplateDetail(selectedTemplate.id), loadTemplates()]);
      setAwardError(null);
    } catch (error) {
      setAwardError(error instanceof Error ? error.message : String(error));
    }
  };

  const openPickerFor = (categoryId: number, year: number, entryType: string | null) => {
    setPickerTarget({ categoryId, year, entryType });
  };

  const handleWinnerSelect = async (mediaId: number) => {
    if (!pickerTarget) return;
    const target = pickerTarget;
    try {
      await awardsLogic.setWinner(target.categoryId, mediaId);
      setPickerTarget(null);
      setMutationVersion((version) => version + 1);
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

  // The modal edits grouped sections, then flattens back to one sort_order
  // sequence (group order = each group's earliest member).
  const handleReorderSave = async (groups: AwardReorderGroup[]) => {
    if (!selectedYear) return;
    const ids = groups.flatMap((group) => group.items.map((item) => item.id));
    await awardsLogic.updateCategoryOrder(selectedYear, ids);
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
      setMutationVersion((version) => version + 1);
      await Promise.all([loadYears(), loadTemplates()]);
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
      setMutationVersion((version) => version + 1);
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
    setMutationVersion((version) => version + 1);
    // Removing an award changes year category/winner counts too.
    try {
      await Promise.all([loadYears(), loadTemplates()]);
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
      confirmLabel="Delete Award"
      detail={describeTemplateImpact(templateImpact)}
    >
      Are you sure you want to delete{" "}
      <span className="font-semibold text-white">"{templateToDelete?.name}"</span>?{" "}
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
          years={years}
          categories={categories}
          groups={categoryGroups}
          visibleGroups={visibleGroups}
          typeFilter={activeTypeFilter}
          initialTemplateId={initialTemplateId}
          historyVersion={mutationVersion}
          onTypeFilterChange={setTypeFilter}
          onSelectYear={(year) => handleYearSelect(year)}
          onYearSelectWithTemplate={(year, templateId) => handleYearSelect(year, templateId)}
          onOpenPicker={(category) =>
            openPickerFor(category.id, category.year, category.entry_type)
          }
          onDeleteCategory={setCategoryToDelete}
          onAddAward={() => setCategoryPickerOpen(true)}
          onReorder={() => setReorderOpen(true)}
          onBack={goBackToMain}
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
            onChangeWinner={(categoryId, year, entryType) =>
              openPickerFor(categoryId, year, entryType)
            }
          />
        ) : (
          <div className="min-h-[40vh]" />
        )
      ) : (
        <AwardHomeView
          years={years}
          templates={templates}
          yearCovers={yearCovers}
          onOpenYear={(year) => handleYearSelect(year)}
          onOpenTemplate={handleTemplateSelect}
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
        confirmLabel="Remove"
        detail="The award itself stays in your library and in any other years. Any winner selected here will be cleared."
      >
        Remove <span className="font-semibold text-white">"{categoryToDelete?.name}"</span> from{" "}
        {selectedYear}?
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={yearToDelete !== null}
        onClose={() => setYearToDelete(null)}
        onConfirm={confirmDeleteYear}
        title="Delete Award Year"
        confirmLabel="Delete Year"
        detail="Only the empty year shell will be removed. Award templates and other years will stay intact."
      >
        Are you sure you want to delete{" "}
        <span className="font-semibold text-white">{yearToDelete?.year}</span>?
      </ConfirmDialog>

      {templateDeleteDialog}
    </>
  );
}
