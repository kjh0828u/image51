import { useAppStore } from '@/store/useAppStore';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

export function usePresetDragDrop() {
  const store = useAppStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = store.profiles.findIndex((p) => p.id === active.id);
      const newIndex = store.profiles.findIndex((p) => p.id === over.id);
      store.reorderProfiles(oldIndex, newIndex);
    }
  };

  return { sensors, handleDragEnd };
}
