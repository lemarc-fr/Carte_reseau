import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { coarsen, encodeWind } from './texture';
import type { WindField } from './types';

// Grille 3 × 2 sur [0°, 2°] × [40°, 41°], ligne 0 au nord
const field: WindField = {
  model: 'test',
  width: 3,
  height: 2,
  u: new Float32Array([3, 0, NaN, -3, 0, 4]),
  v: new Float32Array([4, 0, NaN, -4, 0, 3]),
  bounds: { minLon: 0, maxLon: 2, minLat: 40, maxLat: 41 },
  runTime: null,
  validTime: new Date('2026-10-24T09:00:00Z'),
};

async function pixels(webp: Uint8Array) {
  const { data } = await sharp(Buffer.from(webp)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data;
}

describe('encodeWind', () => {
  it('encode u/v sur [-max, max] (max arrondi à 5 m/s) et masque les trous de données', async () => {
    const texture = await encodeWind(field);
    expect(texture.imageUnscale).toEqual([-5, 5]);
    expect([texture.width, texture.height]).toEqual([3, 2]);
    const data = await pixels(texture.webp);
    // (3, 4) m/s -> ((3 + 5) / 10, (4 + 5) / 10) × 255
    expect([...data.subarray(0, 4)]).toEqual([204, 230, 0, 255]);
    // vent nul -> milieu de l'échelle
    expect([data[4], data[5]]).toEqual([128, 128]);
    // NaN -> transparent
    expect(data[11]).toBe(0);
  });

  it('masque seulement là où la couche fine a des données, avec deux mailles de recouvrement', async () => {
    // Grille grossière 7 × 3 au pas de 1° sur [0°, 6°] × [40°, 42°]
    const coarse: WindField = {
      ...field,
      width: 7,
      height: 3,
      u: new Float32Array(21).fill(2),
      v: new Float32Array(21).fill(2),
      bounds: { minLon: 0, maxLon: 6, minLat: 40, maxLat: 42 },
    };
    // Couche fine au pas de 0,5° sur [0°, 6°] × [38°, 44°], sans donnée à l'est de 4,5°
    const fineWidth = 13;
    const fineU = new Float32Array(fineWidth * 13).map((_, i) => (i % fineWidth > 9 ? NaN : 1));
    const fine: WindField = {
      ...field,
      width: fineWidth,
      height: 13,
      u: fineU,
      v: fineU,
      bounds: { minLon: 0, maxLon: 6, minLat: 38, maxLat: 44 },
    };
    const data = await pixels((await encodeWind(coarse, fine)).webp);
    const alpha = [...data].filter((_, i) => i % 4 === 3);
    // Seule la maille à 2° a des données fines de 0° à 4° autour d'elle
    const row = [255, 255, 0, 255, 255, 255, 255];
    expect(alpha).toEqual([...row, ...row, ...row]);
  });
});

describe('coarsen', () => {
  it('moyenne par blocs en ignorant les points sans donnée', () => {
    // 4 × 2 au pas de 1° : [0°, 3°] × [40°, 41°]
    const fine: WindField = {
      ...field,
      width: 4,
      height: 2,
      u: new Float32Array([1, 3, NaN, NaN, 5, 7, NaN, 4]),
      v: new Float32Array([0, 0, NaN, NaN, 0, 0, NaN, 2]),
      bounds: { minLon: 0, maxLon: 3, minLat: 40, maxLat: 41 },
    };
    const coarse = coarsen(fine, 2);
    expect([coarse.width, coarse.height]).toEqual([2, 1]);
    expect([...coarse.u]).toEqual([4, 4]);
    expect([...coarse.v]).toEqual([0, 2]);
    // Centres des blocs
    expect(coarse.bounds).toEqual({ minLon: 0.5, maxLon: 2.5, minLat: 40.5, maxLat: 40.5 });
    expect(coarsen(fine, 1)).toBe(fine);
  });

  it('laisse sans donnée un bloc vide', () => {
    const empty: WindField = { ...field, width: 2, height: 2, u: new Float32Array(4).fill(NaN), v: new Float32Array(4).fill(NaN) };
    expect(Number.isNaN(coarsen(empty, 2).u[0])).toBe(true);
  });
});

