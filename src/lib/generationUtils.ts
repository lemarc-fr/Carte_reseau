import type { AssetType, GenerationSeries, PlantInfo, UnitInfo } from '@/types/energy';
import { ASSET_TYPES, DISPLAYED_COUNTRIES } from '@/config/assetTypes';

// Fonctions pures côté client : lecture des matrices de GenerationSeries.
// Les valeurs sont légèrement négatives quand un groupe à l'arrêt consomme pour ses
// auxiliaires : ramenées à 0, sauf pour le stockage (STEP, batteries) où c'est la recharge.

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

/** Puissance d'un groupe sur le créneau (MW) ; négative seulement pour un stockage qui se recharge. */
export function unitOutput(
  generation: GenerationSeries | null,
  unit: UnitInfo,
  index: number,
  signed = false
): number | null {
  if (!generation || index < 0) return null;
  const value = generation.series[unit.eic_code]?.[index];
  if (value === null || value === undefined) return null;
  return signed ? value : Math.max(0, value);
}

/** Les valeurs négatives de ce site sont-elles une recharge (STEP, batteries) ? */
export const isStorage = (plant: PlantInfo) => ASSET_TYPES[plant.type].storage;

/** Libellé d'une puissance négative de stockage */
export const chargingLabel = (type: AssetType) => (type === 'pumped_storage' ? 'Pompage' : 'Recharge');

// Seuil du filtre « 100 MW » : c'est aussi le seuil de publication par groupe de RTE et
// d'ENTSO-E, un groupe publié de puissance inconnue y est donc compté
export const LARGE_UNIT_MW = 100;

/**
 * Le site compte-t-il un groupe de LARGE_UNIT_MW ou plus, ou est-il une centrale de cette
 * puissance ? Les sites qui regroupent plusieurs installations (commune, `installations`)
 * ne comptent que par leurs groupes.
 */
export const hasLargeUnit = (plant: PlantInfo) =>
  plant.units.some((unit) => (unit.capacity_mw ?? LARGE_UNIT_MW) >= LARGE_UNIT_MW) ||
  (plant.installations === null && plant.capacity_mw >= LARGE_UNIT_MW);

/** Groupes du site dont la production est publiée sur la fenêtre chargée */
export const publishedUnits = (plant: PlantInfo, generation: GenerationSeries | null) =>
  plant.units.filter((unit) => generation?.series[unit.eic_code]);

// Certaines régions publient avec une heure de retard : on reprend leur dernier taux
// de charge s'il date de moins de quelques créneaux horaires
const LOAD_FACTOR_MAX_AGE_SLOTS = 3;

// Région « * » : taux de charge du pays entier (pays sans données régionales, ENTSO-E)
export const NATIONAL_REGION = '*';

/** Série de taux de charge du site : celle de sa région, sinon celle de son pays. */
export function loadFactorKey(generation: GenerationSeries, plant: PlantInfo): string | null {
  const kind = ASSET_TYPES[plant.type].regionalSeries;
  if (!kind) return null;
  const regional = plant.region_code && `${plant.country}-${plant.region_code}:${kind}`;
  if (regional && generation.aggregates[regional]) return regional;
  const national = `${plant.country}-${NATIONAL_REGION}:${kind}`;
  return generation.aggregates[national] ? national : null;
}

/** Taux de charge régional ou national (0-1, négatif pour des batteries qui se rechargent). */
export function regionalLoadFactor(generation: GenerationSeries | null, plant: PlantInfo, index: number): number | null {
  if (!generation || index < 0) return null;
  const key = loadFactorKey(generation, plant);
  if (!key) return null;
  const series = generation.aggregates[key];
  for (let i = index; i >= 0 && i > index - LOAD_FACTOR_MAX_AGE_SLOTS; i--) {
    if (generation.granularity[i] !== 'HOUR') break;
    if (series[i] !== null) return series[i];
  }
  return series[index] ?? null;
}

/**
 * Production estimée (capacité × taux de charge régional) : aucun groupe du site n'a
 * publié de valeur sur la fenêtre chargée (petits sites, ou groupes non publiés).
 */
export const isEstimated = (plant: PlantInfo, generation: GenerationSeries | null) =>
  publishedUnits(plant, generation).length === 0;

export interface Snapshot {
  output: number | null; // MW (négatif : recharge d'un stockage), null si rien de publié ni d'estimable
  capacity: number; // MW installés
  running: number; // groupes qui produisent
  units: number; // groupes publiés
  estimated: boolean; // capacité × taux de charge régional
}

export function plantSnapshot(plant: PlantInfo, generation: GenerationSeries | null, index: number): Snapshot {
  if (isEstimated(plant, generation)) {
    const factor = regionalLoadFactor(generation, plant, index);
    return {
      output: factor === null ? null : plant.capacity_mw * factor,
      capacity: plant.capacity_mw,
      running: 0,
      units: 0,
      estimated: true,
    };
  }
  const published = publishedUnits(plant, generation);
  let output: number | null = null;
  let running = 0;
  for (const unit of published) {
    const value = unitOutput(generation, unit, index, isStorage(plant));
    if (value === null) continue;
    output = (output ?? 0) + value;
    if (value > 0) running++;
  }
  return { output, capacity: plant.capacity_mw, running, units: published.length, estimated: false };
}

/** Production nationale d'une filière sur le créneau (MW), pour les pays affichés. */
export function nationalOutput(
  generation: GenerationSeries | null,
  type: AssetType,
  index: number,
  countries: string[] = DISPLAYED_COUNTRIES
): number | null {
  if (!generation || index < 0) return null;
  let sum: number | null = null;
  for (const country of countries) {
    for (const code of ASSET_TYPES[type].nationalSeries) {
      const value = generation.aggregates[`${country}:${code}`]?.[index];
      if (value !== null && value !== undefined) sum = (sum ?? 0) + value;
    }
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
