// API Insights d'Elexon (BMRS), sans clé : https://data.elexon.co.uk/bmrs/api/v1
// Données BMRS © Elexon Limited, licence https://www.elexon.co.uk/bsc/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/

const API_URL = 'https://data.elexon.co.uk/bmrs/api/v1';
const HOUR = 3_600_000;
const HALF_HOUR = HOUR / 2;
// Unités par requête filtrée (longueur de l'URL)
const UNITS_PER_REQUEST = 40;

export const GB_TIME_ZONE = 'Europe/London';

// Date UTC explicite : une date seule est lue comme 00:00Z, ce qui coupe le début du
// jour de règlement en heure d'été
const isoMinute = (date: Date) => date.toISOString().slice(0, 16) + 'Z';

async function getJson<T>(path: string, params: [string, string][]): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of params) url.searchParams.append(key, value);
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Elexon ${path} (${res.status}) : ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** Lignes d'un jeu /datasets/{X}/stream entre deux instants, pour une liste d'unités. */
export async function fetchUnitStream<T>(dataset: string, from: Date, to: Date, units: string[]): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < units.length; i += UNITS_PER_REQUEST) {
    const params: [string, string][] = [
      ['from', isoMinute(from)],
      ['to', isoMinute(to)],
      ...units.slice(i, i + UNITS_PER_REQUEST).map((unit): [string, string] => ['bmUnit', unit]),
    ];
    rows.push(...(await getJson<T[]>(`/datasets/${dataset}/stream`, params)));
  }
  return rows;
}

// ─── PN : notifications physiques (programme de chaque unité, publié avant l'heure) ──

export interface PnRow {
  bmUnit: string | null;
  timeFrom: string;
  timeTo: string;
  levelFrom: number | null;
  levelTo: number | null;
}

/**
 * Puissance moyenne horaire (MW) par unité. Un PN est une courbe par segments
 * [timeFrom, timeTo] allant de levelFrom à levelTo, sans chevauchement d'heure (les
 * segments restent dans leur demi-heure) : moyenne pondérée par la durée. Seuls les
 * segments commençant dans [from, to[ sont gardés (le flux renvoie aussi celui qui touche
 * la borne), et seulement ceux déjà commencés à `until` (le programme couvre aussi les
 * heures à venir).
 */
export function pnHourly(rows: PnRow[], from: number, to: number, until = Date.now()): Map<string, Map<number, number>> {
  const segments = new Map<string, PnRow>();
  for (const row of rows) {
    if (row.bmUnit) segments.set(`${row.bmUnit}|${row.timeFrom}|${row.timeTo}`, row);
  }
  const sums = new Map<string, Map<number, { energy: number; seconds: number }>>();
  for (const row of segments.values()) {
    const start = Date.parse(row.timeFrom);
    const end = Date.parse(row.timeTo);
    if (start < from || start >= to || start > until || end <= start) continue;
    const levelFrom = row.levelFrom ?? row.levelTo ?? 0;
    const levelTo = row.levelTo ?? levelFrom;
    const seconds = (end - start) / 1000;
    const hour = Math.floor(start / HOUR) * HOUR;
    const hours = sums.get(row.bmUnit!) ?? new Map();
    const acc = hours.get(hour) ?? { energy: 0, seconds: 0 };
    acc.energy += ((levelFrom + levelTo) / 2) * seconds;
    acc.seconds += seconds;
    hours.set(hour, acc);
    sums.set(row.bmUnit!, hours);
  }
  return new Map(
    [...sums].map(([unit, hours]) => [unit, new Map([...hours].map(([hour, a]) => [hour, a.energy / a.seconds]))])
  );
}

// ─── B1610 : production mesurée par unité, publiée après règlement (~7 jours) ────────

export interface B1610Row {
  bmUnit: string;
  settlementDate: string; // jour de règlement (heure de Londres)
  settlementPeriod: number;
  halfHourEndTime: string; // UTC, sans fuseau
  quantity: number; // MWh sur la demi-heure
}

