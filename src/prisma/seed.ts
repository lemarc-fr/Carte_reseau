import 'dotenv/config';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '@/lib/prisma';
import { linkUnitsToPlants } from '@/lib/power/fr/unitPlants';

// Usage : npm run db:seed
// Remplit `plants` et `units` à partir des jeux de données consolidés :
//   dataset/fr/final/
//     NUCLEAR.json, HYDRO.json   centrales au format OSM + Wikidata + registre ODRE
//     WIND.json, SOLAR.json, THERMAL.json, BIOENERGY.json, BATTERY.json, MARINE.json
//                                sites regroupés par commune (dataset/fr/scripts/registre.py)
//   dataset/<pays>/final/PLANTS.json
//                                autres pays, même format (dataset/eu/scripts/powerplantmatching.py)
// Idempotent : peut être rejoué sans risque (upserts). Les sites retirés d'un jeu de
// données sont supprimés.

const COUNTRY = 'FR';
const SEED_CONCURRENCY = 8;
const DATASET_DIR = join(process.cwd(), 'dataset');
const FINAL_DIR = join(DATASET_DIR, 'fr', 'final');

// Tolérance de simplification des contours (degrés, ~10 m)
const CONTOUR_TOLERANCE_DEG = 0.0001;

// Noms tels que publiés par l'API RTE actual_generations_per_unit
const REACTORS: { eic_code: string; name: string }[] = [
  { eic_code: '17W100P100P0135M', name: 'GRAVELINES 5' },
  { eic_code: '17W100P100P0136K', name: 'GRAVELINES 6' },
  { eic_code: '17W100P100P0133Q', name: 'GRAVELINES 4' },
  { eic_code: '17W100P100P0130W', name: 'GRAVELINES 1' },
  { eic_code: '17W100P100P0132S', name: 'GRAVELINES 3' },
  { eic_code: '17W100P100P0131U', name: 'GRAVELINES 2' },
  { eic_code: '17W100P100P0141R', name: 'PALUEL 3' },
  { eic_code: '17W100P100P0142P', name: 'PALUEL 4' },
  { eic_code: '17W100P100P0140T', name: 'PALUEL 2' },
  { eic_code: '17W100P100P0139E', name: 'PALUEL 1' },
  { eic_code: '17W100P100P0103Z', name: 'CATTENOM 2' },
  { eic_code: '17W100P100P0105V', name: 'CATTENOM 4' },
  { eic_code: '17W100P100P01012', name: 'CATTENOM 1' },
  { eic_code: '17W100P100P0104X', name: 'CATTENOM 3' },
  { eic_code: '17W100P100P0126N', name: 'FLAMANVILLE 1' },
  { eic_code: '17W100P100P03639', name: 'FLAMANVILLE 3' },
  { eic_code: '17W100P100P0127L', name: 'FLAMANVILLE 2' },
  { eic_code: '17W100P100P0107R', name: 'CHINON 2' },
  { eic_code: '17W100P100P0106T', name: 'CHINON 1' },
  { eic_code: '17W100P100P0108P', name: 'CHINON 3' },
  { eic_code: '17W100P100P0109N', name: 'CHINON 4' },
  { eic_code: '17W100P100P0093C', name: 'BLAYAIS 2' },
  { eic_code: '17W100P100P0094A', name: 'BLAYAIS 3' },
  { eic_code: '17W100P100P00958', name: 'BLAYAIS 4' },
  { eic_code: '17W100P100P0092E', name: 'BLAYAIS 1' },
  { eic_code: '17W100P100P0116Q', name: 'CRUAS 2' },
  { eic_code: '17W100P100P0118M', name: 'CRUAS 3' },
  { eic_code: '17W100P100P0115S', name: 'CRUAS 1' },
  { eic_code: '17W100P100P0119K', name: 'CRUAS 4' },
  { eic_code: '17W100P100P0152M', name: 'TRICASTIN 3' },
  { eic_code: '17W100P100P0150Q', name: 'TRICASTIN 2' },
  { eic_code: '17W100P100P0153K', name: 'TRICASTIN 4' },
  { eic_code: '17W100P100P0149B', name: 'TRICASTIN 1' },
  { eic_code: '17W100P100P00966', name: 'BUGEY 2' },
  { eic_code: '17W100P100P00974', name: 'BUGEY 3' },
  { eic_code: '17W100P100P01004', name: 'BUGEY 5' },
  { eic_code: '17W100P100P00982', name: 'BUGEY 4' },
  { eic_code: '17W100P100P0122V', name: 'DAMPIERRE 3' },
  { eic_code: '17W100P100P0121X', name: 'DAMPIERRE 2' },
  { eic_code: '17W100P100P0120Z', name: 'DAMPIERRE 1' },
  { eic_code: '17W100P100P0123T', name: 'DAMPIERRE 4' },
  { eic_code: '17W100P100P0112Y', name: 'CHOOZ 2' },
  { eic_code: '17W100P100P01101', name: 'CHOOZ 1' },
  { eic_code: '17W100P100P0114U', name: 'CIVAUX 2' },
  { eic_code: '17W100P100P0113W', name: 'CIVAUX 1' },
  { eic_code: '17W100P100P0145J', name: 'ST ALBAN 1' },
  { eic_code: '17W100P100P0146H', name: 'ST ALBAN 2' },
  { eic_code: '17W100P100P0143N', name: 'PENLY 1' },
  { eic_code: '17W100P100P0144L', name: 'PENLY 2' },
  { eic_code: '17W100P100P0137I', name: 'NOGENT 1' },
  { eic_code: '17W100P100P0138G', name: 'NOGENT 2' },
  { eic_code: '17W100P100P0091G', name: 'BELLEVILLE 2' },
  { eic_code: '17W100P100P0090I', name: 'BELLEVILLE 1' },
  { eic_code: '17W100P100P0129H', name: 'GOLFECH 2' },
  { eic_code: '17W100P100P0128J', name: 'GOLFECH 1' },
  { eic_code: '17W100P100P0148D', name: 'ST LAURENT 2' },
  { eic_code: '17W100P100P0147F', name: 'ST LAURENT 1' },
];

