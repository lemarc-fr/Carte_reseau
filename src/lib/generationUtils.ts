import type { AssetType, GenerationSeries, PlantInfo, UnitInfo } from '@/types/energy';
import { ASSET_TYPES, SIGNED_UNIT_TYPES } from '@/config/assetTypes';

// Fonctions pures côté client : lecture des matrices de GenerationSeries.
// Les valeurs RTE sont légèrement négatives quand un groupe à l'arrêt consomme pour
// ses auxiliaires : ramenées à 0, sauf pour les STEP où le négatif est le pompage.

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

/** Puissance d'un groupe sur le créneau (MW), signée pour les STEP (négatif = pompage). */
export function unitOutput(generation: GenerationSeries | null, unit: UnitInfo, index: number): number | null {
  if (!generation || index < 0) return null;
  const value = generation.series[unit.eic_code]?.[index];
  if (value === null || value === undefined) return null;
  return SIGNED_UNIT_TYPES.has(unit.production_type) ? value : Math.max(0, value);
}

/** Taux de charge régional (0-1) servant à estimer une centrale sans groupe publié. */
export function regionalLoadFactor(generation: GenerationSeries | null, plant: PlantInfo, index: number): number | null {
  const kind = ASSET_TYPES[plant.type].regionalSeries;
  if (!generation || index < 0 || !kind || !plant.region_code) return null;
  return generation.aggregates[`REGION:${plant.region_code}:${kind}`]?.[index] ?? null;
}

/** La production de cette centrale est-elle estimée (aucun groupe publié par RTE) ? */
export const isEstimated = (plant: PlantInfo) => plant.units.length === 0;

export interface Snapshot {
  output: number | null; // MW (négatif : pompage), null si rien de publié ni d'estimable
  capacity: number; // MW installés
  running: number; // groupes qui produisent
  units: number; // groupes publiés par RTE
  estimated: boolean; // capacité × taux de charge régional
}

export function plantSnapshot(plant: PlantInfo, generation: GenerationSeries | null, index: number): Snapshot {
  if (isEstimated(plant)) {
    const factor = regionalLoadFactor(generation, plant, index);
    return {
      output: factor === null ? null : plant.capacity_mw * factor,
      capacity: plant.capacity_mw,
      running: 0,
      units: 0,
      estimated: true,
    };
  }
  let output: number | null = null;
  let running = 0;
  for (const unit of plant.units) {
    const value = unitOutput(generation, unit, index);
    if (value === null) continue;
    output = (output ?? 0) + value;
    if (value > 0) running++;
  }
  return { output, capacity: plant.capacity_mw, running, units: plant.units.length, estimated: false };
}

/** Production nationale d'une filière sur le créneau (MW, séries RTE par filière). */
export function nationalOutput(generation: GenerationSeries | null, type: AssetType, index: number): number | null {
  if (!generation || index < 0) return null;
  let sum: number | null = null;
  for (const key of ASSET_TYPES[type].nationalSeries) {
    const value = generation.aggregates[key]?.[index];
    if (value !== null && value !== undefined) sum = (sum ?? 0) + value;
  }
  return sum;
}

/** Lignes { t, [clé]: MW } pour un graphique empilé, une clé par série. */
export function buildRows(
  generation: GenerationSeries,
  groups: { key: string; value: (index: number) => number | null }[]
): Record<string, number | null>[] {
  return generation.times.map((t, i) => {
    const row: Record<string, number | null> = { t };
    for (const { key, value } of groups) row[key] = value(i);
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
/** Puissance avec « ≈ » quand elle est estimée */
export const formatOutput = (value: number | null, estimated: boolean) =>
  value === null ? '–' : `${estimated ? '≈ ' : ''}${mwFormat.format(value)}`;
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
