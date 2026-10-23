import sharp from 'sharp';
import type { Bounds, WindField } from './types';

// Encodage d'un champ de vent en image pour WeatherLayers : R/G = composantes u/v
// ramenées de [-max, +max] à [0, 255], alpha = 0 là où il n'y a pas de donnée
// (ou dans la zone `hole`, couverte par une couche plus fine).

export interface WindTexture {
  webp: Uint8Array;
  width: number;
  height: number;
  imageUnscale: [number, number];
  bounds: Bounds;
}

const inside = (lon: number, lat: number, b: Bounds) =>
  lon >= b.minLon && lon <= b.maxLon && lat >= b.minLat && lat <= b.maxLat;

export async function encodeWind(field: WindField, hole?: Bounds): Promise<WindTexture> {
  const { width, height, u, v, bounds } = field;
  const lonStep = width > 1 ? (bounds.maxLon - bounds.minLon) / (width - 1) : 0;
  const latStep = height > 1 ? (bounds.maxLat - bounds.minLat) / (height - 1) : 0;

  let maxSpeed = 0;
  for (let i = 0; i < width * height; i++) {
    if (!Number.isNaN(u[i])) maxSpeed = Math.max(maxSpeed, Math.hypot(u[i], v[i]));
  }
  const max = Math.ceil(maxSpeed / 5) * 5 || 50;
  const scale = (value: number) => Math.round(((value + max) / (2 * max)) * 255);

  const rgba = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const lat = bounds.maxLat - row * latStep;
    for (let col = 0; col < width; col++) {
      const i = row * width + col;
      const masked = Number.isNaN(u[i]) || (hole && inside(bounds.minLon + col * lonStep, lat, hole));
      rgba[i * 4] = masked ? 128 : scale(u[i]);
      rgba[i * 4 + 1] = masked ? 128 : scale(v[i]);
      rgba[i * 4 + 3] = masked ? 0 : 255;
    }
  }

  const webp = await sharp(Buffer.from(rgba.buffer), { raw: { width, height, channels: 4 } })
    .webp({ lossless: true })
    .toBuffer();
  return { webp: new Uint8Array(webp), width, height, imageUnscale: [-max, max], bounds };
}
