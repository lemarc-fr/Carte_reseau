import { EUROPE_WIND_BOUNDS, FRANCE_WIND_BOUNDS } from '@/config/mapConfig';
import { fetchArome } from './arome';
import { fetchGfs } from './gfs';
import { encodeWind, type WindTexture } from './texture';
import type { WindField } from './types';

// Deux couches de vent, rechargées toutes les heures, pour une même échéance :
//   europe : GFS 0,25° (NOAA), sauf sur la zone couverte par AROME
//   france : AROME HD 0,01° (Météo-France)
// GFS (pas de 3 h) fixe l'échéance la plus proche de maintenant, AROME (pas de 1 h) est
// demandé pour celle-ci. Chaque source garde son dernier champ valide si un rechargement
// échoue ; si les deux ne sont plus à la même échéance, GFS couvre seul la France.

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

/** Champs à afficher : AROME seulement s'il est à la même échéance que GFS. */
export function alignedFields(fields: Partial<Record<WindLayerId, WindField>>): {
  europe?: WindField;
  france?: WindField;
} {
  const { europe, france } = fields;
  if (!europe || !france) return { europe, france };
  if (europe.validTime.getTime() === france.validTime.getTime()) return { europe, france };
  console.warn(
    `[vent] échéances différentes (GFS ${europe.validTime.toISOString()}, AROME ${france.validTime.toISOString()}) : GFS seul`
  );
  return { europe };
}

async function refresh(): Promise<void> {
  try {
    fields.europe = await fetchGfs(EUROPE_WIND_BOUNDS);
  } catch (err) {
    console.error('[vent] GFS indisponible :', (err as Error).message);
  }

  const apiKey = process.env.METEO_FRANCE_API_KEY;
  if (apiKey) {
    try {
      fields.france = await fetchArome(apiKey, FRANCE_WIND_BOUNDS, fields.europe?.validTime);
    } catch (err) {
      console.error('[vent] AROME indisponible :', (err as Error).message);
    }
  }

  const { europe, france } = alignedFields(fields);
  const next: WindLayer[] = [];
  if (europe) next.push(await toLayer('europe', europe, france ? FRANCE_WIND_BOUNDS : undefined));
  if (france) next.push(await toLayer('france', france));
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
