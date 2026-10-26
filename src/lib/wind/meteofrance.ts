import { fromArrayBuffer } from 'geotiff';
import type { Bounds, WindField } from './types';

// Modèles de Météo-France, API publique WCS : https://portail-api.meteofrance.fr — clé
// METEO_FRANCE_API_KEY, l'application devant être abonnée à l'API de chaque modèle.
// On prend le dernier run publié et l'échéance la plus proche de l'instant demandé.

export interface MeteoFranceModel {
  name: string; // affiché (bandeau du vent)
  url: string; // service WCS
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number }; // domaine couvert
}

const WCS_URL = 'https://public-api.meteofrance.fr/public';

// AROME HD : 0,01°, pas horaire, France et pays voisins
export const AROME_HD: MeteoFranceModel = {
  name: 'AROME HD (Météo-France)',
  url: `${WCS_URL}/arome/1.0/wcs/MF-NWP-HIGHRES-AROME-001-FRANCE-WCS`,
  bounds: { minLon: -12, maxLon: 16, minLat: 37.5, maxLat: 55.4 },
};

// ARPEGE Europe : 0,1°, pas horaire
export const ARPEGE_EUROPE: MeteoFranceModel = {
  name: 'ARPEGE 0,1° (Météo-France)',
  url: `${WCS_URL}/arpege/1.0/wcs/MF-NWP-GLOBAL-ARPEGE-01-EUROPE-WCS`,
  bounds: { minLon: -32, maxLon: 42, minLat: 20, maxLat: 72 },
};
const U_PREFIX = 'U_COMPONENT_OF_WIND__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND___';
const V_PREFIX = 'V_COMPONENT_OF_WIND__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND___';
const PHYSICAL_MAX = 150; // m/s : au-delà, valeur invalide (NoData non déclaré)

async function wcs(
  model: MeteoFranceModel,
  apiKey: string,
  operation: string,
  params: [string, string][]
): Promise<Response> {
  const url = new URL(`${model.url}/${operation}`);
  url.searchParams.set('service', 'WCS');
  url.searchParams.set('version', '2.0.1');
  for (const [key, value] of params) url.searchParams.append(key, value);
  const res = await fetch(url, { headers: { apikey: apiKey }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${model.name} ${operation} (${res.status}) : ${(await res.text()).slice(0, 200)}`);
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
  if (!begin || !coefficients?.trim()) throw new Error('Météo-France : axe temporel introuvable dans DescribeCoverage');

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

/** Vent à 10 m du modèle sur `bounds` (rognées au domaine du modèle), à l'échéance la plus proche de `target`. */
export async function fetchMeteoFrance(
  model: MeteoFranceModel,
  apiKey: string,
  requested: Bounds,
  target = new Date()
): Promise<WindField> {
  const bounds = {
    minLon: Math.max(requested.minLon, model.bounds.minLon),
    maxLon: Math.min(requested.maxLon, model.bounds.maxLon),
    minLat: Math.max(requested.minLat, model.bounds.minLat),
    maxLat: Math.min(requested.maxLat, model.bounds.maxLat),
  };
  const capabilities = await (await wcs(model, apiKey, 'GetCapabilities', [['language', 'eng']])).text();
  const uId = latestCoverage(capabilities, U_PREFIX);
  const vId = latestCoverage(capabilities, V_PREFIX);
  if (!uId || !vId) throw new Error(`${model.name} : composantes U/V introuvables dans GetCapabilities`);

  const description = await (await wcs(model, apiKey, 'DescribeCoverage', [['coverageID', uId]])).text();
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
      const res = await wcs(model, apiKey, 'GetCoverage', [['coverageID', id], ['format', 'image/tiff'], ...subsets]);
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

  return {
    model: model.name,
    width: uTiff.width,
    height: uTiff.height,
    u,
    v,
    bounds: uTiff.bounds,
    runTime: runTimeOf(uId),
    validTime,
  };
}