// ─── Types des jeux de données ───────────────────────────────────────────────

type LatLon = { lat?: number; lon?: number };

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  geometry?: LatLon[];
  members?: { role?: string; geometry?: LatLon[] }[];
}

interface OdreRecord {
  puismaxinstallee: number | null; // kW
  datemiseenservice_date: string | null;
  commune: string | null;
  departement: string | null;
  region: string | null;
  coderegion: string | null;
  technologie: string | null;
  regime: string | null;
}

// Format OSM + Wikidata + ODRE (NUCLEAR.json, HYDRO.json)
interface OsmDatasetPlant {
  name: string;
  english_name: string | null;
  operator: string | null;
  output: string | null;
  method?: string | null;
  wikidata_id: string | null;
  detail_page_data: { osm_details: { elements: OsmElement[] } };
  wikidata_details: {
    latitude: number | null;
    longitude: number | null;
    power_mw?: number | null;
    eics: Record<string, OdreRecord | null> | null;
  };
}

// Format des jeux produits par registre.py
interface RegistrySite {
  id: string;
  name: string;
  full_name: string;
  production_type: string; // WIND, SOLAR, GAS, OIL, COAL, BIOENERGY, BATTERY, HYDRO
  technology: string | null;
  commune: string | null;
  departement: string | null;
  region: string | null;
  region_code: string | null;
  latitude: number;
  longitude: number;
  capacity_mw: number;
  commissioning_date: string | null;
  installations: number;
  units: {
    eic_code: string;
    name: string;
    production_type?: string; // type ENTSO-E (autres pays) ; déduit de la filière en France
    capacity_mw: number | null;
    commissioning_date: string | null;
  }[];
}

type PlantData = Parameters<typeof prisma.plant.create>[0]['data'];
type UnitData = {
  eic_code: string;
  name: string;
  production_type: string;
  country?: string;
  capacity_mw: number | null;
  commissioning_date: Date | null;
};

const readDataset = <T>(file: string, dir = FINAL_DIR) => JSON.parse(readFileSync(join(dir, file), 'utf-8')) as T[];

// ─── Géométrie ───────────────────────────────────────────────────────────────

type Coord = [number, number];

