import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, X, Plus, Trophy, Check } from "lucide-react";
import { awardsLogic, type AwardTemplate } from "../lib/awards-logic";
import { cn } from "../lib/utils_ui";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";

interface CategoryPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectExisting: (templateId: number) => void;
    onCreateNew: (name: string) => void;
    year: number;
}

export function CategoryPicker({
    isOpen,
    onClose,
    onSelectExisting,
    onCreateNew,
    year
}: CategoryPickerProps) {
    const [query, setQuery] = useState("");
    const [templates, setTemplates] = useState<AwardTemplate[]>([]);
    const [filteredTemplates, setFilteredTemplates] = useState<AwardTemplate[]>([]);
    const [showNewInput, setShowNewInput] = useState(false);
    const [newName, setNewName] = useState("");
    const modalRef = useRef<HTMLDivElement>(null);

    useEscapeToClose(isOpen, onClose);
    useFocusTrap(isOpen, modalRef);

    useEffect(() => {
        if (isOpen) {
            setQuery("");
            setShowNewInput(false);
            setNewName("");
            // Load templates not already used in this year
            awardsLogic.getTemplatesNotUsedInYear(year).then(setTemplates);
        }
    }, [isOpen, year]);

    useEffect(() => {
        if (!query) {
            setFilteredTemplates(templates);
            return;
        }
        const q = query.toLowerCase();
        setFilteredTemplates(templates.filter(t => t.name.toLowerCase().includes(q)));
    }, [query, templates]);

    const handleCreateNew = () => {
        if (newName.trim()) {
            onCreateNew(newName.trim());
            onClose();
        }
    };

    if (!isOpen) return null;

    // Portalled to <body> so a parent's `space-y-*` margin can't offset the
    // fixed overlay — see the note in EntryForm.
    return createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div ref={modalRef} className="bg-[#1a1a1a] border border-white/10 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">

                {/* Header */}
                <div className="p-4 border-b border-white/5 flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            autoFocus
                            className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-white focus:border-amber-500/50 outline-none"
                            placeholder="Search existing awards..."
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                        />
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">

                    {/* Create New Option */}
                    {!showNewInput ? (
                        <button
                            onClick={() => setShowNewInput(true)}
                            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all group"
                        >
                            <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500/20 to-yellow-600/20 group-hover:scale-110 transition-transform">
                                <Plus size={20} className="text-amber-400" />
                            </div>
                            <div className="text-left">
                                <div className="font-semibold text-amber-300">Create New Award</div>
                                <div className="text-sm text-gray-500">Add a brand new award category</div>
                            </div>
                        </button>
                    ) : (
                        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-3">
                            <input
                                autoFocus
                                type="text"
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:border-amber-500/50 outline-none"
                                placeholder="Enter new award name..."
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleCreateNew()}
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowNewInput(false)}
                                    className="flex-1 px-4 py-2 rounded-lg text-gray-400 hover:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateNew}
                                    disabled={!newName.trim()}
                                    className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-600 text-white font-semibold disabled:opacity-50 transition-all"
                                >
                                    Create
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Divider */}
                    {templates.length > 0 && (
                        <div className="flex items-center gap-3 py-2">
                            <div className="flex-1 h-px bg-white/10" />
                            <span className="text-xs text-gray-500 uppercase tracking-wider">Or use existing</span>
                            <div className="flex-1 h-px bg-white/10" />
                        </div>
                    )}

                    {/* Existing Templates */}
                    {filteredTemplates.map(template => (
                        <button
                            key={template.id}
                            onClick={() => {
                                onSelectExisting(template.id);
                                onClose();
                            }}
                            className={cn(
                                "w-full flex items-center gap-3 p-4 rounded-xl border border-white/10",
                                "hover:border-amber-500/30 hover:bg-white/5 transition-all group text-left"
                            )}
                        >
                            <div className="p-2 rounded-lg bg-white/5 group-hover:bg-amber-500/10 transition-colors">
                                <Trophy size={18} className="text-gray-400 group-hover:text-amber-400" />
                            </div>
                            <div className="flex-1">
                                <div className="font-semibold group-hover:text-amber-200 transition-colors">
                                    {template.name}
                                </div>
                                <div className="text-sm text-gray-500">
                                    Used in {template.usage_count || 0} year{(template.usage_count || 0) !== 1 ? 's' : ''}
                                </div>
                            </div>
                            <Check size={18} className="text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                    ))}

                    {filteredTemplates.length === 0 && templates.length > 0 && (
                        <div className="text-center py-8 text-gray-500">
                            No matching awards found
                        </div>
                    )}

                    {templates.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                            <Trophy size={32} className="mx-auto mb-2 text-gray-600" />
                            <p>No unused awards available</p>
                            <p className="text-sm">Create a new one above!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
