import { buildWindTexture } from './main';
import { fetchUVTiff } from './UV_TIFF';
import { API_KEY_METEO, BOUNDS } from '@/config/mapConfig';
import sharp from 'sharp';

export type WindCache = {
  webp: Uint8Array;
  etag: string;
  imageUnscale: [number, number];
  speedMax: number;
  expiresAt: number;
};

let cache: WindCache | null = null;
let refreshing: Promise<void> | null = null;

async function computeWindData(): Promise<WindCache> {
  const [uBuffer, vBuffer] = await fetchUVTiff(API_KEY_METEO, BOUNDS);
  const { image, imageUnscale, speedMax } = await buildWindTexture([uBuffer, vBuffer]);

  const webpBuffer = await sharp(Buffer.from(image.data.buffer), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .webp({ lossless: true })
    .toBuffer();
  const webp = new Uint8Array(webpBuffer);

  const expiresAt = Date.now() + 3 * 60 * 60 * 1000;

  return {
    webp,
    etag: `"wind-${expiresAt}"`,
    imageUnscale: imageUnscale as [number, number],
    speedMax,
    expiresAt,
  };
}

async function refresh(): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = computeWindData()
    .then((data) => { cache = data; })
    .catch((err) => { console.error('[wind cache] refresh failed:', err); })
    .finally(() => { refreshing = null; });
  return refreshing;
}

// Précalcul au démarrage + refresh toutes les 3h
refresh();
setInterval(refresh, 3 * 60 * 60 * 1000);

export async function getWindData(): Promise<WindCache> {
  if (!cache) await refresh();
  if (!cache) throw new Error('Wind data unavailable');
  return cache;
}