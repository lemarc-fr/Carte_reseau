import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Usage : npm run db:seed
// Remplit `plants` (18 CNPE) et `reactors` (57 réacteurs suivis par RTE) à partir
// du jeu de données consolidé dataset/Finie/NUCLEAR.json (OSM + Wikidata + ODRE).
// Idempotent : peut être rejoué sans risque (upserts).

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DATASET_PATH = join(process.cwd(), 'dataset', 'Finie', 'NUCLEAR.json');

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

// ─── Types du jeu de données ─────────────────────────────────────────────────

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
}

interface DatasetPlant {
  name: string;
  english_name: string;
  operator: string | null;
  wikidata_id: string | null;
  detail_page_data: { osm_details: { elements: OsmElement[] } };
  wikidata_details: {
    latitude: number | null;
    longitude: number | null;
    eics: Record<string, OdreRecord | null> | null;
  };
}

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

// ─── Construction des enregistrements ────────────────────────────────────────

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildPlant(record: DatasetPlant) {
  const shortName = record.english_name.replace(/\s+Nuclear Power Plant$/i, '').trim();
  const element = record.detail_page_data.osm_details.elements[0];
  const ring = element ? largestOuterRing(element) : null;
  const contour = ring
    ? simplify(ring, CONTOUR_TOLERANCE_DEG).map(([lon, lat]) => [round(lon, 6), round(lat, 6)] as Coord)
    : null;

  const { latitude, longitude, eics } = record.wikidata_details;
  const [lon, lat] =
    typeof latitude === 'number' && typeof longitude === 'number'
      ? [longitude, latitude]
      : ring
        ? centroid(ring)
        : [NaN, NaN];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`Aucune position pour ${record.name}`);
  }

  const knownEics = new Set(REACTORS.map((r) => r.eic_code));
  const reactors = Object.entries(eics ?? {})
    .filter((entry): entry is [string, OdreRecord] => entry[1] !== null && knownEics.has(entry[0]))
    .map(([eic_code, odre]) => ({
      eic_code,
      capacity_mw: odre.puismaxinstallee ? odre.puismaxinstallee / 1000 : null,
      commissioning_date: odre.datemiseenservice_date ? new Date(odre.datemiseenservice_date) : null,
      odre,
    }));

  const commissioningDates = reactors
    .map((r) => r.commissioning_date)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  const location = reactors[0]?.odre;

  return {
    plant: {
      id: slugify(shortName),
      name: shortName,
      full_name: record.name,
      production_type: 'NUCLEAR',
      operator: record.operator,
      latitude: round(lat, 6),
      longitude: round(lon, 6),
      capacity_mw: reactors.reduce((sum, r) => sum + (r.capacity_mw ?? 0), 0),
      commissioning_date: commissioningDates[0] ?? null,
      commune: location?.commune ?? null,
      departement: location?.departement ?? null,
      region: location?.region ?? null,
      wikidata_id: record.wikidata_id,
      osm_id: element ? `${element.type}/${element.id}` : null,
      contour: contour ?? undefined,
    },
    reactors: reactors.map(({ eic_code, capacity_mw, commissioning_date }) => ({
      eic_code,
      capacity_mw,
      commissioning_date,
    })),
  };
}

async function main() {
  const dataset = JSON.parse(readFileSync(DATASET_PATH, 'utf-8')) as DatasetPlant[];
  const names = new Map(REACTORS.map((r) => [r.eic_code, r.name]));
  let reactorCount = 0;

  for (const record of dataset) {
    const { plant, reactors } = buildPlant(record);
    await prisma.plant.upsert({ where: { id: plant.id }, update: plant, create: plant });

    for (const reactor of reactors) {
      const data = {
        ...reactor,
        name: names.get(reactor.eic_code)!,
        production_type: 'NUCLEAR',
        plant_id: plant.id,
      };
      await prisma.reactor.upsert({ where: { eic_code: reactor.eic_code }, update: data, create: data });
      reactorCount++;
    }
    console.log(`${plant.name.padEnd(18)} ${String(reactors.length).padStart(2)} réacteurs  ${plant.capacity_mw} MW`);
  }

  console.log(`${dataset.length} centrales et ${reactorCount} réacteurs insérés/mis à jour.`);
  if (reactorCount !== REACTORS.length) {
    console.warn(`Attention : ${REACTORS.length - reactorCount} réacteur(s) RTE sans centrale associée.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
