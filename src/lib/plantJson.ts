import type { PlantInfo, UnitInfo } from '@/types/energy';

// /api/plants omet les champs nuls (un tiers du volume pour ~20 000 sites) : on les
// remet ici, côté client, pour respecter PlantInfo.

type Compact<T> = { [K in keyof T]?: T[K] };
export type CompactPlant = Compact<Omit<PlantInfo, 'units'>> & { units?: Compact<UnitInfo>[] };

const PLANT_NULLS = {
  technology: null,
  operator: null,
  commissioning_date: null,
  commune: null,
  departement: null,
  region: null,
  region_code: null,
  installations: null,
  wikidata_id: null,
  osm_id: null,
  contour: null,
} satisfies Partial<PlantInfo>;

const UNIT_NULLS = { capacity_mw: null, commissioning_date: null } satisfies Partial<UnitInfo>;

export function expandPlant(plant: CompactPlant): PlantInfo {
  return {
    ...PLANT_NULLS,
    ...plant,
    units: (plant.units ?? []).map((unit) => ({ ...UNIT_NULLS, ...unit })),
  } as PlantInfo;
}
