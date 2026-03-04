import { useState, useRef } from "react";
import { X } from "lucide-react";
import { type MediaEntry } from "../lib/db";
import { MediaCard } from "./MediaCard";
import { EntryForm } from "./EntryForm";
import { dbService } from "../lib/db";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";

interface StatsEntriesModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    entries: MediaEntry[];
    onEntriesChange: () => void;
}

export function StatsEntriesModal({ isOpen, onClose, title, entries, onEntriesChange }: StatsEntriesModalProps) {
    const [editingEntry, setEditingEntry] = useState<MediaEntry | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);

    useEscapeToClose(isOpen, onClose);
    useFocusTrap(isOpen, modalRef);

    if (!isOpen) return null;

    const handleEdit = (entry: MediaEntry) => {
        setEditingEntry(entry);
        setIsFormOpen(true);
    };

    const handleSave = async (data: Partial<MediaEntry>) => {
        if (editingEntry?.id) {
            await dbService.updateEntry({ ...editingEntry, ...data } as MediaEntry);
            onEntriesChange();
        }
        setIsFormOpen(false);
        setEditingEntry(null);
    };

    const handleDelete = async (id: number) => {
        await dbService.deleteEntry(id);
        onEntriesChange();
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Modal */}
            <div ref={modalRef} className="fixed inset-4 md:inset-10 lg:inset-16 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-3xl z-50 flex flex-col overflow-hidden animate-in zoom-in-95 fade-in duration-200">
                {/* Header */}
                <header className="flex items-center justify-between p-6 border-b border-white/10 shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold text-white">{title}</h2>
                        <p className="text-gray-400 text-sm mt-1">
                            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
                    >
                        <X size={24} />
                    </button>
                </header>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {entries.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {entries.map(entry => (
                                <MediaCard
                                    key={entry.id}
                                    entry={entry}
                                    onEdit={handleEdit}
                                    onDelete={handleDelete}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                            <p className="text-lg">No entries found.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Entry Form Modal */}
            <EntryForm
                isOpen={isFormOpen}
                onClose={() => {
                    setIsFormOpen(false);
                    setEditingEntry(null);
                }}
                onSave={handleSave}
                initialData={editingEntry}
            />
        </>
    );
}
