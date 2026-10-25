import { prisma } from '../../prisma';
import { addDays, midnightIn } from '../days';
import { aggregateDays, markDays, markedDays, unitDays, upsertAggregates, upsertUnits, type AggregateRow } from '../store';
import type { Country } from '../types';
import {
  b1610Hourly,
  completeDay,
  fetchBmUnits,
  fetchFuelHh,
  fetchUnitStream,
  fetchWindSolar,
  GB_TIME_ZONE,
  halfHourlyToHourly,
  pnHourly,
  type B1610Row,
  type PnRow,
} from './elexon';

// Grande-Bretagne : Elexon (BMRS), sans clé, trois sources dans cet ordre :
//   filières Elexon  FUELHH + éolien/solaire (AGWS)   -> "GB:<TYPE>", "GB:TOTAL", "GB-*:<FILIÈRE>"
//   PN Elexon        programme des unités (BMU)       -> production_readings, jours récents
//   B1610 Elexon     production mesurée des unités    -> remplace les PN dès sa publication (~7 jours)
// Les unités suivies sont celles des centrales de dataset/gb/final/PLANTS.json.

const B1610_MARK = 'GB:B1610';
// B1610 arrive environ 7 jours après : la synchronisation regarde deux semaines en arrière
const B1610_LOOKBACK_DAYS = 14;
// Au-delà, B1610 est toujours publié : inutile de rapatrier les PN
const PN_HISTORY_DAYS = 10;

// FUELHH -> séries nationales (l'éolien vient d'AGWS, qui compte aussi l'éolien raccordé
// au réseau de distribution)
const FUEL_SERIES: Record<string, string> = {
  CCGT: 'FOSSIL_GAS',
  OCGT: 'FOSSIL_GAS',
  COAL: 'FOSSIL_HARD_COAL',
  OIL: 'FOSSIL_OIL',
  NUCLEAR: 'NUCLEAR',
  NPSHYD: 'HYDRO_RUN_OF_RIVER_AND_POUNDAGE',
  PS: 'HYDRO_PUMPED_STORAGE',
  BIOMASS: 'BIOMASS',
  OTHER: 'OTHER',
};
const WIND_SOLAR_SERIES: Record<string, string> = {
  'Wind Onshore': 'WIND_ONSHORE',
  'Wind Offshore': 'WIND_OFFSHORE',
  Solar: 'SOLAR',
};
// Taux de charge "GB-*:<FILIÈRE>" : production FUELHH (unités raccordées au réseau de
// transport) / puissance de ces mêmes unités dans le référentiel BMU
export const LOAD_FACTOR_FUELS: Record<string, string[]> = {
  NUCLEAR: ['NUCLEAR'],
  WIND: ['WIND'],
  HYDRO: ['NPSHYD'],
  THERMAL: ['CCGT', 'OCGT', 'COAL', 'OIL'],
  BIOENERGY: ['BIOMASS'],
};

const iso = (time: number) => new Date(time).toISOString();
const dayRange = (fromDay: string, toDay: string) => ({
  from: new Date(midnightIn(GB_TIME_ZONE, fromDay)),
  to: new Date(midnightIn(GB_TIME_ZONE, toDay)),
});

// Puissance des BMU par filière, rechargée une fois par jour
let capacities: { at: number; byFuel: Promise<Map<string, number>> } | null = null;

function fuelCapacities(): Promise<Map<string, number>> {
  if (!capacities || Date.now() - capacities.at > 24 * 3_600_000) {
    const byFuel = fetchBmUnits().then((units) => {
      const seen = new Set<string>();
      const result = new Map<string, number>();
      for (const unit of units) {
        if (!unit.fuelType || !unit.elexonBmUnit || seen.has(unit.elexonBmUnit)) continue;
        seen.add(unit.elexonBmUnit);
        result.set(unit.fuelType, (result.get(unit.fuelType) ?? 0) + Number(unit.generationCapacity ?? 0));
      }
      return result;
    });
    byFuel.catch(() => (capacities = null));
    capacities = { at: Date.now(), byFuel };
  }
  return capacities.byFuel;
}

