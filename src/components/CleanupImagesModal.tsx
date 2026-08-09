import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, Trash2, X } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { useEscapeToClose } from '../lib/useEscapeToClose';
import { useFocusTrap } from '../lib/useFocusTrap';
import { CoverImage } from './CoverImage';
import { VirtualizedCardGrid } from './VirtualizedCardGrid';
import {
    trashOrphanedImages,
    formatBytes,
    type OrphanedImage,
    type TrashResult,
} from '../lib/image-cleanup';

interface CleanupImagesModalProps {
    isOpen: boolean;
    orphans: OrphanedImage[];
    dataDir: string;
    onClose: () => void;
    onTrashed: (trashedNames: string[]) => void;
    showToast: (message: string) => void;
}

const getOrphanKey = (orphan: OrphanedImage) => orphan.name;

function OrphanTile({
    orphan,
    selected,
    onToggle,
}: {
    orphan: OrphanedImage;
    selected: boolean;
    onToggle: () => void;
}) {
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onToggle}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onToggle();
                }
            }}
            className={`relative h-full rounded-xl overflow-hidden border text-left transition-colors cursor-pointer ${
                selected ? '' : 'border-white/10 hover:border-white/25'
            }`}
            style={{
                background: 'rgba(0, 0, 0, 0.2)',
                ...(selected
                    ? {
                          borderColor: 'var(--color-primary)',
                          boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-primary) 40%, transparent)',
                      }
                    : {}),
            }}
        >
            <CoverImage
                path={`images/${orphan.name}`}
                alt={orphan.name}
                variant="small"
                sizes="180px"
                containerClassName="w-full"
                imageClassName="w-full object-cover"
                containerStyle={{ height: 180, display: 'block' }}
                imageStyle={{ height: 180, display: 'block' }}
            />
            <div
                className={`absolute top-2 left-2 w-5 h-5 rounded-md flex items-center justify-center border ${
                    selected ? '' : 'bg-black/50 border-white/40'
                }`}
                style={
                    selected
                        ? { background: 'var(--color-primary)', borderColor: 'var(--color-primary)' }
                        : undefined
                }
            >
                {selected && <Check size={14} className="text-white" />}
            </div>
            <div style={{ padding: '6px 8px' }}>
                <div
                    className="truncate"
                    title={orphan.name}
                    style={{ fontSize: 11, color: 'var(--color-text-muted)' }}
                >
                    {orphan.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', opacity: 0.7 }}>
                    {formatBytes(orphan.sizeBytes)}
                </div>
            </div>
        </div>
    );
}

