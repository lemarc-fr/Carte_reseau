import { midnightIn } from '../days';
import { aggregateDays, unitDays, upsertAggregates, upsertUnits, type AggregateRow, type UnitReadings } from '../store';
import type { Country } from '../types';
import { entsoeQuery, hasEntsoeToken } from './api';
import { LOAD_FACTOR_KINDS, PSR_TYPES, STORAGE_TYPES } from './psr';
import { hourlyAverages, type EntsoeSeries } from './xml';

// Pays synchronisé par ENTSO-E, deux sources :
//   filières ENTSO-E  production par filière (A75)   -> "<pays>:<TYPE>", "<pays>:TOTAL"
//                     et taux de charge nationaux    -> "<pays>-*:<FILIÈRE>" (production /
//                     puissance installée de l'année, A68), pour estimer les sites sans groupe publié
//   groupes ENTSO-E   production par groupe (A73)    -> production_readings

export interface EntsoeArea {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  timeZone: string;
  domain: string; // code EIC du pays (ou de la zone) pour la production par filière
  unitDomains?: string[]; // zones de réglage pour la production par groupe (défaut : domain)
}

const PER_TYPE_MAX_DAYS = 7;
const PER_UNIT_MAX_DAYS = 1; // limite de l'API pour la production par groupe

/** Production nette par type et par heure : la consommation (pompage, recharge) est soustraite. */
export function netHourly(series: EntsoeSeries[], key: (s: EntsoeSeries) => string | null): Map<string, Map<number, number>> {
  const result = new Map<string, Map<number, number>>();
  for (const s of series) {
    const k = key(s);
    if (!k) continue;
    const consumption = Boolean(s.outDomain) && !s.inDomain;
    const type = PSR_TYPES[s.psrType ?? ''];
    if (consumption && !STORAGE_TYPES.has(type)) continue;
    const hours = result.get(k) ?? new Map<number, number>();
    for (const [hour, value] of hourlyAverages(s.points)) {
      hours.set(hour, (hours.get(hour) ?? 0) + (consumption ? -value : value));
    }
    result.set(k, hours);
  }
  return result;
}

/** Taux de charge par famille et par heure : production des types de la famille / puissance installée. */
export function loadFactors(
  byType: Map<string, Map<number, number>>,
  capacity: Map<string, number>
): Map<string, Map<number, number>> {
  const result = new Map<string, Map<number, number>>();
  for (const [kind, types] of Object.entries(LOAD_FACTOR_KINDS)) {
    const installed = types.reduce((sum, t) => sum + (capacity.get(t) ?? 0), 0);
    if (installed <= 0) continue;
    const hours = new Map<number, number>();
    for (const type of types) {
      for (const [hour, value] of byType.get(type) ?? []) hours.set(hour, (hours.get(hour) ?? 0) + value);
    }
    if (!hours.size) continue;
    result.set(kind, new Map([...hours].map(([hour, mw]) => [hour, mw / installed])));
  }
  return result;
}

// Puissance installée par type (A68), publiée une fois par an
const capacities = new Map<string, Promise<Map<string, number>>>();

async function fetchCapacity(area: EntsoeArea, year: number): Promise<Map<string, number>> {
  const doc = await entsoeQuery(
    { documentType: 'A68', processType: 'A33', in_Domain: area.domain },
    new Date(Date.UTC(year, 0, 1)),
    new Date(Date.UTC(year + 1, 0, 1))
  );
  const result = new Map<string, number>();
  for (const s of doc.series) {
    const type = PSR_TYPES[s.psrType ?? ''];
    const value = s.points[0]?.value;
    if (type && value !== undefined) result.set(type, (result.get(type) ?? 0) + value);
  }
  return result;
}

