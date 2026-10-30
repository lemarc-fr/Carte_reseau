import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { EUROPE_WIND_BOUNDS, FRANCE_WIND_BOUNDS } from '@/config/mapConfig';
import { fetchGfs } from './gfs';
import { AROME_HD, ARPEGE_EUROPE, fetchMeteoFrance } from './meteofrance';
import { encodeWind, hasData } from './texture';
import type { WindField } from './types';

// Téléchargement et traitement réels du vent (npm run test:integration).

const HOUR = 3_600_000;
const apiKey = process.env.METEO_FRANCE_API_KEY ?? '';

/** Part des points du champ avec une donnée, et vitesse maximale. */
function stats(field: WindField) {
  let valid = 0;
  let max = 0;
  for (let i = 0; i < field.u.length; i++) {
    if (Number.isNaN(field.u[i])) continue;
    valid++;
    max = Math.max(max, Math.hypot(field.u[i], field.v[i]));
  }
  return { validShare: valid / field.u.length, maxSpeed: max };
}

function expectPlausible(field: WindField, minValidShare: number) {
  expect(field.u).toHaveLength(field.width * field.height);
  expect(field.v).toHaveLength(field.width * field.height);
  const { validShare, maxSpeed } = stats(field);
  expect(validShare).toBeGreaterThan(minValidShare);
  expect(maxSpeed).toBeGreaterThan(1); // un champ tout à zéro trahit un décodage raté
  expect(maxSpeed).toBeLessThan(80); // m/s à 10 m
  // Échéance proche de maintenant, run plus ancien que l'échéance
  expect(Math.abs(field.validTime.getTime() - Date.now())).toBeLessThan(6 * HOUR);
  if (field.runTime) expect(field.runTime.getTime()).toBeLessThanOrEqual(field.validTime.getTime());
}

/** Alpha (0-255) des pixels d'une texture webp. */
async function alpha(webp: Uint8Array): Promise<Uint8Array> {
  const { data } = await sharp(Buffer.from(webp)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return Uint8Array.from({ length: data.length / 4 }, (_, i) => data[i * 4 + 3]);
}

describe.skipIf(!apiKey)('téléchargement', () => {
  let arpege: WindField;
  let arome: WindField;
  let gfs: WindField;

  beforeAll(async () => {
    arpege = await fetchMeteoFrance(ARPEGE_EUROPE, apiKey, EUROPE_WIND_BOUNDS);
    [arome, gfs] = await Promise.all([
      fetchMeteoFrance(AROME_HD, apiKey, FRANCE_WIND_BOUNDS, arpege.validTime),
      fetchGfs(EUROPE_WIND_BOUNDS),
    ]);
  });

  it('ARPEGE couvre l’Europe au pas de 0,1°', () => {
    expect(arpege.model).toMatch(/ARPEGE/);
    expect(arpege.bounds.minLon).toBeCloseTo(EUROPE_WIND_BOUNDS.minLon, 0);
    expect(arpege.bounds.maxLat).toBeCloseTo(EUROPE_WIND_BOUNDS.maxLat, 0);
    expect((arpege.bounds.maxLon - arpege.bounds.minLon) / (arpege.width - 1)).toBeCloseTo(0.1, 3);
    expectPlausible(arpege, 0.99);
  });

  it('AROME HD couvre la France au pas de 0,01°, à l’échéance d’ARPEGE', () => {
    expect(arome.model).toMatch(/AROME/);
    expect((arome.bounds.maxLon - arome.bounds.minLon) / (arome.width - 1)).toBeCloseTo(0.01, 4);
    // Domaine natif non rectangulaire : des coins sans donnée
    expectPlausible(arome, 0.8);
    expect(arome.validTime.getTime()).toBe(arpege.validTime.getTime());
  });

  it('GFS (secours) couvre l’Europe au pas de 0,25°', () => {
    expect((gfs.bounds.maxLon - gfs.bounds.minLon) / (gfs.width - 1)).toBeCloseTo(0.25, 3);
    expectPlausible(gfs, 0.99);
  });

  it('les modèles concordent sur la France', () => {
    // Vitesse moyenne sur un carré du centre de la France : même ordre de grandeur
    const mean = (field: WindField) => {
      const at = hasData(field);
      let sum = 0;
      let n = 0;
      const { width, height, u, v, bounds } = field;
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          const lon = bounds.minLon + (col * (bounds.maxLon - bounds.minLon)) / (width - 1);
          const lat = bounds.maxLat - (row * (bounds.maxLat - bounds.minLat)) / (height - 1);
          if (lon < 1 || lon > 4 || lat < 45 || lat > 48 || !at(lon, lat)) continue;
          sum += Math.hypot(u[row * width + col], v[row * width + col]);
          n++;
        }
      }
      return sum / n;
    };
    const [a, b] = [mean(arpege), mean(arome)];
    expect(Math.abs(a - b)).toBeLessThan(Math.max(2, 0.5 * Math.max(a, b)));
  });

  describe('traitement', () => {
    it('encode chaque champ en texture fidèle', async () => {
      for (const field of [arpege, arome]) {
        const texture = await encodeWind(field);
        expect([texture.width, texture.height]).toEqual([field.width, field.height]);
        const [lo, hi] = texture.imageUnscale;
        expect(hi).toBe(-lo);
        expect(hi).toBeGreaterThanOrEqual(stats(field).maxSpeed);
        // Pixels transparents = points sans donnée
        const a = await alpha(texture.webp);
        const transparent = a.reduce((n, x) => n + (x === 0 ? 1 : 0), 0);
        const missing = field.u.reduce((n, x) => n + (Number.isNaN(x) ? 1 : 0), 0);
        expect(transparent).toBe(missing);
      }
    });

    it('ne laisse aucune bande vide entre AROME et la couche Europe', async () => {
      // Comme le rendu : un point n'est dessiné que si les 4 pixels qui l'entourent ont une donnée
      const drawable = async (field: WindField, finer?: WindField) => {
        const a = await alpha((await encodeWind(field, finer)).webp);
        const { width, height, bounds } = field;
        const lonStep = (bounds.maxLon - bounds.minLon) / (width - 1);
        const latStep = (bounds.maxLat - bounds.minLat) / (height - 1);
        return (lon: number, lat: number) => {
          const x = (lon - bounds.minLon) / lonStep;
          const y = (bounds.maxLat - lat) / latStep;
          const [x0, y0] = [Math.floor(x), Math.floor(y)];
          if (x0 < 0 || y0 < 0 || x0 + 1 >= width || y0 + 1 >= height) return false;
          return [0, 1].every((dx) => [0, 1].every((dy) => a[(y0 + dy) * width + x0 + dx] > 0));
        };
      };
      const europe = await drawable(arpege, arome);
      const france = await drawable(arome);

      const holes: string[] = [];
      for (let lat = arome.bounds.minLat - 1; lat <= arome.bounds.maxLat + 1; lat += 0.02) {
        for (let lon = arome.bounds.minLon - 1; lon <= arome.bounds.maxLon + 1; lon += 0.02) {
          if (!europe(lon, lat) && !france(lon, lat)) holes.push(`${lon.toFixed(2)},${lat.toFixed(2)}`);
        }
      }
      expect(holes.slice(0, 10)).toEqual([]);
    });
  });
});