export function CleanupImagesModal({
    isOpen,
    orphans,
    dataDir,
    onClose,
    onTrashed,
    showToast,
}: CleanupImagesModalProps) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [showConfirm, setShowConfirm] = useState(false);
    const [lastResult, setLastResult] = useState<TrashResult | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const tilesScrollRef = useRef<HTMLDivElement>(null);

    useEscapeToClose(isOpen && !showConfirm, onClose);
    useFocusTrap(isOpen, modalRef);

    useEffect(() => {
        if (isOpen) {
            setSelected(new Set(orphans.map((orphan) => orphan.name)));
            setLastResult(null);
            setShowConfirm(false);
        }
        // Select-all only on open; after a partial trash the remaining
        // items must stay deselected rather than snap back to selected.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    if (!isOpen) return null;

    const allSelected = orphans.length > 0 && selected.size === orphans.length;
    const selectedOrphans = orphans.filter((orphan) => selected.has(orphan.name));
    const selectedBytes = selectedOrphans.reduce((sum, orphan) => sum + orphan.sizeBytes, 0);
    const totalBytes = orphans.reduce((sum, orphan) => sum + orphan.sizeBytes, 0);

    const toggle = (name: string) => {
        setSelected((previous) => {
            const next = new Set(previous);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const handleConfirmTrash = async () => {
        const names = selectedOrphans.map((orphan) => orphan.name);
        let result: TrashResult;
        try {
            result = await trashOrphanedImages(dataDir, names);
        } catch (error) {
            // Rethrow so ConfirmDialog stays open; the toast explains why.
            showToast(`Cleanup failed: ${String(error)}`);
            throw error;
        }

        setLastResult(result);
        setSelected(new Set());
        if (result.trashed.length > 0) {
            onTrashed(result.trashed);
        }

        if (result.skipped.length === 0 && result.failed.length === 0) {
            showToast(
                `Moved ${result.trashed.length} image${result.trashed.length === 1 ? '' : 's'} to Trash`
            );
            onClose();
        }
    };

    return (
        <>
            {/* zIndex sits below ConfirmDialog's z-[100] so the confirmation can layer on top */}
            <div className="modal-overlay" style={{ zIndex: 90 }} onClick={onClose}>
                <div
                    ref={modalRef}
                    className="modal-content"
                    onClick={(event) => event.stopPropagation()}
                    style={{ width: 'min(100%, 760px)', display: 'flex', flexDirection: 'column', maxHeight: '82vh' }}
                >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                        <div style={{ flex: 1 }}>
                            <h2 style={{ margin: 0 }}>Unused Images</h2>
                            <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
                                {orphans.length === 0
                                    ? 'Nothing left to clean up'
                                    : `${orphans.length} image${orphans.length === 1 ? '' : 's'} (${formatBytes(totalBytes)}) not used by any entry, backlog item, or profile`}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl hover:bg-white/10 transition-colors"
                            style={{ color: 'var(--color-text-muted)' }}
                            aria-label="Close"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {lastResult && (lastResult.skipped.length > 0 || lastResult.failed.length > 0) && (
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                                padding: '12px 14px',
                                borderRadius: 8,
                                marginBottom: 12,
                                background: 'rgba(245, 158, 11, 0.08)',
                                border: '1px solid rgba(245, 158, 11, 0.2)',
                            }}
                        >
                            <strong style={{ color: '#D97706' }}>
                                {lastResult.trashed.length > 0
                                    ? `Moved ${lastResult.trashed.length} to Trash — some files were left alone`
                                    : 'No files were moved to Trash'}
                            </strong>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--color-text-muted)', fontSize: 13 }}>
                                {lastResult.skipped.length > 0 && (
                                    <span>
                                        Skipped (now in use or just added): {lastResult.skipped.join(', ')}
                                    </span>
                                )}
                                {lastResult.failed.map((failure) => (
                                    <span key={failure.name}>
                                        {failure.name}: {failure.error}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {orphans.length === 0 ? (
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 10,
                                padding: '36px 0',
                                color: 'var(--color-text-muted)',
                            }}
                        >
                            <CheckCircle2 size={32} style={{ color: '#22C55E' }} />
                            <span>No unused images found</span>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <button
                                    onClick={() =>
                                        setSelected(
                                            allSelected
                                                ? new Set()
                                                : new Set(orphans.map((orphan) => orphan.name))
                                        )
                                    }
                                    className="settings-btn settings-btn-secondary"
                                    style={{ padding: '6px 12px', fontSize: 12 }}
                                >
                                    {allSelected ? 'Deselect all' : 'Select all'}
                                </button>
                                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                    {selected.size} of {orphans.length} selected
                                    {selected.size > 0 && ` — ${formatBytes(selectedBytes)}`}
                                </span>
                            </div>

                            <div
                                ref={tilesScrollRef}
                                style={{
                                    overflowY: 'auto',
                                    flex: 1,
                                    minHeight: 0,
                                    paddingRight: 4,
                                }}
                            >
                                <VirtualizedCardGrid
                                    items={orphans}
                                    getItemKey={getOrphanKey}
                                    columns={{ base: 3, sm: 4 }}
                                    gap={12}
                                    estimatedRowHeight={226}
                                    itemClassName="h-[226px]"
                                    scrollContainerRef={tilesScrollRef}
                                    ariaLabel="Unused images"
                                    renderItem={(orphan) => (
                                      <OrphanTile
                                        orphan={orphan}
                                        selected={selected.has(orphan.name)}
                                        onToggle={() => toggle(orphan.name)}
                                      />
                                    )}
                                />
                            </div>
                        </>
                    )}

                    <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                        <button
                            onClick={onClose}
                            className="settings-btn settings-btn-secondary"
                            style={{ flex: 1 }}
                        >
                            {orphans.length === 0 ? 'Done' : 'Cancel'}
                        </button>
                        {orphans.length > 0 && (
                            <button
                                onClick={() => setShowConfirm(true)}
                                disabled={selected.size === 0}
                                className="settings-btn settings-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ flex: 1, justifyContent: 'center' }}
                            >
                                <Trash2 size={14} />
                                Move {selected.size || ''} to Trash
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <ConfirmDialog
                isOpen={showConfirm}
                tone="danger"
                title="Move to Trash?"
                subtitle="Files go to your system Trash and can be restored"
                confirmLabel="Move to Trash"
                onClose={() => setShowConfirm(false)}
                onConfirm={handleConfirmTrash}
            >
                {selected.size} unused image{selected.size === 1 ? '' : 's'} ({formatBytes(selectedBytes)}) will
                be moved to the Trash. References are re-checked at this moment — anything now in use is
                skipped, never deleted.
            </ConfirmDialog>
        </>
    );
}