function toRing(geometry?: LatLon[]): Coord[] | null {
  const ring = (geometry ?? [])
    .filter((p): p is Required<LatLon> => typeof p.lat === 'number' && typeof p.lon === 'number')
    .map((p) => [p.lon, p.lat] as Coord);
  if (ring.length < 3) return null;
  const [first, last] = [ring[0], ring[ring.length - 1]];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
  return ring;
}

function ringArea(ring: Coord[]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area / 2);
}

// Les relations OSM sont découpées en plusieurs ways : on garde le plus grand
// anneau extérieur, suffisant pour dessiner l'emprise du site.
function largestOuterRing(element: OsmElement): Coord[] | null {
  const candidates = [
    toRing(element.geometry),
    ...(element.members ?? [])
      .filter((m) => !m.role || m.role === 'outer')
      .map((m) => toRing(m.geometry)),
  ].filter((r): r is Coord[] => r !== null);

  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a));
}

function perpendicularDistance(p: Coord, a: Coord, b: Coord): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplify(points: Coord[], tolerance: number): Coord[] {
  if (points.length < 3) return points;
  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDistance) {
      maxDistance = d;
      index = i;
    }
  }
  if (maxDistance <= tolerance) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, index + 1), tolerance);
  const right = simplify(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

function centroid(ring: Coord[]): Coord {
  const pts = ring.slice(0, -1);
  const sum = pts.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]] as Coord, [0, 0] as Coord);
  return [sum[0] / pts.length, sum[1] / pts.length];
}

const round = (value: number, decimals: number) => Number(value.toFixed(decimals));

// ─── Noms et identifiants ────────────────────────────────────────────────────

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// "Centrale hydroélectrique de Bort" -> "Bort", "STEP Montézic" -> "Montézic",
// "Centrale de La Bathie" -> "La Bathie" (l'article du nom propre est conservé)
const HYDRO_NAME_PREFIX =
  /^(?:[Cc]entrale (?:hydro-?électrique|électrique|hydraulique)|[Cc]entrale|[Uu]sine (?:hydroélectrique|du barrage)|[Uu]sine|[Bb]arrage-usine|[Bb]arrage|[Aa]ménagement hydroélectrique|[Cc]hute|STEP)\s+(?:de la |de l'|de |du |des |d')?/;

function hydroShortName(name: string): string {
  return name.replace(HYDRO_NAME_PREFIX, '').replace(/\s+STEP$/, '').trim() || name;
}

// ─── Centrales au format OSM (nucléaire, hydraulique) ────────────────────────

function osmPlant(record: OsmDatasetPlant, id: string, name: string) {
  const element = record.detail_page_data.osm_details.elements[0];
  const ring = element ? largestOuterRing(element) : null;
  const contour = ring
    ? simplify(ring, CONTOUR_TOLERANCE_DEG).map(([lon, lat]) => [round(lon, 6), round(lat, 6)] as Coord)
    : null;

  const { latitude, longitude } = record.wikidata_details;
  const [lon, lat] =
    typeof latitude === 'number' && typeof longitude === 'number'
      ? [longitude, latitude]
      : ring
        ? centroid(ring)
        : [NaN, NaN];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const records = Object.values(record.wikidata_details.eics ?? {}).filter(
    (r): r is OdreRecord => r !== null && (!r.regime || r.regime === 'En service')
  );
  const location = records[0];
  const dates = records
    .map((r) => r.datemiseenservice_date)
    .filter((d): d is string => !!d)
    .sort();

  return {
    records,
    plant: {
      id,
      country: COUNTRY,
      name,
      full_name: record.name,
      operator: record.operator,
      latitude: round(lat, 6),
      longitude: round(lon, 6),
      capacity_mw: records.reduce((sum, r) => sum + (r.puismaxinstallee ?? 0) / 1000, 0),
      commissioning_date: dates[0] ? new Date(dates[0]) : null,
      commune: location?.commune ?? null,
      departement: location?.departement ?? null,
      region: location?.region ?? null,
      region_code: location?.coderegion ?? null,
      wikidata_id: record.wikidata_id,
      osm_id: element ? `${element.type}/${element.id}` : null,
      contour: contour ?? undefined,
    } satisfies Partial<PlantData>,
  };
}

