import { prisma } from '../../prisma';
import type { Country } from '../types';
import { aggregateDays, unitDays, upsertAggregates, upsertUnits } from '../store';
import { fetchRegionalReadings } from './eco2mix';
import {
  fetchActualGenerations,
  fetchGenerationsPerType,
  FR_TIME_ZONE,
  hasRteCredentials,
  MAX_DAYS_PER_CALL,
} from './rte';
import { linkUnitsToPlants } from './unitPlants';
import { fetchExchanges } from './exchanges';
import { fetchAllPrices } from '../prices';
import { midnightIn } from '../days';

// France : cinq sources, synchronisées ensemble.
//   groupes RTE    production par groupe (> 100 MW)    -> production_readings
//   filières RTE   production nationale par filière     -> "FR:<TYPE>"
//   éCO2mix        taux de charge régionaux, batteries  -> "FR-<région>:<FILIÈRE>", "FR:BATTERY"
//   échanges       éCO2mix national, MW par frontière   -> "FR~<FRONTIÈRE>:COMM", "FR:EXCHANGE"
//   prix           Energy-Charts, €/MWh day-ahead       -> "<pays>:PRICE" (France et voisins)

// Groupes suivis : tous ceux que publie RTE sauf ceux d'une filière sans site sur la carte
const UNIT_PRODUCTION_TYPES = new Set([
  'NUCLEAR',
  'HYDRO_PUMPED_STORAGE',
  'HYDRO_WATER_RESERVOIR',
  'HYDRO_RUN_OF_RIVER_AND_POUNDAGE',
  'WIND_OFFSHORE',
  'FOSSIL_GAS',
  'FOSSIL_OIL',
  'FOSSIL_HARD_COAL',
  'BIOMASS',
  'OTHER', // batteries et cogénérations récentes
]);
// Un jour est complet pour les groupes s'il contient chacun de ces types (l'éolien en
// mer n'existe que depuis 2022 et le charbon peut rester à l'arrêt : non exigés)
const UNIT_TYPES_REQUIRED = ['NUCLEAR', 'HYDRO_PUMPED_STORAGE', 'HYDRO_WATER_RESERVOIR', 'FOSSIL_GAS'];

/** Puissance installée des batteries par région, pour convertir la charge régionale en taux. */
async function batteryCapacityByRegion(): Promise<Map<string, number>> {
  const rows = await prisma.plant.groupBy({
    by: ['region_code'],
    where: { country: 'FR', production_type: 'BATTERY' },
    _sum: { capacity_mw: true },
  });
  return new Map(rows.map((r) => [r.region_code ?? '', r._sum.capacity_mw ?? 0]));
}

export const france: Country = {
  code: 'FR',
  name: 'France',
  timeZone: FR_TIME_ZONE,
  enabled: hasRteCredentials,
  sources: [
    {
      name: 'groupes RTE',
      maxDays: MAX_DAYS_PER_CALL,
      ingest: async (fromDay, toDay) => {
        const units = await fetchActualGenerations(fromDay, toDay);
        return upsertUnits(
          'FR',
          units.filter((u) => UNIT_PRODUCTION_TYPES.has(u.unit.production_type)),
          linkUnitsToPlants
        );
      },
      daysWithData: (fromDay) => unitDays(fromDay, 'FR', FR_TIME_ZONE, UNIT_TYPES_REQUIRED),
    },
    {
      name: 'filières RTE',
      maxDays: MAX_DAYS_PER_CALL,
      ingest: async (fromDay, toDay) => {
        const now = new Date().toISOString();
        const types = await fetchGenerationsPerType(fromDay, toDay);
        return upsertAggregates(
          types.flatMap((t) =>
            t.values.map((v) => ({
              series: `FR:${t.production_type}`,
              start: v.start_date,
              value: v.value,
              updated: v.updated_date ?? now, // absent de certaines réponses par filière
            }))
          )
        );
      },
      daysWithData: (fromDay) => aggregateDays(fromDay, 'FR:NUCLEAR', FR_TIME_ZONE),
    },
    {
      name: 'éCO2mix régional',
      maxDays: MAX_DAYS_PER_CALL,
      ingest: async (fromDay, toDay) => {
        const now = new Date().toISOString();
        const [readings, batteryCapacity] = await Promise.all([
          fetchRegionalReadings(fromDay, toDay),
          batteryCapacityByRegion(),
        ]);
        const rows = [];
        const nationalBattery = new Map<number, number>();
        for (const r of readings) {
          if (r.kind !== 'BATTERY_MW') {
            rows.push({ series: `FR-${r.region}:${r.kind}`, start: r.start.toISOString(), value: r.value, updated: now });
            continue;
          }
          nationalBattery.set(r.start.getTime(), (nationalBattery.get(r.start.getTime()) ?? 0) + r.value);
          const capacity = batteryCapacity.get(r.region);
          if (capacity) {
            rows.push({ series: `FR-${r.region}:BATTERY`, start: r.start.toISOString(), value: r.value / capacity, updated: now });
          }
        }
        for (const [t, value] of nationalBattery) {
          rows.push({ series: 'FR:BATTERY', start: new Date(t).toISOString(), value, updated: now });
        }
        return upsertAggregates(rows);
      },
      // Solaire : filière la plus récemment ajoutée, son absence relance le rattrapage
      daysWithData: (fromDay) => aggregateDays(fromDay, 'FR-84:SOLAR', FR_TIME_ZONE),
    },
    {
      name: 'échanges éCO2mix',
      maxDays: MAX_DAYS_PER_CALL,
      ingest: async (fromDay, toDay) => {
        const now = new Date().toISOString();
        const readings = await fetchExchanges(fromDay, toDay);
        return upsertAggregates(
          readings.map((r) => ({ series: r.series, start: r.start.toISOString(), value: r.value, updated: now }))
        );
      },
      daysWithData: (fromDay) => aggregateDays(fromDay, 'FR~GB:COMM', FR_TIME_ZONE),
    },
    {
      // Prix de la France et de ses voisins, pour la valeur des échanges
      name: 'prix Energy-Charts',
      maxDays: MAX_DAYS_PER_CALL,
      ingest: async (fromDay, toDay) => {
        const now = new Date().toISOString();
        const from = new Date(midnightIn(FR_TIME_ZONE, fromDay));
        const to = new Date(midnightIn(FR_TIME_ZONE, toDay));
        const rows = (await fetchAllPrices(from, to)).flatMap(({ country, hours }) =>
          [...hours].map(([hour, value]) => ({ series: `${country}:PRICE`, start: new Date(hour).toISOString(), value, updated: now }))
        );
        return upsertAggregates(rows);
      },
      daysWithData: (fromDay) => aggregateDays(fromDay, 'FR:PRICE', FR_TIME_ZONE),
    },
  ],
};
