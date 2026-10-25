import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Cohérence des jeux de données lus par le seed, au format du registre :
// dataset/fr/final (France) et dataset/<pays>/final/PLANTS.json (autres pays)

interface RegistrySite {
  id: string;
  name: string;
  production_type: string;
  region_code: string | null;
  latitude: number;
  longitude: number;
  capacity_mw: number;
  units: { eic_code: string; capacity_mw: number | null; production_type?: string }[];
}

const ALL_TYPES = ['NUCLEAR', 'HYDRO', 'PUMPED_STORAGE', 'WIND', 'SOLAR', 'GAS', 'COAL', 'OIL', 'BIOENERGY', 'BATTERY'];
const DATASET_DIR = join(process.cwd(), 'dataset');

const FILES: Record<string, string[]> = {
  'WIND.json': ['WIND'],
  'SOLAR.json': ['SOLAR'],
  'THERMAL.json': ['GAS', 'OIL', 'COAL'],
  'BIOENERGY.json': ['BIOENERGY'],
  'BATTERY.json': ['BATTERY'],
  'MARINE.json': ['HYDRO'],
};

const read = (path: string): RegistrySite[] => JSON.parse(readFileSync(join(DATASET_DIR, path), 'utf8'));

const datasets = [
  ...Object.entries(FILES).map(([file, types]) => ({ file: `fr/final/${file}`, types })),
  ...readdirSync(DATASET_DIR)
    .filter((dir) => /^[a-z]{2}$/.test(dir) && existsSync(join(DATASET_DIR, dir, 'final', 'PLANTS.json')))
    .map((dir) => ({ file: `${dir}/final/PLANTS.json`, types: ALL_TYPES })),
].map((d) => ({ ...d, sites: read(d.file) }));

describe.each(datasets)('$file', ({ file, types, sites }) => {
  it('contient des sites', () => {
    expect(sites.length).toBeGreaterThan(0);
  });

  it('a des filières, positions et puissances valides', () => {
    for (const site of sites) {
      expect(types, site.id).toContain(site.production_type);
      expect(site.name, site.id).toBeTruthy();
      expect(site.capacity_mw, site.id).toBeGreaterThan(0);
      // Métropole et outre-mer : seulement des coordonnées plausibles
      expect(Math.abs(site.latitude), site.id).toBeLessThanOrEqual(90);
      expect(Math.abs(site.longitude), site.id).toBeLessThanOrEqual(180);
      expect(site.latitude !== 0 || site.longitude !== 0, site.id).toBe(true);
    }
  });

  // Groupes publiés par RTE et ENTSO-E (100 MW ou plus) ; au Royaume-Uni, les BMU
  // d'Elexon sont publiées quelle que soit leur taille, la centrale fait 100 MW ou plus
  it.skipIf(file.startsWith('gb/'))('ne liste que des groupes de 100 MW ou plus', () => {
    for (const unit of sites.flatMap((s) => s.units)) {
      if (unit.capacity_mw !== null) expect(unit.capacity_mw, unit.eic_code).toBeGreaterThanOrEqual(100);
    }
  });

  it.skipIf(file.startsWith('fr/'))('ne contient que des centrales de 100 MW ou plus', () => {
    for (const site of sites) expect(site.capacity_mw, site.id).toBeGreaterThanOrEqual(100);
  });
});

describe('ensemble des jeux', () => {
  it('a des identifiants de sites et de groupes uniques', () => {
    const ids = datasets.flatMap((d) => d.sites.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    const eics = datasets.flatMap((d) => d.sites.flatMap((s) => s.units.map((u) => u.eic_code)));
    expect(new Set(eics).size).toBe(eics.length);
  });
});
