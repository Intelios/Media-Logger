import { useEffect, useState } from "react";
import { Award, ChevronLeft, Plus, Trash2, Trophy, ArrowUpDown, Sparkles, History, Star, Calendar, AlertCircle, X } from "lucide-react";
import { awardsLogic, type AwardYearSummary, type AwardCategory, type AwardTemplate, type TemplateWinnerHistory, type TemplateDeletionImpact } from "../lib/awards-logic";
import { MediaCard } from "../components/MediaCard";
import { formatCardRating, getRatingColor, getTypeBadgeStyle, parseGenres } from "../lib/media-config";
import { WinnerPicker } from "../components/WinnerPicker";
import { InputModal } from "../components/InputModal";
import { ReorderModal, type ReorderItem } from "../components/ReorderModal";
import { CategoryPicker } from "../components/CategoryPicker";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { MediaEntry } from "../lib/db";
import { cn } from "../lib/utils_ui";
import { formatDate } from "../lib/dates";
import { CoverImage } from "../components/CoverImage";

// Small helper component for loading images asynchronously (required for Tauri)
function WinnerThumbnail({ entry }: { entry: MediaEntry }) {
  return (
    <div className="w-16 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
      <CoverImage
        path={entry.image_url}
        alt={entry.name}
        variant="small"
        containerClassName="h-full w-full"
        imageClassName="h-full w-full object-cover"
      />
    </div>
  );
}

// Full-size cover image for award winner cards
function WinnerCoverImage({ entry }: { entry: MediaEntry }) {
  return (
    <CoverImage
      path={entry.image_url}
      alt={entry.name}
      variant="card"
      sizes="(min-width: 1280px) 18vw, 28vw"
      containerClassName="h-full w-full"
      imageClassName="h-full w-full object-cover"
    />
  );
}

// Toast for award/year mutation failures. Rendered by every view so an error
// is never raised into a view that has nowhere to show it.
function AwardErrorToast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[80] flex items-start gap-3 max-w-sm bg-[#2a1a1a] border border-red-500/40 rounded-xl p-4 shadow-2xl">
      <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-red-200 flex-1">{message}</p>
      <button
        onClick={onDismiss}
        className="p-1 hover:bg-white/10 rounded-full transition-colors flex-shrink-0"
        aria-label="Dismiss error"
      >
        <X size={14} className="text-red-300" />
      </button>
    </div>
  );
}

// Helper type for reorder modal
type CategoryWithWinner = AwardCategory & { winner: MediaEntry | null };
type ReorderableCategory = ReorderItem & CategoryWithWinner;

type ViewType = "main" | "year" | "category";

