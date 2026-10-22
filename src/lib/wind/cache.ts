import { buildWindTexture } from './main';
import { fetchUVTiff } from './UV_TIFF';
import { BOUNDS } from '@/config/mapConfig';
import sharp from 'sharp';

export type WindCache = {
  webp: Uint8Array;
  etag: string;
  imageUnscale: [number, number];
  speedMax: number;
  runTime: number | null; // run AROME (epoch ms)
  validTime: number; // échéance affichée (epoch ms)
  expiresAt: number;
};

// AROME est horaire : on recharge toutes les heures l'échéance la plus proche
const REFRESH_MS = 60 * 60 * 1000;

let cache: WindCache | null = null;
let refreshing: Promise<void> | null = null;
let intervalId: NodeJS.Timeout | null = null;

export function startWindRefresh() {
  if (intervalId) return;
  refresh();
  intervalId = setInterval(refresh, REFRESH_MS);
}

async function computeWindData(): Promise<WindCache> {
  const apiKey = process.env.METEO_FRANCE_API_KEY;
  if (!apiKey) throw new Error('METEO_FRANCE_API_KEY absente');
  const { u, v, runTime, validTime } = await fetchUVTiff(apiKey, BOUNDS);
  const { image, imageUnscale, speedMax } = await buildWindTexture([u, v]);

  const webpBuffer = await sharp(Buffer.from(image.data.buffer), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .webp({ lossless: true })
    .toBuffer();
  const webp = new Uint8Array(webpBuffer);

  const expiresAt = Date.now() + REFRESH_MS;

  return {
    webp,
    etag: `"wind-${expiresAt}"`,
    imageUnscale: imageUnscale as [number, number],
    speedMax,
    runTime: runTime?.getTime() ?? null,
    validTime: validTime.getTime(),
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

export async function getWindData(): Promise<WindCache> {
  if (!cache) await refresh();
  if (!cache) throw new Error('Wind data unavailable');
  return cache;
}