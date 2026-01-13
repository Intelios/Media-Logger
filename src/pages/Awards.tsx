import { useEffect, useState } from "react";
import { Award, ChevronLeft, Plus, Trash2, Trophy, ArrowUpDown, Sparkles, History } from "lucide-react";
import { awardsLogic, type AwardYearSummary, type AwardCategory, type AwardTemplate, type TemplateWinnerHistory } from "../lib/awards-logic";
import { MediaCard } from "../components/MediaCard";
import { WinnerPicker } from "../components/WinnerPicker";
import { InputModal } from "../components/InputModal";
import { ReorderModal, type ReorderItem } from "../components/ReorderModal";
import { CategoryPicker } from "../components/CategoryPicker";
import type { MediaEntry } from "../lib/db";
import { cn } from "../lib/utils_ui";
import { getImageUrl } from "../lib/utils";

// Small helper component for loading images asynchronously (required for Tauri)
function WinnerThumbnail({ entry }: { entry: MediaEntry }) {
  const [imgSrc, setImgSrc] = useState<string>("");

  useEffect(() => {
    getImageUrl(entry.image_url).then(setImgSrc);
  }, [entry.image_url]);

  return (
    <div className="w-16 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
      {imgSrc && (
        <img
          src={imgSrc}
          alt={entry.name}
          className="w-full h-full object-cover"
        />
      )}
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

  // New Input Modal State
  const [inputModalOpen, setInputModalOpen] = useState(false);

  // Load Years and Templates on Mount
  useEffect(() => {
    loadYears();
    loadTemplates();
  }, []);

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

  const handleYearInputSubmit = async (value: string) => {
    const y = parseInt(value);
    if (!isNaN(y)) {
      handleYearSelect(y);
    }
  };

  // Category creation handlers
  const handleCreateNewCategory = async (name: string) => {
    if (selectedYear) {
      await awardsLogic.createCategory(name, selectedYear);
      loadCategories(selectedYear);
      loadTemplates(); // Refresh templates since a new one was created
    }
  };

  const handleUseExistingCategory = async (templateId: number) => {
    if (selectedYear) {
      try {
        await awardsLogic.createCategoryFromTemplate(templateId, selectedYear);
        loadCategories(selectedYear);
      } catch (error) {
        console.error("Error creating category from template:", error);
      }
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (confirm("Delete this award category?")) {
      await awardsLogic.deleteCategory(id);
      if (selectedYear) loadCategories(selectedYear);
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
      subtitle: cat.winner ? `Winner: ${cat.winner.name}` : "No winner yet"
    }));
  };

  const goBackToMain = () => {
    setView("main");
    loadYears();
    loadTemplates();
  };

  // --- VIEW 0: MAIN (Browse by Year + Browse by Category) ---
  if (view === "main") {
    return (
      <div className="space-y-10 max-w-6xl mx-auto">
        <header>
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
            {years.map(y => (
              <button
                key={y.year}
                onClick={() => handleYearSelect(y.year)}
                className="relative bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-2xl p-5 text-left hover:border-amber-500/50 transition-all hover:shadow-xl hover:shadow-amber-500/10 group overflow-hidden min-h-[140px]"
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
              {templates.map(template => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateSelect(template.id)}
                  className="relative bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl p-5 text-left hover:border-amber-500/40 transition-all group overflow-hidden"
                >
                  <div className="absolute -top-10 -right-10 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all" />
                  <div className="relative z-10 flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500/20 to-yellow-600/20 flex-shrink-0">
                      <Trophy size={18} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
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
        />
      </div>
    );
  }

  // --- VIEW 1: CATEGORY DETAIL ---
  if (view === "category" && selectedTemplate) {
    const mostRecent = templateHistory[0];
    const pastWinners = templateHistory.slice(1);

    return (
      <div className="space-y-8 max-w-5xl mx-auto pb-20">
        <header className="flex items-center gap-4">
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
        </header>

        {/* Most Recent Winner */}
        {mostRecent && (
          <section className="bg-gradient-to-br from-amber-500/10 via-white/5 to-yellow-500/5 border border-amber-500/20 rounded-2xl p-6">
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
              {pastWinners.map((entry) => (
                <div
                  key={entry.category_id}
                  className={cn(
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
      </div>
    );
  }

  // --- VIEW 2: YEAR DETAIL (Category Editor) ---
  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20">
      <header className="flex items-center gap-4">
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
        {categories.map((cat, index) => (
          <div
            key={cat.id}
            className={cn(
              "relative rounded-2xl p-6 transition-all border overflow-hidden group",
              cat.winner
                ? "bg-gradient-to-br from-amber-500/10 via-white/5 to-yellow-500/5 border-amber-500/20 hover:border-amber-400/40"
                : "bg-white/5 border-white/10 hover:border-white/20"
            )}
          >
            {/* Position indicator */}
            <div className="absolute top-4 right-4 text-6xl font-black text-white/[0.03] leading-none select-none">
              #{index + 1}
            </div>

            {/* Glow effect for winners */}
            {cat.winner && (
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl" />
            )}

            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <div className={cn(
                    "p-1.5 rounded-lg",
                    cat.winner
                      ? "bg-gradient-to-br from-amber-500/20 to-yellow-600/20"
                      : "bg-white/5"
                  )}>
                    <Award className={cat.winner ? "text-amber-400" : "text-gray-500"} size={18} />
                  </div>
                  <span className={cat.winner ? "text-amber-200" : "text-white"}>{cat.name}</span>
                </h3>
                <button
                  onClick={() => handleDeleteCategory(cat.id)}
                  className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              {cat.winner ? (
                <div className="flex gap-6 items-center">
                  <div className="w-48 flex-shrink-0 cursor-pointer transform hover:scale-[1.02] transition-transform" onClick={() => openPicker(cat.id)}>
                    <div className="relative">
                      <MediaCard entry={cat.winner} />
                      {/* Winner badge overlay */}
                      <div className="absolute -top-2 -right-2 bg-gradient-to-br from-amber-400 to-yellow-600 p-1.5 rounded-full shadow-lg shadow-amber-500/30">
                        <Trophy size={14} className="text-black" />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-500/20 to-yellow-600/20 text-amber-300 rounded-full text-xs font-bold uppercase tracking-wider border border-amber-500/20">
                      <Trophy size={12} />
                      Winner
                    </div>
                    <h4 className="text-2xl font-bold text-white">{cat.winner.name}</h4>
                    <p className="text-gray-400">{cat.winner.author || cat.winner.director || cat.winner.entry_type}</p>
                    <button
                      onClick={() => openPicker(cat.id)}
                      className="text-sm text-amber-400 hover:text-amber-300 hover:underline mt-2 font-medium transition-colors"
                    >
                      Change Winner →
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => openPicker(cat.id)}
                  className="w-full h-32 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-amber-400 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all group/select"
                >
                  <div className="p-3 rounded-full bg-white/5 group-hover/select:bg-amber-500/10 transition-colors">
                    <Plus size={24} />
                  </div>
                  <span className="font-medium">Select Winner</span>
                </button>
              )}
            </div>
          </div>
        ))}
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
    </div>
  );
}