'use client';

import { useMapStore } from '@/store/useMapStore';
import { effectiveTime, slotIndexAt } from '@/lib/generationUtils';

/** Créneau horaire affiché : index dans la matrice de production (-1 si absent). */
export function useCurrentSlot() {
  const generation = useMapStore((s) => s.generation);
  const selectedTime = useMapStore((s) => s.selectedTime);
  const time = effectiveTime(selectedTime, generation);
  const index = generation ? slotIndexAt(generation, time) : -1;
  const slotStart = generation && index >= 0 ? generation.times[index] : null;
  return { generation, time, index, slotStart, isLive: selectedTime === null };
}
