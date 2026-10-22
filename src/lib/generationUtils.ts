import type { GenerationSeries, PlantInfo } from '@/types/energy';

// Fonctions pures côté client : lecture de la matrice GenerationSeries.
// Les valeurs RTE sont négatives quand un réacteur à l'arrêt consomme pour ses
// auxiliaires : on les ramène à 0 pour afficher une production.

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export function slotDuration(generation: GenerationSeries, index: number): number {
  return generation.granularity[index] === 'DAY' ? DAY_MS : HOUR_MS;
}

/** Index du créneau qui contient `time`, ou -1 s'il n'y a pas de donnée à cet instant. */
export function slotIndexAt(generation: GenerationSeries, time: number): number {
  const { times } = generation;
  let lo = 0;
  let hi = times.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0 || time >= times[found] + slotDuration(generation, found)) return -1;
  return found;
}

/** Instant effectivement affiché : la sélection, sinon le dernier créneau publié. */
export function effectiveTime(selectedTime: number | null, generation: GenerationSeries | null): number {
  return selectedTime ?? generation?.latest ?? Date.now();
}

export function reactorOutput(generation: GenerationSeries | null, eic: string, index: number): number | null {
  if (!generation || index < 0) return null;
  const value = generation.series[eic]?.[index];
  return value === null || value === undefined ? null : Math.max(0, value);
}

export interface Snapshot {
  output: number | null; // MW, null si aucun réacteur n'a publié
  capacity: number; // MW installés
  running: number; // réacteurs qui produisent
  reactors: number;
}

export function plantSnapshot(plant: PlantInfo, generation: GenerationSeries | null, index: number): Snapshot {
  let output: number | null = null;
  let running = 0;
  for (const reactor of plant.reactors) {
    const value = reactorOutput(generation, reactor.eic_code, index);
    if (value === null) continue;
    output = (output ?? 0) + value;
    if (value > 0) running++;
  }
  return { output, capacity: plant.capacity_mw, running, reactors: plant.reactors.length };
}

export function fleetSnapshot(plants: PlantInfo[], generation: GenerationSeries | null, index: number): Snapshot {
  return plants.reduce<Snapshot>(
    (acc, plant) => {
      const s = plantSnapshot(plant, generation, index);
      return {
        output: s.output === null ? acc.output : (acc.output ?? 0) + s.output,
        capacity: acc.capacity + s.capacity,
        running: acc.running + s.running,
        reactors: acc.reactors + s.reactors,
      };
    },
    { output: null, capacity: 0, running: 0, reactors: 0 }
  );
}

/** Lignes { t, [clé]: MW } pour un graphique empilé, une clé par groupe de réacteurs. */
export function stackedRows(
  generation: GenerationSeries,
  groups: { key: string; eics: string[] }[]
): Record<string, number | null>[] {
  return generation.times.map((t, i) => {
    const row: Record<string, number | null> = { t };
    for (const { key, eics } of groups) {
      let sum: number | null = null;
      for (const eic of eics) {
        const value = reactorOutput(generation, eic, i);
        if (value !== null) sum = (sum ?? 0) + value;
      }
      row[key] = sum;
    }
    return row;
  });
}

// ─── Formatage ───────────────────────────────────────────────────────────────

const mwFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const gwFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });
const slotFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export const formatMW = (value: number | null) => (value === null ? '–' : mwFormat.format(value));
export const formatGW = (mw: number) => gwFormat.format(mw / 1000);
export const formatPercent = (ratio: number) => `${Math.round(ratio * 100)} %`;
export const formatTime = (time: number) => timeFormat.format(time);
export const formatDayTick = (time: number) => dayFormat.format(time);
export const formatSlot = (time: number) => slotFormat.format(time);
export const formatDate = (isoDay: string | null) => (isoDay ? dateFormat.format(new Date(isoDay)) : '–');
const shortDateTimeFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const formatShortDateTime = (time: number) => shortDateTimeFormat.format(time);

export function formatUpdated(time: number): string {
  const date = new Date(time);
  const today = new Date();
  const yesterday = new Date(today.getTime() - DAY_MS);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const day = sameDay(date, today)
    ? "aujourd'hui"
    : sameDay(date, yesterday)
      ? 'hier'
      : `le ${dateFormat.format(date)}`;
  return `${day} à ${formatTime(time)}`;
}

/** Ticks à minuit (heure locale) entre deux instants, pour les axes des graphiques. */
export function midnightTicks(from: number, to: number, maxTicks = 8): number[] {
  const start = new Date(from);
  start.setHours(24, 0, 0, 0);
  const ticks: number[] = [];
  for (const d = start; d.getTime() <= to; d.setDate(d.getDate() + 1)) ticks.push(d.getTime());
  if (ticks.length <= maxTicks) return ticks;
  const step = Math.ceil(ticks.length / maxTicks);
  return ticks.filter((_, i) => i % step === 0);
}