export interface B1610Result {
  hourly: Map<string, Map<number, number>>; // unité -> heure -> MW
  periods: Map<string, Set<number>>; // jour de règlement -> demi-heures publiées
}

/** MWh par demi-heure -> puissance moyenne horaire (MW), et demi-heures publiées par jour. */
export function b1610Hourly(rows: B1610Row[]): B1610Result {
  const halves = new Map<string, Map<number, number>>(); // unité -> début de demi-heure -> MW
  const periods = new Map<string, Set<number>>();
  for (const row of rows) {
    const start = Date.parse(`${row.halfHourEndTime}Z`) - HALF_HOUR;
    const unit = halves.get(row.bmUnit) ?? new Map<number, number>();
    unit.set(start, row.quantity * 2);
    halves.set(row.bmUnit, unit);
    const day = periods.get(row.settlementDate) ?? new Set<number>();
    day.add(row.settlementPeriod);
    periods.set(row.settlementDate, day);
  }
  const hourly = new Map<string, Map<number, number>>();
  for (const [unit, values] of halves) {
    const sums = new Map<number, { sum: number; n: number }>();
    for (const [start, mw] of values) {
      const hour = Math.floor(start / HOUR) * HOUR;
      const acc = sums.get(hour) ?? { sum: 0, n: 0 };
      acc.sum += mw;
      acc.n++;
      sums.set(hour, acc);
    }
    hourly.set(unit, new Map([...sums].map(([hour, { sum, n }]) => [hour, sum / n])));
  }
  return { hourly, periods };
}

/** Un jour de règlement est complet avec toutes ses demi-heures (46 à 50 selon l'heure d'été). */
export const completeDay = (periods: Set<number>) => periods.size >= 46;

// ─── Production par filière ──────────────────────────────────────────────────────────

export interface FuelRow {
  fuelType: string; // CCGT, NUCLEAR, WIND, INTFR…
  startTime: string;
  generation: number; // MW
}

export interface WindSolarRow {
  psrType: string; // Wind Onshore, Wind Offshore, Solar
  startTime: string;
  publishTime: string;
  quantity: number; // MW
}

export async function fetchFuelHh(fromDay: string, lastDay: string): Promise<FuelRow[]> {
  return getJson<FuelRow[]>('/datasets/FUELHH/stream', [
    ['settlementDateFrom', fromDay],
    ['settlementDateTo', lastDay],
  ]);
}

// L'API refuse plus de 7 jours par requête (une semaine qui contient le passage à
// l'heure d'hiver en compte 7 et une heure)
const WIND_SOLAR_CHUNK_MS = 3 * 24 * HOUR;

export async function fetchWindSolar(from: Date, to: Date): Promise<WindSolarRow[]> {
  const rows: WindSolarRow[] = [];
  for (let start = from.getTime(); start < to.getTime(); start += WIND_SOLAR_CHUNK_MS) {
    const end = Math.min(start + WIND_SOLAR_CHUNK_MS, to.getTime());
    const { data } = await getJson<{ data: WindSolarRow[] }>('/generation/actual/per-type/wind-and-solar', [
      ['from', isoMinute(new Date(start))],
      ['to', isoMinute(new Date(end))],
      ['format', 'json'],
    ]);
    rows.push(...data);
  }
  return rows;
}

export interface BmUnitInfo {
  elexonBmUnit: string | null;
  fuelType: string | null;
  generationCapacity: string | null;
}

export const fetchBmUnits = () => getJson<BmUnitInfo[]>('/reference/bmunits/all', []);

/** Moyenne horaire (heure -> MW) de valeurs à la demi-heure. */
export function halfHourlyToHourly(values: { start: number; value: number }[]): Map<number, number> {
  const sums = new Map<number, { sum: number; n: number }>();
  for (const { start, value } of values) {
    const hour = Math.floor(start / HOUR) * HOUR;
    const acc = sums.get(hour) ?? { sum: 0, n: 0 };
    acc.sum += value;
    acc.n++;
    sums.set(hour, acc);
  }
  return new Map([...sums].map(([hour, { sum, n }]) => [hour, sum / n]));
}
