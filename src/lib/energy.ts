import { prisma } from './prisma';
import type { GenerationSeries, PlantInfo, ReadingGranularity } from '@/types/energy';

const toDay = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

export async function listPlants(): Promise<PlantInfo[]> {
  const plants = await prisma.plant.findMany({
    include: { reactors: { orderBy: { name: 'asc' } } },
    orderBy: { capacity_mw: 'desc' },
  });

  return plants.map((plant) => ({
    id: plant.id,
    name: plant.name,
    full_name: plant.full_name,
    type: 'nuclear',
    operator: plant.operator,
    latitude: plant.latitude,
    longitude: plant.longitude,
    capacity_mw: plant.capacity_mw,
    commissioning_date: toDay(plant.commissioning_date),
    commune: plant.commune,
    departement: plant.departement,
    region: plant.region,
    wikidata_id: plant.wikidata_id,
    osm_id: plant.osm_id,
    contour: (plant.contour as [number, number][] | null) ?? null,
    reactors: plant.reactors.map((reactor) => ({
      eic_code: reactor.eic_code,
      name: reactor.name,
      capacity_mw: reactor.capacity_mw,
      commissioning_date: toDay(reactor.commissioning_date),
    })),
  }));
}

export async function getGenerationSeries(from: Date, to: Date): Promise<GenerationSeries> {
  const [readings, latest, earliest] = await Promise.all([
    prisma.productionReading.findMany({
      where: { start_date: { gte: from, lte: to } },
      select: { eic_code: true, start_date: true, granularity: true, value: true },
      orderBy: { start_date: 'asc' },
    }),
    prisma.productionReading.aggregate({
      _max: { start_date: true, updated_date: true },
      where: { granularity: 'HOUR' },
    }),
    prisma.productionReading.aggregate({ _min: { start_date: true } }),
  ]);

  const times: number[] = [];
  const granularity: ReadingGranularity[] = [];
  const index = new Map<number, number>();
  for (const reading of readings) {
    const t = reading.start_date.getTime();
    const i = index.get(t);
    if (i === undefined) {
      index.set(t, times.length);
      times.push(t);
      granularity.push(reading.granularity);
    } else if (reading.granularity === 'HOUR') {
      granularity[i] = 'HOUR';
    }
  }

  const series: Record<string, (number | null)[]> = {};
  for (const reading of readings) {
    const i = index.get(reading.start_date.getTime())!;
    // Un relevé journalier ne doit pas écraser un relevé horaire au même instant
    if (reading.granularity !== granularity[i]) continue;
    (series[reading.eic_code] ??= new Array(times.length).fill(null))[i] = reading.value;
  }

  return {
    from: from.getTime(),
    to: to.getTime(),
    times,
    granularity,
    series,
    earliest: earliest._min.start_date?.getTime() ?? null,
    latest: latest._max.start_date?.getTime() ?? null,
    updatedAt: latest._max.updated_date?.getTime() ?? null,
  };
}