function installedCapacity(area: EntsoeArea, year: number): Promise<Map<string, number>> {
  const key = `${area.code}|${year}`;
  let cached = capacities.get(key);
  if (!cached) {
    // Année pas encore publiée : celle d'avant
    cached = fetchCapacity(area, year)
      .then((caps) => (caps.size ? caps : fetchCapacity(area, year - 1)))
      .catch((err) => {
        capacities.delete(key);
        throw err;
      });
    capacities.set(key, cached);
  }
  return cached;
}

const iso = (time: number) => new Date(time).toISOString();

async function ingestPerType(area: EntsoeArea, fromDay: string, toDay: string): Promise<number> {
  const from = new Date(midnightIn(area.timeZone, fromDay));
  const to = new Date(midnightIn(area.timeZone, toDay));
  const doc = await entsoeQuery({ documentType: 'A75', processType: 'A16', in_Domain: area.domain }, from, to);
  const updated = doc.created ?? new Date().toISOString();

  const byType = netHourly(doc.series, (s) => PSR_TYPES[s.psrType ?? ''] ?? null);
  const rows: AggregateRow[] = [];
  const total = new Map<number, number>();
  for (const [type, hours] of byType) {
    for (const [hour, value] of hours) {
      rows.push({ series: `${area.code}:${type}`, start: iso(hour), value, updated });
      total.set(hour, (total.get(hour) ?? 0) + value);
    }
  }
  for (const [hour, value] of total) rows.push({ series: `${area.code}:TOTAL`, start: iso(hour), value, updated });

  const capacity = await installedCapacity(area, from.getUTCFullYear());
  for (const [kind, hours] of loadFactors(byType, capacity)) {
    for (const [hour, value] of hours) rows.push({ series: `${area.code}-*:${kind}`, start: iso(hour), value, updated });
  }
  return upsertAggregates(rows);
}

async function ingestUnits(area: EntsoeArea, fromDay: string, toDay: string): Promise<number> {
  const from = new Date(midnightIn(area.timeZone, fromDay));
  const to = new Date(midnightIn(area.timeZone, toDay));
  const units: UnitReadings[] = [];
  for (const domain of area.unitDomains ?? [area.domain]) {
    const doc = await entsoeQuery({ documentType: 'A73', processType: 'A16', in_Domain: domain }, from, to);
    const updated = doc.created ?? new Date().toISOString();
    const info = new Map(doc.series.filter((s) => s.resourceId).map((s) => [s.resourceId!, s]));
    for (const [eic, hours] of netHourly(doc.series, (s) => s.resourceId)) {
      const s = info.get(eic)!;
      units.push({
        unit: { eic_code: eic, name: s.resourceName ?? eic, production_type: PSR_TYPES[s.psrType ?? ''] ?? 'OTHER' },
        values: [...hours].map(([hour, value]) => ({ start_date: iso(hour), updated_date: updated, value })),
      });
    }
  }
  return upsertUnits(area.code, units);
}

/** Pays choisis par ENTSOE_COUNTRIES (codes séparés par des virgules) ; vide : tous. */
function selected(code: string): boolean {
  const list = process.env.ENTSOE_COUNTRIES?.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
  return !list?.length || list.includes(code);
}

export function entsoeCountry(area: EntsoeArea): Country {
  return {
    code: area.code,
    name: area.name,
    timeZone: area.timeZone,
    enabled: () => hasEntsoeToken() && selected(area.code),
    sources: [
      {
        name: 'filières ENTSO-E',
        maxDays: PER_TYPE_MAX_DAYS,
        ingest: (fromDay, toDay) => ingestPerType(area, fromDay, toDay),
        daysWithData: (fromDay) => aggregateDays(fromDay, `${area.code}:TOTAL`, area.timeZone),
      },
      {
        name: 'groupes ENTSO-E',
        maxDays: PER_UNIT_MAX_DAYS,
        ingest: (fromDay, toDay) => ingestUnits(area, fromDay, toDay),
        daysWithData: (fromDay) => unitDays(fromDay, area.code, area.timeZone),
      },
    ],
  };
}
