import { join } from 'node:path';

// Format des fichiers dataset/seed/<pays>.json, produits par build.ts et lus par seed.ts.
// Chaque objet correspond exactement à une ligne de la base : seed.ts n'applique aucune
// transformation. Les dates sont en ISO 8601 complet. Une clé absente n'est pas gérée par
// le seed et garde sa valeur en base.

export const DATASET_DIR = join(process.cwd(), 'dataset');
export const SEED_DIR = join(DATASET_DIR, 'seed');

export interface SeedUnit {
  eic_code: string;
  name: string;
  production_type: string;
  country: string;
  capacity_mw: number | null;
  commissioning_date: string | null;
}

export interface SeedPlant {
  id: string;
  country: string;
  name: string;
  full_name: string;
  production_type: string;
  technology?: string | null;
  operator?: string | null;
  latitude: number;
  longitude: number;
  capacity_mw: number;
  commissioning_date: string | null;
  commune: string | null;
  departement: string | null;
  region: string | null;
  region_code: string | null;
  installations?: number;
  wikidata_id?: string | null;
  osm_id?: string | null;
  contour?: [number, number][];
  units: SeedUnit[];
}

export interface SeedDataset {
  label: string;
  plants: SeedPlant[];
}

export interface SeedFile {
  country: string;
  datasets: SeedDataset[];
}
