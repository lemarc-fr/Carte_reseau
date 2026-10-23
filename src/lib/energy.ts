import { prisma } from './prisma';
import type { AssetType, GenerationSeries, PlantInfo, ReadingGranularity } from '@/types/energy';

const toDay = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

// Tri naturel des groupes : « Grand Maison 2 » avant « Grand Maison 10 »
const naturalOrder = new Intl.Collator('fr', { numeric: true });

const ASSET_TYPES: Record<string, AssetType> = {
  NUCLEAR: 'nuclear',
  HYDRO: 'hydro',
  PUMPED_STORAGE: 'pumped_storage',
  WIND: 'wind',
  SOLAR: 'solar',
  GAS: 'gas',
  COAL: 'coal',
  OIL: 'oil',
  BIOENERGY: 'bioenergy',
  BATTERY: 'battery',
};

export async function listPlants(): Promise<PlantInfo[]> {
  const plants = await prisma.plant.findMany({
    include: { units: true },
    orderBy: { capacity_mw: 'desc' },
  });

  return plants
    .filter((plant) => plant.production_type in ASSET_TYPES)
    .map((plant) => ({
      id: plant.id,
      country: plant.country,
      name: plant.name,
      full_name: plant.full_name,
      type: ASSET_TYPES[plant.production_type],
      technology: plant.technology,
      operator: plant.operator,
      latitude: plant.latitude,
      longitude: plant.longitude,
      capacity_mw: plant.capacity_mw,
      commissioning_date: toDay(plant.commissioning_date),
      commune: plant.commune,
      departement: plant.departement,
      region: plant.region,
      region_code: plant.region_code,
      installations: plant.installations,
      wikidata_id: plant.wikidata_id,
      osm_id: plant.osm_id,
      contour: (plant.contour as [number, number][] | null) ?? null,
      units: [...plant.units].sort((a, b) => naturalOrder.compare(a.name, b.name)).map((unit) => ({
        eic_code: unit.eic_code,
        name: unit.name,
        production_type: unit.production_type,
        capacity_mw: unit.capacity_mw,
        commissioning_date: toDay(unit.commissioning_date),
      })),
    }));
}

interface Reading {
  key: string;
  start_date: Date;
  granularity: ReadingGranularity;
  value: number;
}

export async function getGenerationSeries(from: Date, to: Date): Promise<GenerationSeries> {
  const range = { start_date: { gte: from, lte: to } };
  const [unitReadings, aggregateReadings, latest, earliest] = await Promise.all([
    prisma.productionReading.findMany({
      where: range,
      select: { eic_code: true, start_date: true, granularity: true, value: true },
    }),
    prisma.aggregateReading.findMany({
      where: range,
      select: { series: true, start_date: true, granularity: true, value: true },
    }),
    prisma.productionReading.aggregate({
      _max: { start_date: true, updated_date: true },
      where: { granularity: 'HOUR' },
    }),
    prisma.productionReading.aggregate({ _min: { start_date: true } }),
  ]);

  const readings: Reading[] = unitReadings.map((r) => ({ ...r, key: r.eic_code }));
  const aggregates: Reading[] = aggregateReadings.map((r) => ({ ...r, key: r.series }));

  // Créneaux communs aux deux tables ; un relevé horaire l'emporte sur un journalier au même instant
  const granularityAt = new Map<number, ReadingGranularity>();
  for (const r of [...readings, ...aggregates]) {
    const t = r.start_date.getTime();
    if (granularityAt.get(t) !== 'HOUR') granularityAt.set(t, r.granularity);
  }
  const times = [...granularityAt.keys()].sort((a, b) => a - b);
  const index = new Map(times.map((t, i) => [t, i]));

  const toMatrix = (rows: Reading[]) => {
    const matrix: Record<string, (number | null)[]> = {};
    for (const r of rows) {
      const t = r.start_date.getTime();
      if (r.granularity !== granularityAt.get(t)) continue;
      (matrix[r.key] ??= new Array(times.length).fill(null))[index.get(t)!] = r.value;
    }
    return matrix;
  };

  return {
    from: from.getTime(),
    to: to.getTime(),
    times,
    granularity: times.map((t) => granularityAt.get(t)!),
    series: toMatrix(readings),
    aggregates: toMatrix(aggregates),
    earliest: earliest._min.start_date?.getTime() ?? null,
    latest: latest._max.start_date?.getTime() ?? null,
    updatedAt: latest._max.updated_date?.getTime() ?? null,
  };
}
