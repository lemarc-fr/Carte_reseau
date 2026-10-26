import sharp from 'sharp';
import type { Bounds, WindField } from './types';

// Encodage d'un champ de vent en image pour WeatherLayers : R/G = composantes u/v
// ramenées de [-max, +max] à [0, 255], alpha = 0 là où il n'y a pas de donnée
// (ou là où une couche plus fine, `finer`, a des données).

export interface WindTexture {
  webp: Uint8Array;
  width: number;
  height: number;
  imageUnscale: [number, number];
  bounds: Bounds;
}

const OVERLAP_CELLS = 2;

/** Le champ a-t-il une donnée au point (lon, lat) ? (maille la plus proche) */
export function hasData(field: WindField): (lon: number, lat: number) => boolean {
  const { width, height, u, bounds } = field;
  const lonStep = width > 1 ? (bounds.maxLon - bounds.minLon) / (width - 1) : 1;
  const latStep = height > 1 ? (bounds.maxLat - bounds.minLat) / (height - 1) : 1;
  return (lon, lat) => {
    const col = Math.round((lon - bounds.minLon) / lonStep);
    const row = Math.round((bounds.maxLat - lat) / latStep);
    return col >= 0 && col < width && row >= 0 && row < height && !Number.isNaN(u[row * width + col]);
  };
}

export async function encodeWind(field: WindField, finer?: WindField): Promise<WindTexture> {
  const { width, height, u, v, bounds } = field;
  const lonStep = width > 1 ? (bounds.maxLon - bounds.minLon) / (width - 1) : 0;
  const latStep = height > 1 ? (bounds.maxLat - bounds.minLat) / (height - 1) : 0;

  // Maille masquée seulement si la couche fine couvre aussi ses voisines jusqu'à
  // OVERLAP_CELLS : le rendu n'interpole pas vers une maille sans donnée, la couche
  // grossière doit donc s'arrêter franchement à l'intérieur de la couche fine pour ne pas
  // laisser de bande vide. AROME n'est pas rectangulaire : son domaine natif laisse des
  // coins sans donnée dans le rectangle demandé.
  const covered = finer && hasData(finer);
  const offsets = Array.from({ length: 2 * OVERLAP_CELLS + 1 }, (_, i) => i - OVERLAP_CELLS);
  const hidden = (lon: number, lat: number) =>
    covered !== undefined &&
    offsets.every((dx) => offsets.every((dy) => covered(lon + dx * lonStep, lat + dy * latStep)));

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
      const masked = Number.isNaN(u[i]) || hidden(bounds.minLon + col * lonStep, lat);
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
