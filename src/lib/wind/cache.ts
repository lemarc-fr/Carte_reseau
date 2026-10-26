import { EUROPE_WIND_BOUNDS, FRANCE_WIND_BOUNDS } from '@/config/mapConfig';
import { fetchGfs } from './gfs';
import { AROME_HD, ARPEGE_EUROPE, fetchMeteoFrance } from './meteofrance';
import { encodeWind, type WindTexture } from './texture';
import type { WindField } from './types';

// Deux couches de vent, rechargées toutes les heures, pour une même échéance :
//   europe : ARPEGE 0,1° (Météo-France), sauf là où AROME a des données ;
//            GFS 0,25° (NOAA) en secours si ARPEGE est indisponible
//   france : AROME HD 0,01° (Météo-France)
// La couche Europe fixe l'échéance (la plus proche de maintenant), AROME est demandé pour
// celle-ci. Chaque couche garde son dernier champ valide si un rechargement échoue ; si
// les deux ne sont plus à la même échéance, la couche Europe couvre seule la France.

export type WindLayerId = 'europe' | 'france';

export interface WindLayer extends WindTexture {
  id: WindLayerId;
  model: string;
  runTime: number | null;
  validTime: number;
  etag: string;
}

const REFRESH_MS = 60 * 60 * 1000;

const fields: Partial<Record<WindLayerId, WindField>> = {};
let layers: WindLayer[] = [];
let refreshing: Promise<void> | null = null;
let intervalId: NodeJS.Timeout | null = null;

async function toLayer(id: WindLayerId, field: WindField, finer?: WindField): Promise<WindLayer> {
  const texture = await encodeWind(field, finer);
  return {
    ...texture,
    id,
    model: field.model,
    runTime: field.runTime?.getTime() ?? null,
    validTime: field.validTime.getTime(),
    etag: `"wind-${id}-${field.validTime.getTime()}-${field.runTime?.getTime() ?? 0}"`,
  };
}

/** Champs à afficher : AROME seulement s'il est à la même échéance que la couche Europe. */
export function alignedFields(fields: Partial<Record<WindLayerId, WindField>>): {
  europe?: WindField;
  france?: WindField;
} {
  const { europe, france } = fields;
  if (!europe || !france) return { europe, france };
  if (europe.validTime.getTime() === france.validTime.getTime()) return { europe, france };
  console.warn(
    `[vent] échéances différentes (${europe.model} ${europe.validTime.toISOString()}, ` +
      `${france.model} ${france.validTime.toISOString()}) : couche Europe seule`
  );
  return { europe };
}

/** Couche Europe : ARPEGE, sinon GFS. */
async function fetchEurope(apiKey: string | undefined): Promise<WindField> {
  if (apiKey) {
    try {
      return await fetchMeteoFrance(ARPEGE_EUROPE, apiKey, EUROPE_WIND_BOUNDS);
    } catch (err) {
      console.error('[vent] ARPEGE indisponible, GFS en secours :', (err as Error).message);
    }
  }
  return fetchGfs(EUROPE_WIND_BOUNDS);
}

async function refresh(): Promise<void> {
  const apiKey = process.env.METEO_FRANCE_API_KEY;
  try {
    fields.europe = await fetchEurope(apiKey);
  } catch (err) {
    console.error('[vent] couche Europe indisponible :', (err as Error).message);
  }

  if (apiKey) {
    try {
      fields.france = await fetchMeteoFrance(AROME_HD, apiKey, FRANCE_WIND_BOUNDS, fields.europe?.validTime);
    } catch (err) {
      console.error('[vent] AROME indisponible :', (err as Error).message);
    }
  }

  const { europe, france } = alignedFields(fields);
  const next: WindLayer[] = [];
  if (europe) next.push(await toLayer('europe', europe, france));
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
