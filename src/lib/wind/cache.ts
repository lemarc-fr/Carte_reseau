import { EUROPE_WIND_BOUNDS, FRANCE_WIND_BOUNDS } from '@/config/mapConfig';
import { fetchArome } from './arome';
import { fetchGfs } from './gfs';
import { encodeWind, type WindTexture } from './texture';
import type { WindField } from './types';

// Deux couches de vent, rechargées toutes les heures avec l'échéance la plus proche :
//   europe : GFS 0,25° (NOAA), sauf sur la zone couverte par AROME
//   france : AROME HD 0,01° (Météo-France)
// Chaque source garde son dernier champ valide si un rechargement échoue ; sans AROME,
// GFS couvre aussi la France.

export type WindLayerId = 'europe' | 'france';

export interface WindLayer extends WindTexture {
  id: WindLayerId;
  model: string;
  runTime: number | null;
  validTime: number;
  etag: string;
}

const REFRESH_MS = 60 * 60 * 1000;
const MODELS: Record<WindLayerId, string> = {
  europe: 'GFS 0,25° (NOAA)',
  france: 'AROME HD (Météo-France)',
};

const fields: Partial<Record<WindLayerId, WindField>> = {};
let layers: WindLayer[] = [];
let refreshing: Promise<void> | null = null;
let intervalId: NodeJS.Timeout | null = null;

async function toLayer(id: WindLayerId, field: WindField, hole?: typeof FRANCE_WIND_BOUNDS): Promise<WindLayer> {
  const texture = await encodeWind(field, hole);
  return {
    ...texture,
    id,
    model: MODELS[id],
    runTime: field.runTime?.getTime() ?? null,
    validTime: field.validTime.getTime(),
    etag: `"wind-${id}-${field.validTime.getTime()}-${field.runTime?.getTime() ?? 0}"`,
  };
}

async function refresh(): Promise<void> {
  const apiKey = process.env.METEO_FRANCE_API_KEY;
  const [europe, france] = await Promise.allSettled([
    fetchGfs(EUROPE_WIND_BOUNDS),
    apiKey ? fetchArome(apiKey, FRANCE_WIND_BOUNDS) : Promise.reject(new Error('METEO_FRANCE_API_KEY absente')),
  ]);
  if (europe.status === 'fulfilled') fields.europe = europe.value;
  else console.error('[vent] GFS indisponible :', europe.reason?.message ?? europe.reason);
  if (france.status === 'fulfilled') fields.france = france.value;
  else console.error('[vent] AROME indisponible :', france.reason?.message ?? france.reason);

  const next: WindLayer[] = [];
  if (fields.europe) next.push(await toLayer('europe', fields.europe, fields.france ? FRANCE_WIND_BOUNDS : undefined));
  if (fields.france) next.push(await toLayer('france', fields.france));
  if (next.length) layers = next;
}

function refreshOnce(): Promise<void> {
  refreshing ??= refresh()
    .catch((err) => console.error('[vent] rechargement échoué :', err))
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export function startWindRefresh() {
  if (intervalId) return;
  refreshOnce();
  intervalId = setInterval(refreshOnce, REFRESH_MS);
}

export async function getWindLayers(): Promise<WindLayer[]> {
  if (!layers.length) await refreshOnce();
  if (!layers.length) throw new Error('Vent indisponible');
  return layers;
}
