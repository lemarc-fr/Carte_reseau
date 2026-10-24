import { fromArrayBuffer } from 'geotiff';
import type { Bounds, WindField } from './types';

// AROME HD de Météo-France (grille 0,01°, France et pays voisins), API publique WCS :
// https://portail-api.meteofrance.fr — clé METEO_FRANCE_API_KEY abonnée à « AROME ».
// On prend le dernier run publié et l'échéance la plus proche de l'instant demandé.

const BASE_URL =
  'https://public-api.meteofrance.fr/public/arome/1.0/wcs/MF-NWP-HIGHRES-AROME-001-FRANCE-WCS';
const U_PREFIX = 'U_COMPONENT_OF_WIND__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND___';
const V_PREFIX = 'V_COMPONENT_OF_WIND__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND___';
const PHYSICAL_MAX = 150; // m/s : au-delà, valeur invalide (NoData non déclaré)

async function wcs(apiKey: string, operation: string, params: [string, string][]): Promise<Response> {
  const url = new URL(`${BASE_URL}/${operation}`);
  url.searchParams.set('service', 'WCS');
  url.searchParams.set('version', '2.0.1');
  for (const [key, value] of params) url.searchParams.append(key, value);
  const res = await fetch(url, { headers: { apikey: apiKey }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`AROME ${operation} (${res.status}) : ${(await res.text()).slice(0, 200)}`);
  return res;
}

// "…___2026-10-23T12.00.00Z" -> date du run
export function runTimeOf(coverageId: string): Date | null {
  const match = coverageId.match(/___(\d{4}-\d{2}-\d{2}T\d{2})\.(\d{2})\.(\d{2})Z$/);
  return match ? new Date(`${match[1]}:${match[2]}:${match[3]}Z`) : null;
}

/** Identifiant de couverture du dernier run pour un préfixe (U ou V). */
export function latestCoverage(capabilities: string, prefix: string): string | null {
  const ids = [...capabilities.matchAll(/<wcs:CoverageId[^>]*>\s*([^<\s]+)\s*<\/wcs:CoverageId>/g)]
    .map((m) => m[1])
    .filter((id) => id.startsWith(prefix) && runTimeOf(id));
  return ids.sort((a, b) => runTimeOf(b)!.getTime() - runTimeOf(a)!.getTime())[0] ?? null;
}

/** Échéances de la couverture (epoch ms), lues sur l'axe « time » de DescribeCoverage. */
export function validTimes(description: string): number[] {
  const begin = description.match(/<gml:beginPosition[^>]*>\s*([^<\s]+)\s*<\/gml:beginPosition>/)?.[1];
  const timeAxis = [...description.matchAll(/<gmlrgrid:GeneralGridAxis[^>]*>([\s\S]*?)<\/gmlrgrid:GeneralGridAxis>/g)]
    .map((m) => m[1])
    .find((axis) => /<gmlrgrid:gridAxesSpanned[^>]*>\s*time\s*</.test(axis));
  const coefficients = timeAxis?.match(/<gmlrgrid:coefficients[^>]*>([^<]*)<\/gmlrgrid:coefficients>/)?.[1];
  if (!begin || !coefficients?.trim()) throw new Error('AROME : axe temporel introuvable dans DescribeCoverage');

  const base = Date.parse(begin);
  return coefficients.trim().split(/\s+/).map((seconds) => base + Number(seconds) * 1000);
}

/** Élément de `times` le plus proche de `target`. */
export function nearest(times: number[], target: number): number {
  return times.reduce((best, t) => (Math.abs(t - target) < Math.abs(best - target) ? t : best));
}

async function readGeoTiff(buffer: ArrayBuffer) {
  const image = await (await fromArrayBuffer(buffer)).getImage();
  const raster = (await image.readRasters({ interleave: true })) as unknown as ArrayLike<number>;
  const [minLon, minLat, maxLon, maxLat] = image.getBoundingBox();
  const [resX, resY] = image.getResolution();
  return {
    width: image.getWidth(),
    height: image.getHeight(),
    raster,
    nodata: image.getGDALNoData(),
    // Bords de la boîte -> centres des pixels extrêmes
    bounds: {
      minLon: minLon + resX / 2,
      maxLon: maxLon - resX / 2,
      minLat: minLat - resY / 2,
      maxLat: maxLat + resY / 2,
    } satisfies Bounds,
  };
}

export async function fetchArome(apiKey: string, bounds: Bounds, target = new Date()): Promise<WindField> {
  const capabilities = await (await wcs(apiKey, 'GetCapabilities', [['language', 'eng']])).text();
  const uId = latestCoverage(capabilities, U_PREFIX);
  const vId = latestCoverage(capabilities, V_PREFIX);
  if (!uId || !vId) throw new Error('AROME : composantes U/V introuvables dans GetCapabilities');

  const description = await (await wcs(apiKey, 'DescribeCoverage', [['coverageID', uId]])).text();
  const validTime = new Date(nearest(validTimes(description), target.getTime()));
  const time = validTime.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const subsets: [string, string][] = [
    ['subset', `long(${bounds.minLon},${bounds.maxLon})`],
    ['subset', `lat(${bounds.minLat},${bounds.maxLat})`],
    ['subset', 'height(10)'],
    ['subset', `time(${time})`],
  ];
  const [uTiff, vTiff] = await Promise.all(
    [uId, vId].map(async (id) => {
      const res = await wcs(apiKey, 'GetCoverage', [['coverageID', id], ['format', 'image/tiff'], ...subsets]);
      return readGeoTiff(await res.arrayBuffer());
    })
  );

  const size = uTiff.width * uTiff.height;
  const u = new Float32Array(size);
  const v = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const [ui, vi] = [uTiff.raster[i], vTiff.raster[i]];
    const valid =
      Number.isFinite(ui) && Number.isFinite(vi) &&
      ui !== uTiff.nodata && vi !== vTiff.nodata &&
      Math.abs(ui) <= PHYSICAL_MAX && Math.abs(vi) <= PHYSICAL_MAX;
    u[i] = valid ? ui : NaN;
    v[i] = valid ? vi : NaN;
  }

  return { width: uTiff.width, height: uTiff.height, u, v, bounds: uTiff.bounds, runTime: runTimeOf(uId), validTime };
}