function nuclearPlants() {
  const known = new Map(REACTORS.map((r) => [r.eic_code, r.name]));
  return readDataset<OsmDatasetPlant>('NUCLEAR.json').map((record) => {
    const name = (record.english_name ?? record.name).replace(/\s+Nuclear Power Plant$/i, '').trim();
    const built = osmPlant(record, slugify(name), name);
    if (!built) throw new Error(`Aucune position pour ${record.name}`);
    const units: UnitData[] = Object.entries(record.wikidata_details.eics ?? {})
      .filter((entry): entry is [string, OdreRecord] => entry[1] !== null && known.has(entry[0]))
      .map(([eic_code, odre]) => ({
        eic_code,
        name: known.get(eic_code)!,
        production_type: 'NUCLEAR',
        capacity_mw: odre.puismaxinstallee ? odre.puismaxinstallee / 1000 : null,
        commissioning_date: odre.datemiseenservice_date ? new Date(odre.datemiseenservice_date) : null,
      }));
    // Capacité du site = réacteurs suivis par RTE (les anciens réacteurs arrêtés sont exclus)
    const capacity = units.reduce((sum, u) => sum + (u.capacity_mw ?? 0), 0);
    return { plant: { ...built.plant, production_type: 'NUCLEAR', capacity_mw: capacity }, units };
  });
}

function hydroPlants() {
  const used = new Set<string>();
  const result: { plant: PlantData; units: UnitData[] }[] = [];
  for (const record of readDataset<OsmDatasetPlant>('HYDRO.json')) {
    const name = hydroShortName(record.name);
    let id = `hydro-${slugify(name)}`;
    for (let n = 2; used.has(id); n++) id = `hydro-${slugify(name)}-${n}`;
    used.add(id);

    const built = osmPlant(record, id, name);
    if (!built) {
      console.warn(`  hydraulique ignorée (sans position) : ${record.name}`);
      continue;
    }
    const technologies = built.records.map((r) => r.technologie).filter((t): t is string => !!t);
    const pumped = record.method === 'water-pumped-storage' || technologies.includes('Pompage turbinage');
    const technology = technologies.sort(
      (a, b) => technologies.filter((t) => t === b).length - technologies.filter((t) => t === a).length
    )[0];
    const capacity =
      built.plant.capacity_mw ||
      record.wikidata_details.power_mw ||
      Number.parseFloat((record.output ?? '').replace(/,/g, '')) ||
      0;
    if (!capacity) {
      console.warn(`  hydraulique ignorée (puissance inconnue) : ${record.name}`);
      continue;
    }
    result.push({
      plant: {
        ...built.plant,
        production_type: pumped ? 'PUMPED_STORAGE' : 'HYDRO',
        technology: pumped ? 'Pompage-turbinage' : (technology ?? null),
        capacity_mw: capacity,
      },
      units: [], // groupes RTE rattachés par nom (unitPlants.ts) une fois ingérés
    });
  }
  return result;
}

// Type RTE des groupes déclarés par les jeux du registre (production_type du site -> groupe)
const UNIT_TYPES: Record<string, string> = {
  WIND: 'WIND_OFFSHORE',
  GAS: 'FOSSIL_GAS',
  OIL: 'FOSSIL_OIL',
  COAL: 'FOSSIL_HARD_COAL',
  BIOENERGY: 'BIOMASS',
  BATTERY: 'OTHER',
  HYDRO: 'HYDRO_RUN_OF_RIVER_AND_POUNDAGE',
  SOLAR: 'SOLAR',
};

function registryPlants(file: string, country = COUNTRY, dir = FINAL_DIR) {
  return readDataset<RegistrySite>(file, dir).map((site) => ({
    plant: {
      id: site.id,
      country,
      name: site.name,
      full_name: site.full_name,
      production_type: site.production_type,
      technology: site.technology,
      latitude: site.latitude,
      longitude: site.longitude,
      capacity_mw: site.capacity_mw,
      commissioning_date: site.commissioning_date ? new Date(site.commissioning_date) : null,
      commune: site.commune,
      departement: site.departement,
      region: site.region,
      region_code: site.region_code,
      installations: site.installations,
    } satisfies PlantData,
    units: site.units.map((u) => ({
      eic_code: u.eic_code,
      name: u.name,
      production_type: u.production_type ?? UNIT_TYPES[site.production_type],
      country,
      capacity_mw: u.capacity_mw,
      commissioning_date: u.commissioning_date ? new Date(u.commissioning_date) : null,
    })),
  }));
}

