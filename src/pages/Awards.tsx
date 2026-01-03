import { useEffect, useState } from "react";
import { Award, ChevronLeft, Plus, Trash2, Trophy } from "lucide-react";
import { awardsLogic, type AwardYearSummary, type AwardCategory } from "../lib/awards-logic";
import { MediaCard } from "../components/MediaCard";
import { WinnerPicker } from "../components/WinnerPicker";
import { InputModal } from "../components/InputModal"; // Import new modal
import type { MediaEntry } from "../lib/db";
import { cn } from "../lib/utils_ui";

export default function AwardsPage() {
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  
  // Data State
  const [years, setYears] = useState<AwardYearSummary[]>([]);
  const [categories, setCategories] = useState<(AwardCategory & { winner: MediaEntry | null })[]>([]);
  
  // Modal States
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  
  // New Input Modal State
  const [inputModalOpen, setInputModalOpen] = useState(false);
  const [inputType, setInputType] = useState<"year" | "category">("year");

  // Load Years on Mount
  useEffect(() => {
    loadYears();
  }, []);

  const loadYears = () => awardsLogic.getAwardYears().then(setYears);

  const loadCategories = async (year: number) => {
    const data = await awardsLogic.getAwardsForYear(year);
    setCategories(data);
  };

  const handleYearSelect = (year: number) => {
    setSelectedYear(year);
    loadCategories(year);
    setView("detail");
  };

  // --- REPLACED PROMPT LOGIC START ---

  const openCreateYearModal = () => {
    setInputType("year");
    setInputModalOpen(true);
  };

  const openCreateCategoryModal = () => {
    setInputType("category");
    setInputModalOpen(true);
  };

  const handleInputSubmit = async (value: string) => {
    if (inputType === "year") {
        const y = parseInt(value);
        if (!isNaN(y)) {
            // Logic: create a default category to initialize the year, or just navigate to empty view
            // Since our logic relies on categories existing for a year to "exist", let's navigate to detail view
            // and let the user add the first category there.
            handleYearSelect(y);
        }
    } else if (inputType === "category" && selectedYear) {
        await awardsLogic.createCategory(value, selectedYear);
        loadCategories(selectedYear);
    }
  };

  // --- REPLACED PROMPT LOGIC END ---

  const handleDeleteCategory = async (id: number) => {
    if (confirm("Delete this award category?")) { // Window.confirm usually works, unlike prompt
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

  // --- VIEW 1: YEAR SELECTOR ---
  if (view === "list") {
    return (
      <div className="space-y-8 max-w-5xl mx-auto">
        {/* ... Header ... */}
        <header>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-amber-600 inline-flex items-center gap-3">
            <Trophy className="text-yellow-500" />
            Awards
          </h2>
          <p className="text-gray-400">Manage yearly awards for your collection.</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {/* Create New Card - Updated Click Handler */}
          <button 
            onClick={openCreateYearModal}
            className="flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border-2 border-dashed border-white/10 hover:border-primary/50 hover:bg-white/5 transition-all group"
          >
            <div className="p-4 rounded-full bg-white/5 group-hover:scale-110 transition-transform">
              <Plus size={32} className="text-gray-400 group-hover:text-primary" />
            </div>
            <span className="font-semibold text-gray-400 group-hover:text-white">Create Awards</span>
          </button>

          {/* ... Existing Year Cards loop ... */}
          {years.map(y => (
            <button
              key={y.year}
              onClick={() => handleYearSelect(y.year)}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 text-left hover:border-amber-500/50 transition-all hover:shadow-xl hover:shadow-amber-500/10 group"
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-4xl font-bold text-white group-hover:text-amber-400 transition-colors">{y.year}</h3>
                <Trophy size={24} className={cn(y.winners > 0 ? "text-amber-500" : "text-gray-600")} />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Categories</span>
                  <span className="font-mono">{y.categories}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Winners</span>
                  <span className="font-mono text-amber-400">{y.winners}</span>
                </div>
                <div className="h-1 w-full bg-white/10 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="h-full bg-amber-500" 
                    style={{ width: `${y.categories > 0 ? (y.winners / y.categories) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Input Modal */}
        <InputModal 
            isOpen={inputModalOpen && inputType === "year"}
            onClose={() => setInputModalOpen(false)}
            onSubmit={handleInputSubmit}
            title="Create New Award Year"
            placeholder="e.g. 2026"
            defaultValue={new Date().getFullYear().toString()}
        />
      </div>
    );
  }

  // --- VIEW 2: CATEGORY EDITOR ---
  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20">
      <header className="flex items-center gap-4">
        <button 
          onClick={() => { setView("list"); loadYears(); }}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <div>
          <h2 className="text-3xl font-bold">{selectedYear} Awards</h2>
          <p className="text-gray-400">Select winners for each category</p>
        </div>
        <div className="ml-auto">
          {/* Updated Click Handler */}
          <button 
            onClick={openCreateCategoryModal}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            <Plus size={18} />
            Add Category
          </button>
        </div>
      </header>

      <div className="space-y-6">
        {categories.length === 0 && (
          <div className="text-center py-20 text-gray-500 border-2 border-dashed border-white/5 rounded-2xl">
            No categories yet. Click "Add Category" to start.
          </div>
        )}

        {/* ... Existing Categories Loop ... */}
        {categories.map(cat => (
          <div key={cat.id} className="bg-white/5 border border-white/10 rounded-2xl p-6 transition-all hover:border-white/20">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Award className="text-amber-400" size={20} />
                {cat.name}
              </h3>
              <button 
                onClick={() => handleDeleteCategory(cat.id)}
                className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <Trash2 size={18} />
              </button>
            </div>

            {cat.winner ? (
              <div className="flex gap-6 items-center">
                <div className="w-48 flex-shrink-0 cursor-pointer" onClick={() => openPicker(cat.id)}>
                  <MediaCard entry={cat.winner} />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="inline-block px-3 py-1 bg-amber-500/20 text-amber-300 rounded-full text-xs font-bold uppercase tracking-wider mb-1">
                    Winner
                  </div>
                  <h4 className="text-2xl font-bold">{cat.winner.name}</h4>
                  <p className="text-gray-400">{cat.winner.author || cat.winner.director || cat.winner.entry_type}</p>
                  <button 
                    onClick={() => openPicker(cat.id)}
                    className="text-sm text-primary hover:underline mt-2"
                  >
                    Change Winner
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => openPicker(cat.id)}
                className="w-full h-32 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-white hover:border-primary/50 hover:bg-white/5 transition-all"
              >
                <Plus size={24} />
                <span>Select Winner</span>
              </button>
            )}
          </div>
        ))}
      </div>

      <WinnerPicker 
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleWinnerSelect}
        year={selectedYear || undefined}
      />

      {/* Input Modal for Category */}
      <InputModal 
        isOpen={inputModalOpen && inputType === "category"}
        onClose={() => setInputModalOpen(false)}
        onSubmit={handleInputSubmit}
        title={`Add Category for ${selectedYear}`}
        placeholder="e.g. Best Story"
      />
    </div>
  );
}