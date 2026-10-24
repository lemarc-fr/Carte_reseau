import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { encodeWind } from './texture';
import type { WindField } from './types';

// Grille 3 × 2 sur [0°, 2°] × [40°, 41°], ligne 0 au nord
const field: WindField = {
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

  it('rend transparente la zone couverte par une couche plus fine', async () => {
    const texture = await encodeWind(field, { minLon: 0.5, maxLon: 2, minLat: 39, maxLat: 40.5 });
    const data = await pixels(texture.webp);
    const alpha = [...data].filter((_, i) => i % 4 === 3);
    // Seule la ligne sud (40°) aux longitudes 1° et 2° est dans le trou
    expect(alpha).toEqual([255, 255, 0, 255, 0, 0]);
  });
});
