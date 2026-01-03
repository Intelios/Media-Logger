import { useState, useEffect } from "react";
import { X, Save, GripVertical } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { MediaEntry } from "../lib/db";

interface ReorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: MediaEntry[];
  onSave: (newOrder: MediaEntry[]) => void;
}

// Sub-component for individual sortable item
function SortableItem({ id, entry }: { id: number, entry: MediaEntry }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: 'relative' as const,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl mb-2 ${isDragging ? 'opacity-50' : ''}`}
    >
      <div {...attributes} {...listeners} className="cursor-grab hover:text-primary touch-none">
        <GripVertical size={20} className="text-gray-500" />
      </div>
      
      {/* Thumbnail (Optional, kept small) */}
      {/* <div className="w-10 h-10 bg-black/50 rounded-lg overflow-hidden flex-shrink-0">
         Image logic would go here if we passed URLs
      </div> */}

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{entry.name}</p>
        <p className="text-xs text-gray-500">{entry.entry_type}</p>
      </div>
    </div>
  );
}

export function ReorderModal({ isOpen, onClose, items, onSave }: ReorderModalProps) {
  const [orderedItems, setOrderedItems] = useState<MediaEntry[]>([]);

  useEffect(() => {
    if (isOpen) setOrderedItems(items);
  }, [isOpen, items]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setOrderedItems((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over?.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-white/10 w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-white/5 flex justify-between items-center">
          <h3 className="text-xl font-bold">Reorder Collection</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {orderedItems.map(item => (
                <SortableItem key={item.id} id={item.id} entry={item} />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="p-4 border-t border-white/5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg font-medium hover:bg-white/5 text-gray-300">Cancel</button>
          <button 
            onClick={() => onSave(orderedItems)}
            className="px-4 py-2 rounded-lg font-bold bg-primary hover:bg-primary/90 text-white flex items-center gap-2"
          >
            <Save size={18} />
            Save Order
          </button>
        </div>
      </div>
    </div>
  );
}