/** Séries nationales, total et taux de charge à partir des lignes FUELHH et AGWS. */
export function perTypeRows(
  fuel: { fuelType: string; startTime: string; generation: number }[],
  windSolar: { psrType: string; startTime: string; publishTime: string; quantity: number }[],
  capacity: Map<string, number>,
  from: number,
  to: number,
  updated: string
): AggregateRow[] {
  // Demi-heures par série (plusieurs filières FUELHH par série : CCGT + OCGT)
  const halves = new Map<string, Map<number, number>>();
  const add = (series: string, start: number, value: number) => {
    if (start < from || start >= to) return;
    const values = halves.get(series) ?? new Map<number, number>();
    values.set(start, (values.get(start) ?? 0) + value);
    halves.set(series, values);
  };
  const seenFuel = new Set<string>();
  for (const row of fuel) {
    const key = `${row.fuelType}|${row.startTime}`;
    if (seenFuel.has(key)) continue; // tranches qui se chevauchent
    seenFuel.add(key);
    const start = Date.parse(row.startTime);
    if (FUEL_SERIES[row.fuelType]) add(FUEL_SERIES[row.fuelType], start, row.generation);
    add(`fuel:${row.fuelType}`, start, row.generation);
  }
  // Publications successives d'une même demi-heure : la plus récente
  const latest = new Map<string, (typeof windSolar)[number]>();
  for (const row of windSolar) {
    const key = `${row.psrType}|${row.startTime}`;
    const previous = latest.get(key);
    if (!previous || row.publishTime > previous.publishTime) latest.set(key, row);
  }
  for (const row of latest.values()) {
    const series = WIND_SOLAR_SERIES[row.psrType];
    if (series) add(series, Date.parse(row.startTime), row.quantity);
  }

  const hourly = new Map(
    [...halves].map(([series, values]) => [
      series,
      halfHourlyToHourly([...values].map(([start, value]) => ({ start, value }))),
    ])
  );
  const rows: AggregateRow[] = [];
  const total = new Map<number, number>();
  for (const [series, hours] of hourly) {
    if (series.startsWith('fuel:')) continue;
    for (const [hour, value] of hours) {
      rows.push({ series: `GB:${series}`, start: iso(hour), value, updated });
      total.set(hour, (total.get(hour) ?? 0) + value);
    }
  }
  for (const [hour, value] of total) rows.push({ series: 'GB:TOTAL', start: iso(hour), value, updated });

  for (const [kind, fuels] of Object.entries(LOAD_FACTOR_FUELS)) {
    const installed = fuels.reduce((sum, f) => sum + (capacity.get(f) ?? 0), 0);
    if (installed <= 0) continue;
    const sums = new Map<number, number>();
    for (const f of fuels) {
      for (const [hour, value] of hourly.get(`fuel:${f}`) ?? []) sums.set(hour, (sums.get(hour) ?? 0) + value);
    }
    for (const [hour, value] of sums) rows.push({ series: `GB-*:${kind}`, start: iso(hour), value: value / installed, updated });
  }
  return rows;
}

async function ingestPerType(fromDay: string, toDay: string): Promise<number> {
  const { from, to } = dayRange(fromDay, toDay);
  const [fuel, windSolar, capacity] = await Promise.all([
    fetchFuelHh(fromDay, addDays(toDay, -1)),
    fetchWindSolar(from, to),
    fuelCapacities(),
  ]);
  return upsertAggregates(perTypeRows(fuel, windSolar, capacity, from.getTime(), to.getTime(), new Date().toISOString()));
}

/** Unités suivies : celles des centrales du jeu de données (country = GB). */
const trackedUnits = () =>
  prisma.unit.findMany({ where: { country: 'GB' }, select: { eic_code: true, name: true, production_type: true } });

function unitReadings(
  units: { eic_code: string; name: string; production_type: string }[],
  hourly: Map<string, Map<number, number>>,
  updated: string
) {
  return units
    .filter((unit) => hourly.has(unit.eic_code))
    .map((unit) => ({
      unit,
      values: [...hourly.get(unit.eic_code)!].map(([hour, value]) => ({ start_date: iso(hour), updated_date: updated, value })),
    }));
}

async function ingestPn(fromDay: string, toDay: string): Promise<number> {
  const units = await trackedUnits();
  if (!units.length) return 0;
  const { from, to } = dayRange(fromDay, toDay);
  const rows = await fetchUnitStream<PnRow>('PN', from, to, units.map((u) => u.eic_code));
  const hourly = pnHourly(rows, from.getTime(), to.getTime());
  return upsertUnits('GB', unitReadings(units, hourly, new Date().toISOString()));
}

async function ingestB1610(fromDay: string, toDay: string): Promise<number> {
  const units = await trackedUnits();
  if (!units.length) return 0;
  const { from, to } = dayRange(fromDay, toDay);
  const rows = (await fetchUnitStream<B1610Row>('B1610', from, to, units.map((u) => u.eic_code))).filter(
    (row) => row.settlementDate >= fromDay && row.settlementDate < toDay
  );
  const { hourly, periods } = b1610Hourly(rows);
  const written = await upsertUnits('GB', unitReadings(units, hourly, new Date().toISOString()));
  await markDays(B1610_MARK, [...periods].filter(([, sps]) => completeDay(sps)).map(([day]) => day));
  return written;
}

export const greatBritain: Country = {
  code: 'GB',
  name: 'Grande-Bretagne',
  timeZone: GB_TIME_ZONE,
  enabled: () => true,
  sources: [
    {
      name: 'filières Elexon',
      maxDays: 7,
      ingest: ingestPerType,
      daysWithData: (fromDay) => aggregateDays(fromDay, 'GB:TOTAL', GB_TIME_ZONE),
    },
    {
      name: 'PN Elexon',
      maxDays: 1,
      historyDays: PN_HISTORY_DAYS,
      ingest: ingestPn,
      daysWithData: (fromDay) => unitDays(fromDay, 'GB', GB_TIME_ZONE),
    },
    {
      name: 'B1610 Elexon',
      maxDays: 2,
      lookbackDays: B1610_LOOKBACK_DAYS,
      ingest: ingestB1610,
      daysWithData: (fromDay) => markedDays(B1610_MARK, fromDay),
    },
  ],
};