export default function AwardsPage() {
  const [view, setView] = useState<ViewType>("main");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // Data State
  const [years, setYears] = useState<AwardYearSummary[]>([]);
  const [categories, setCategories] = useState<CategoryWithWinner[]>([]);
  const [templates, setTemplates] = useState<AwardTemplate[]>([]);

  // Category view state
  const [selectedTemplate, setSelectedTemplate] = useState<AwardTemplate | null>(null);
  const [templateHistory, setTemplateHistory] = useState<TemplateWinnerHistory[]>([]);

  // Modal States
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryWithWinner | null>(null);
  const [yearToDelete, setYearToDelete] = useState<AwardYearSummary | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<AwardTemplate | null>(null);
  // Loaded when the delete dialog opens so the confirmation can name exactly
  // how many years and winners the cascade will remove.
  const [templateImpact, setTemplateImpact] = useState<TemplateDeletionImpact | null>(null);

  // New Input Modal State
  const [inputModalOpen, setInputModalOpen] = useState(false);

  // Visible error message for award/year creation failures (e.g. duplicate
  // template in the same year, invalid year input).
  const [awardError, setAwardError] = useState<string | null>(null);

  // Load Years and Templates on Mount
  useEffect(() => {
    loadYears();
    loadTemplates();
  }, []);

  // Auto-dismiss award error banner after a few seconds
  useEffect(() => {
    if (!awardError) return;
    const t = window.setTimeout(() => setAwardError(null), 5000);
    return () => window.clearTimeout(t);
  }, [awardError]);

  const loadYears = () => awardsLogic.getAwardYears().then(setYears);
  const loadTemplates = () => awardsLogic.getAllTemplates().then(setTemplates);

  const loadCategories = async (year: number) => {
    const data = await awardsLogic.getAwardsForYear(year);
    setCategories(data);
  };

  const loadTemplateDetail = async (templateId: number) => {
    const template = await awardsLogic.getTemplateById(templateId);
    const history = await awardsLogic.getTemplateHistory(templateId);
    setSelectedTemplate(template);
    setTemplateHistory(history);
  };

  const handleYearSelect = (year: number) => {
    setSelectedYear(year);
    setCategories([]);
    loadCategories(year);
    setView("year");
  };

  const handleTemplateSelect = (templateId: number) => {
    loadTemplateDetail(templateId);
    setView("category");
  };

  const openCreateYearModal = () => {
    setInputModalOpen(true);
  };

  const validateYearInput = (value: string): string | null => {
    if (!/^\d{4}$/.test(value)) {
      return "Enter a 4-digit year (e.g. 2026).";
    }
    const y = Number(value);
    if (y < 1900 || y > 9999) {
      return "Enter a year between 1900 and 9999.";
    }
    if (years.some(existing => existing.year === y)) {
      return `${y} already has an award year.`;
    }
    return null;
  };

  const handleYearInputSubmit = async (value: string) => {
    const y = Number(value);
    try {
      await awardsLogic.createYear(y);
      await loadYears();
      handleYearSelect(y);
    } catch (error) {
      setAwardError(error instanceof Error ? error.message : String(error));
    }
  };

  // Category creation handlers
  const handleCreateNewCategory = async (name: string) => {
    if (selectedYear) {
      try {
        await awardsLogic.createCategory(name, selectedYear);
        loadCategories(selectedYear);
        loadTemplates(); // Refresh templates since a new one was created
        setAwardError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setAwardError(message);
      }
    }
  };

  const handleUseExistingCategory = async (templateId: number) => {
    if (selectedYear) {
      try {
        await awardsLogic.createCategoryFromTemplate(templateId, selectedYear);
        loadCategories(selectedYear);
        setAwardError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setAwardError(message);
      }
    }
  };

  const confirmDeleteCategory = async () => {
    if (!categoryToDelete) return;

    await awardsLogic.deleteCategory(categoryToDelete.id);
    if (selectedYear) await loadCategories(selectedYear);
    setCategoryToDelete(null);
  };

  const confirmDeleteYear = async () => {
    if (!yearToDelete) return;

    await awardsLogic.deleteYear(yearToDelete.year);
    await loadYears();
    setYearToDelete(null);
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

    try {
      await awardsLogic.deleteTemplate(templateToDelete.id);
    } catch (error) {
      setAwardError(error instanceof Error ? error.message : String(error));
      setTemplateToDelete(null);
      return;
    }

    setTemplateToDelete(null);
    setTemplateImpact(null);
    // Removing an award changes year category/winner counts too.
    await Promise.all([loadYears(), loadTemplates()]);
    // The detail view for this award no longer has anything to show.
    if (view === "category" && selectedTemplate?.id === templateToDelete.id) {
      setSelectedTemplate(null);
      setTemplateHistory([]);
      setView("main");
    }
  };

  const openPicker = (catId: number) => {
    setActiveCategoryId(catId);
    setPickerOpen(true);
  };

  const handleWinnerSelect = async (mediaId: number) => {
    if (activeCategoryId && selectedYear) {
      await awardsLogic.setWinner(activeCategoryId, mediaId);
      loadCategories(selectedYear);
      setPickerOpen(false);
    }
  };

  // Reorder handlers
  const handleReorderSave = async (newOrder: ReorderableCategory[]) => {
    if (selectedYear) {
      const ids = newOrder.map(c => c.id);
      await awardsLogic.updateCategoryOrder(selectedYear, ids);
      setCategories(newOrder);
      setReorderOpen(false);
    }
  };

  const categoriesToReorderItems = (cats: CategoryWithWinner[]): ReorderableCategory[] => {
    return cats.map(cat => ({
      ...cat,
      subtitle: cat.winner ? `Winner: ${cat.winner.name}` : "No winner yet",
      imageUrl: cat.winner?.image_url ?? undefined,
    }));
  };

  const goBackToMain = () => {
    setView("main");
    loadYears();
    loadTemplates();
  };

  const describeTemplateImpact = (impact: TemplateDeletionImpact | null): string => {
    if (!impact) return "Checking where this award is used…";
    if (impact.years === 0) return "This award isn't used in any year yet.";

    const years = `${impact.years} year${impact.years !== 1 ? "s" : ""}`;
    if (impact.winners === 0) {
      return `Removes it from ${years}. No winners were recorded.`;
    }
    const winners = `${impact.winners} recorded winner${impact.winners !== 1 ? "s" : ""}`;
    return `Removes it from ${years} and clears ${winners}.`;
  };

  // Shared by the main grid and the award detail view, which delete from
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
      Are you sure you want to delete <span className="font-semibold text-white">"{templateToDelete?.name}"</span>?
      {" "}This removes the award from every year it appears in.
    </ConfirmDialog>
  );

  // --- VIEW 0: MAIN (Browse by Year + Browse by Category) ---
  if (view === "main") {
    return (
      <div className="space-y-10 max-w-6xl mx-auto">
        <AwardErrorToast message={awardError} onDismiss={() => setAwardError(null)} />
        <header className="award-header-enter">
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-amber-600 inline-flex items-center gap-3">
            <Trophy className="text-yellow-500" />
            Awards
          </h2>
          <p className="text-gray-400">Celebrate your favorites with yearly awards.</p>
        </header>

        {/* Browse by Year Section */}
        <section>
          <h3 className="text-lg font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Sparkles size={18} className="text-amber-400" />
            Browse by Year
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {/* Create New Year Card */}
            <button
              onClick={openCreateYearModal}
              className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed border-white/10 hover:border-amber-500/50 hover:bg-gradient-to-br hover:from-amber-500/5 hover:to-yellow-500/5 transition-all group min-h-[140px]"
            >
              <div className="p-3 rounded-full bg-gradient-to-br from-amber-500/20 to-yellow-600/20 group-hover:scale-110 transition-all">
                <Plus size={24} className="text-amber-400" />
              </div>
              <span className="font-semibold text-gray-400 group-hover:text-amber-300 text-sm">New Year</span>
            </button>

            {/* Year Cards */}
            {years.map((y, index) => (
              <div
                key={y.year}
                className="relative group min-h-[140px] award-card-enter"
                style={{ animationDelay: `${Math.min(index * 60, 300)}ms` }}
              >
                <button
                  onClick={() => handleYearSelect(y.year)}
                  className="relative h-full w-full bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-2xl p-5 text-left hover:border-amber-500/50 transition-all hover:shadow-xl hover:shadow-amber-500/10 overflow-hidden min-h-[140px]"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/0 to-yellow-500/0 group-hover:from-amber-500/5 group-hover:to-yellow-500/10 transition-all duration-500" />
                  <div className="relative z-10">
                    <h3 className="text-3xl font-black text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-amber-300 group-hover:to-yellow-500 transition-all">
                      {y.year}
                    </h3>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Awards</span>
                        <span className="font-mono">{y.categories}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Winners</span>
                        <span className="font-mono text-amber-400">{y.winners}</span>
                      </div>
                    </div>
                    <div className="h-1 w-full bg-white/5 rounded-full mt-3 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full transition-all"
                        style={{ width: `${y.categories > 0 ? (y.winners / y.categories) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </button>
                {y.categories === 0 && y.winners === 0 && (
                  <button
                    type="button"
                    onClick={() => setYearToDelete(y)}
                    className="absolute top-3 right-3 z-20 p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    title="Delete empty award year"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Browse by Category Section */}
        <section>
          <h3 className="text-lg font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Award size={18} className="text-amber-400" />
            Browse by Award
          </h3>
          {templates.length === 0 ? (
            <div className="text-center py-12 text-gray-500 border border-white/5 rounded-2xl bg-white/[0.02]">
              <Award size={40} className="mx-auto mb-3 text-gray-600" />
              <p>No awards created yet.</p>
              <p className="text-sm text-gray-600">Create award categories in a year view above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {templates.map((template, index) => (
                <div
                  key={template.id}
                  className="relative group award-card-enter"
                  style={{ animationDelay: `${Math.min(index * 60, 300)}ms` }}
                >
                  <button
                    onClick={() => handleTemplateSelect(template.id)}
                    className="relative h-full w-full bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl p-5 text-left hover:border-amber-500/40 transition-all overflow-hidden"
                  >
                    <div className="absolute -top-10 -right-10 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all" />
                    <div className="relative z-10 flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500/20 to-yellow-600/20 flex-shrink-0">
                        <Trophy size={18} className="text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0 pr-8">
                        <h4 className="font-semibold truncate group-hover:text-amber-200 transition-colors">
                          {template.name}
                        </h4>
                        <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                          <History size={12} />
                          {template.usage_count || 0} year{(template.usage_count || 0) !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => openDeleteTemplate(template)}
                    className="absolute top-3 right-3 z-20 p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    title="Delete award"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <InputModal
          isOpen={inputModalOpen}
          onClose={() => setInputModalOpen(false)}
          onSubmit={handleYearInputSubmit}
          title="Create New Award Year"
          placeholder="e.g. 2026"
          defaultValue={new Date().getFullYear().toString()}
          validate={validateYearInput}
        />

        <ConfirmDialog
          isOpen={yearToDelete !== null}
          onClose={() => setYearToDelete(null)}
          onConfirm={confirmDeleteYear}
          title="Delete Award Year"
          confirmLabel="Delete Year"
          detail="Only the empty year shell will be removed. Award templates and other years will stay intact."
        >
          Are you sure you want to delete <span className="font-semibold text-white">{yearToDelete?.year}</span>?
        </ConfirmDialog>

        {templateDeleteDialog}
      </div>
    );
  }

  // --- VIEW 1: CATEGORY DETAIL ---
  if (view === "category" && selectedTemplate) {
    const mostRecent = templateHistory[0];
    const pastWinners = templateHistory.slice(1);

    return (
      <div className="space-y-8 max-w-5xl mx-auto pb-20">
        <AwardErrorToast message={awardError} onDismiss={() => setAwardError(null)} />
        <header className="flex items-center gap-4 award-header-enter">
          <button
            onClick={goBackToMain}
            className="p-2.5 hover:bg-white/10 rounded-full transition-colors border border-white/10 hover:border-white/20"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="flex-1">
            <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-300 to-yellow-500 inline-flex items-center gap-2">
              <Trophy size={24} className="text-amber-400" />
              {selectedTemplate.name}
            </h2>
            <p className="text-gray-400">
              Awarded in {templateHistory.length} year{templateHistory.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => openDeleteTemplate(selectedTemplate)}
            className="flex items-center gap-2 bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/40 text-gray-300 hover:text-red-400 px-4 py-2 rounded-xl font-semibold transition-all"
          >
            <Trash2 size={18} />
            Delete Award
          </button>
        </header>

        {/* Most Recent Winner */}
        {mostRecent && (
          <section className="bg-gradient-to-br from-amber-500/10 via-white/5 to-yellow-500/5 border border-amber-500/20 rounded-2xl p-6 award-card-enter" style={{ animationDelay: '80ms' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-500/20 to-yellow-600/20 text-amber-300 rounded-full text-xs font-bold uppercase tracking-wider border border-amber-500/20">
                <Sparkles size={12} />
                Most Recent • {mostRecent.year}
              </div>
            </div>

            {mostRecent.winner ? (
              <div className="flex gap-6 items-center">
                <div className="w-48 flex-shrink-0">
                  <div className="relative">
                    <MediaCard entry={mostRecent.winner} />
                    <div className="absolute -top-2 -right-2 bg-gradient-to-br from-amber-400 to-yellow-600 p-1.5 rounded-full shadow-lg shadow-amber-500/30">
                      <Trophy size={14} className="text-black" />
                    </div>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <h4 className="text-2xl font-bold text-white">{mostRecent.winner.name}</h4>
                  <p className="text-gray-400">{mostRecent.winner.author || mostRecent.winner.director || mostRecent.winner.entry_type}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Trophy size={32} className="mx-auto mb-2 text-gray-600" />
                <p>No winner selected for {mostRecent.year}</p>
              </div>
            )}
          </section>
        )}

        {/* Past Winners Timeline */}
        {pastWinners.length > 0 && (
          <section>
            <h3 className="text-lg font-semibold text-gray-300 mb-4 flex items-center gap-2">
              <History size={18} className="text-amber-400" />
              Past Winners
            </h3>
            <div className="space-y-3">
              {pastWinners.map((entry, index) => (
                <div
                  key={entry.category_id}
                  style={{ animationDelay: `${Math.min(index * 60, 300)}ms` }}
                  className={cn(
                    "award-item-enter",
                    "flex items-center gap-4 p-4 rounded-xl border transition-all",
                    entry.winner
                      ? "bg-white/5 border-white/10 hover:border-white/20"
                      : "bg-white/[0.02] border-white/5"
                  )}
                >
                  <div className="text-2xl font-bold text-gray-400 w-16 text-center">{entry.year}</div>
                  {entry.winner ? (
                    <>
                      <WinnerThumbnail entry={entry.winner} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{entry.winner.name}</div>
                        <div className="text-sm text-gray-500 truncate">
                          {entry.winner.author || entry.winner.director || entry.winner.entry_type}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 text-gray-500 italic">No winner selected</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {templateHistory.length === 0 && (
          <div className="text-center py-20 text-gray-500 border-2 border-dashed border-white/5 rounded-2xl">
            <Trophy size={48} className="mx-auto mb-4 text-gray-600" />
            <p className="text-lg">This award hasn't been used yet.</p>
            <p className="text-sm text-gray-600">Add it to a year to start awarding winners.</p>
          </div>
        )}

        {templateDeleteDialog}
      </div>
    );
  }

  // --- VIEW 2: YEAR DETAIL (Category Editor) ---
  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20">
      <AwardErrorToast message={awardError} onDismiss={() => setAwardError(null)} />
      <header className="flex items-center gap-4 award-header-enter">
        <button
          onClick={goBackToMain}
          className="p-2.5 hover:bg-white/10 rounded-full transition-colors border border-white/10 hover:border-white/20"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1">
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-300 to-yellow-500 inline-flex items-center gap-2">
            <Sparkles size={24} className="text-amber-400" />
            {selectedYear} Awards
          </h2>
          <p className="text-gray-400">Select winners for each category</p>
        </div>
        <div className="flex gap-2">
          {/* Reorder Button */}
          <button
            onClick={() => setReorderOpen(true)}
            disabled={categories.length < 2}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 px-4 py-2 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowUpDown size={18} />
            Reorder
          </button>

          <button
            onClick={() => setCategoryPickerOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 px-4 py-2 rounded-xl font-semibold transition-all shadow-lg shadow-amber-500/20"
          >
            <Plus size={18} />
            Add Award
          </button>
        </div>
      </header>

      <div className="space-y-6">
        {categories.length === 0 && (
          <div className="text-center py-20 text-gray-500 border-2 border-dashed border-white/5 rounded-2xl bg-gradient-to-br from-white/[0.02] to-transparent">
            <Trophy size={48} className="mx-auto mb-4 text-gray-600" />
            <p className="text-lg">No categories yet.</p>
            <p className="text-sm text-gray-600">Click "Add Award" to start creating awards.</p>
          </div>
        )}

        {/* Category Cards */}
        {categories.map((cat, index) => {
          const winner = cat.winner;
          const typeBadge = winner ? getTypeBadgeStyle(winner.entry_type) : null;
          const genres = winner ? parseGenres(winner.genre) : [];

          return (
            <div
              key={cat.id}
              style={{ animationDelay: `${Math.min(index * 60, 300)}ms` }}
              className={cn(
                "relative overflow-visible rounded-2xl p-6 transition-all border group award-item-enter",
                winner
                  ? "bg-gradient-to-br from-amber-500/10 via-white/5 to-yellow-500/5 border-amber-500/20 hover:border-amber-400/40"
                  : "bg-white/5 border-white/10 hover:border-white/20"
              )}
            >
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
                {/* Position indicator */}
                <div className="absolute top-4 right-5 text-7xl font-black text-white/[0.06] leading-none select-none">
                  #{index + 1}
                </div>

                {/* Glow effect for winners */}
                {winner && (
                  <div className="absolute -top-20 -right-20 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl" />
                )}
              </div>

              <div className="relative z-10">
                {/* Category header row — icon + name */}
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-2xl font-bold flex items-center gap-2.5">
                    <div className={cn(
                      "p-2 rounded-xl",
                      winner
                        ? "bg-gradient-to-br from-amber-500/20 to-yellow-600/20"
                        : "bg-white/5"
                    )}>
                      <Award className={winner ? "text-amber-400" : "text-gray-500"} size={20} />
                    </div>
                    <span className={winner ? "text-amber-200" : "text-white"}>{cat.name}</span>
                  </h3>
                </div>

                {winner && typeBadge ? (
                  <div className="flex gap-6 items-stretch">
                    {/* Left: Large cover image */}
                    <div
                      className="w-48 flex-shrink-0 cursor-pointer group/cover"
                      onClick={() => openPicker(cat.id)}
                    >
                      <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-lg transition-transform group-hover/cover:scale-[1.02]">
                        <div className="relative h-72 w-full overflow-hidden">
                          <WinnerCoverImage entry={winner} />
                          {/* Winner trophy badge — inside image bounds */}
                          <div className="absolute top-2 right-2 bg-gradient-to-br from-amber-400 to-yellow-600 p-2 rounded-full shadow-lg shadow-amber-500/30 ring-2 ring-black/20">
                            <Trophy size={16} className="text-black" />
                          </div>
                          {/* Rating pill on image */}
                          {winner.review_score !== null && winner.review_score !== undefined && (
                            <div className={cn(
                              "absolute bottom-2 left-2 px-2.5 py-1 rounded-full flex items-center gap-1 text-xs font-bold shadow-lg",
                              getRatingColor(winner.review_score)
                            )}>
                              <Star size={11} className="fill-current" />
                              <span>{formatCardRating(winner.review_score)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Metadata block */}
                    <div className="flex-1 flex flex-col gap-3 min-w-0 py-1">
                      {/* Winner pill */}
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-500/20 to-yellow-600/20 text-amber-300 rounded-full text-xs font-bold uppercase tracking-wider border border-amber-500/20 w-fit">
                        <Trophy size={12} />
                        Winner
                      </div>

                      {/* Title */}
                      <h4 className="text-3xl font-bold text-white leading-tight">
                        {winner.name}
                      </h4>

                      {/* Context line as typed pills */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-white font-semibold shadow-md",
                          typeBadge.bg
                        )}>
                          {typeBadge.icon}
                          <span>{winner.entry_type}</span>
                        </span>
                        {winner.author && (
                          <span className="px-2.5 py-1 bg-white/5 rounded-full text-xs text-gray-300 font-medium">
                            {winner.author}
                          </span>
                        )}
                        {winner.artist && !winner.author && (
                          <span className="px-2.5 py-1 bg-white/5 rounded-full text-xs text-gray-300 font-medium">
                            {winner.artist}
                          </span>
                        )}
                        {winner.actress && winner.actress.split(',').map((a, i) => {
                          const trimmed = a.trim();
                          if (!trimmed) return null;
                          return (
                            <span key={`actress-${i}`} className="px-2.5 py-1 bg-white/5 rounded-full text-xs text-gray-300 font-medium">
                              {trimmed}
                            </span>
                          );
                        })}
                        {winner.director && !winner.author && !winner.artist && (
                          <span className="px-2.5 py-1 bg-white/5 rounded-full text-xs text-gray-300 font-medium">
                            {winner.director}
                          </span>
                        )}
                        {winner.platform && (
                          <span className="px-2.5 py-1 bg-white/5 rounded-full text-xs text-gray-300 font-medium">
                            {winner.platform}
                          </span>
                        )}
                      </div>

                      {/* Genre chips */}
                      {genres.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {genres.slice(0, 4).map((genre, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 bg-white/10 rounded-md text-[11px] text-gray-300 font-medium"
                            >
                              {genre}
                            </span>
                          ))}
                          {genres.length > 4 && (
                            <span
                              className="px-2 py-0.5 bg-white/5 rounded-md text-[11px] text-gray-500 font-medium"
                              title={genres.slice(4).join(', ')}
                            >
                              +{genres.length - 4}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Date + change winner row */}
                      <div className="flex items-center justify-between gap-3 mt-auto pt-1">
                        {winner.completion_date ? (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Calendar size={12} />
                            <span>{formatDate(winner.completion_date)}</span>
                          </div>
                        ) : (
                          <span />
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCategoryToDelete(cat)}
                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title={`Remove this award from ${selectedYear}`}
                          >
                            <Trash2 size={16} />
                          </button>
                          <button
                            onClick={() => openPicker(cat.id)}
                            className="text-sm text-amber-400 hover:text-amber-300 hover:underline font-medium transition-colors"
                          >
                            Change Winner →
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <button
                      onClick={() => openPicker(cat.id)}
                      className="w-full h-80 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-3 text-gray-500 hover:text-amber-400 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all group/select"
                    >
                      <div className="p-4 rounded-full bg-white/5 group-hover/select:bg-amber-500/10 transition-colors">
                        <Plus size={28} />
                      </div>
                      <span className="font-semibold">Select Winner</span>
                    </button>
                    <button
                      onClick={() => setCategoryToDelete(cat)}
                      className="absolute bottom-3 right-3 p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title={`Remove this award from ${selectedYear}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <WinnerPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleWinnerSelect}
        year={selectedYear || undefined}
      />

      {/* Reorder Modal */}
      <ReorderModal
        isOpen={reorderOpen}
        onClose={() => setReorderOpen(false)}
        items={categoriesToReorderItems(categories)}
        onSave={handleReorderSave}
        title={`Reorder ${selectedYear} Categories`}
      />

      {/* Category Picker for New/Existing */}
      <CategoryPicker
        isOpen={categoryPickerOpen}
        onClose={() => setCategoryPickerOpen(false)}
        onSelectExisting={handleUseExistingCategory}
        onCreateNew={handleCreateNewCategory}
        year={selectedYear || new Date().getFullYear()}
      />

      <ConfirmDialog
        isOpen={categoryToDelete !== null}
        onClose={() => setCategoryToDelete(null)}
        onConfirm={confirmDeleteCategory}
        title={`Remove Award from ${selectedYear}`}
        confirmLabel="Remove"
        detail="The award itself stays in your library and in any other years. Any winner selected here will be cleared."
      >
        Remove <span className="font-semibold text-white">"{categoryToDelete?.name}"</span> from {selectedYear}?
      </ConfirmDialog>
    </div>
  );
}
