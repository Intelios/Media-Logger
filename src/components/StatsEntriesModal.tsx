import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { type MediaEntry } from "../lib/db";
import { MediaCard } from "./MediaCard";
import { EntryForm } from "./EntryForm";
import { dbService } from "../lib/db";
import { useEscapeToClose } from "../lib/useEscapeToClose";
import { useFocusTrap } from "../lib/useFocusTrap";
import { VirtualizedCardGrid } from "./VirtualizedCardGrid";

interface StatsEntriesModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    entries: MediaEntry[];
    isLoading?: boolean;
    onEntriesChange: () => void;
}

export function StatsEntriesModal({ isOpen, onClose, title, entries, isLoading = false, onEntriesChange }: StatsEntriesModalProps) {
    const [editingEntry, setEditingEntry] = useState<MediaEntry | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

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

    return createPortal(
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Modal */}
            <div ref={modalRef} className="glass-surface fixed inset-4 md:inset-10 lg:inset-16 rounded-3xl z-50 flex flex-col overflow-hidden animate-in zoom-in-95 fade-in duration-200">
                {/* Header */}
                <header className="flex items-center justify-between p-6 border-b border-primary/15 shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold text-text">{title}</h2>
                        <p className="text-text-muted text-sm mt-1">
                            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-primary/10 transition-colors text-text-muted hover:text-primary"
                    >
                        <X size={24} />
                    </button>
                </header>

                {/* Scrollable Content */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
                    {isLoading ? (
                        <div className="flex h-full items-center justify-center text-sm text-text-muted">
                            Loading entry details...
                        </div>
                    ) : entries.length > 0 ? (
                        <VirtualizedCardGrid
                            items={entries}
                            getItemKey={(entry) => entry.id}
                            columns={{ base: 1, sm: 2, md: 3, lg: 4, xl: 5 }}
                            gap={24}
                            estimatedRowHeight={520}
                            scrollContainerRef={scrollRef}
                            ariaLabel={title}
                            renderItem={(entry, index) => (
                                <MediaCard
                                    entry={entry}
                                    imagePriority={index < 10 ? 'high' : 'auto'}
                                    onEdit={handleEdit}
                                    onDelete={handleDelete}
                                />
                            )}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-text-subtle">
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
        </>,
        document.body
    );
}