/** Autres pays : dataset/<pays>/final/PLANTS.json */
function otherCountries() {
  return readdirSync(DATASET_DIR)
    .filter((dir) => /^[a-z]{2}$/.test(dir) && dir !== 'fr' && existsSync(join(DATASET_DIR, dir, 'final', 'PLANTS.json')))
    .sort()
    .map((dir) => {
      const country = dir.toUpperCase();
      return { label: country, country, plants: registryPlants('PLANTS.json', country, join(DATASET_DIR, dir, 'final')) };
    });
}

async function main() {
  const datasets = [
    { label: 'Nucléaire', country: COUNTRY, plants: nuclearPlants() },
    { label: 'Hydraulique', country: COUNTRY, plants: hydroPlants() },
    { label: 'Éolien', country: COUNTRY, plants: registryPlants('WIND.json') },
    { label: 'Solaire', country: COUNTRY, plants: registryPlants('SOLAR.json') },
    { label: 'Thermique', country: COUNTRY, plants: registryPlants('THERMAL.json') },
    { label: 'Bioénergies', country: COUNTRY, plants: registryPlants('BIOENERGY.json') },
    { label: 'Batteries', country: COUNTRY, plants: registryPlants('BATTERY.json') },
    { label: 'Marin', country: COUNTRY, plants: registryPlants('MARINE.json') },
    ...otherCountries(),
  ];

  for (const { label, plants } of datasets) {
    let units = 0;
    // Upserts par lots parallèles (pool de connexions du driver pg)
    for (let i = 0; i < plants.length; i += SEED_CONCURRENCY) {
      await Promise.all(
        plants.slice(i, i + SEED_CONCURRENCY).map(async ({ plant, units: plantUnits }) => {
          await prisma.plant.upsert({ where: { id: plant.id }, update: plant, create: plant });
          for (const unit of plantUnits) {
            const { eic_code, ...fields } = unit;
            await prisma.unit.upsert({
              where: { eic_code },
              update: { ...fields, plant_id: plant.id },
              create: { ...unit, plant_id: plant.id },
            });
            units++;
          }
        })
      );
    }
    const capacity = plants.reduce((sum, p) => sum + (p.plant.capacity_mw ?? 0), 0);
    console.log(`${label.padEnd(12)} ${String(plants.length).padStart(5)} sites  ${String(units).padStart(3)} groupes  ${Math.round(capacity)} MW`);
  }

  // Sites retirés des jeux de données (leurs groupes restent, détachés : ON DELETE SET NULL)
  for (const country of new Set(datasets.map((d) => d.country))) {
    const ids = datasets.filter((d) => d.country === country).flatMap((d) => d.plants.map((p) => p.plant.id));
    const { count: removed } = await prisma.plant.deleteMany({ where: { country, id: { notIn: ids } } });
    if (removed) console.log(`${country} : ${removed} site(s) retiré(s) des jeux de données supprimé(s).`);
  }

  // Groupes retirés d'un jeu (ex. codes EIC remplacés par des BMU) : détachés de leur site.
  // Les groupes RTE rattachés par leur nom le sont de nouveau juste après.
  for (const country of new Set(datasets.map((d) => d.country))) {
    const eics = datasets
      .filter((d) => d.country === country)
      .flatMap((d) => d.plants.flatMap((p) => p.units.map((u) => u.eic_code)));
    const { count: detached } = await prisma.unit.updateMany({
      where: { plant: { country }, eic_code: { notIn: eics } },
      data: { plant_id: null },
    });
    if (detached) console.log(`${country} : ${detached} groupe(s) retiré(s) des jeux de données détaché(s).`);
  }

  const linked = await linkUnitsToPlants();
  console.log(`${linked} groupe(s) RTE rattaché(s) par leur nom.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
