import { NetCDFReader } from 'netcdfjs';
import type { Bounds, WindField } from './types';

// GFS 0,25° de la NOAA, découpé sur l'Europe par le service NCSS du serveur THREDDS
// public de l'UCAR (NetCDF 3, sans clé d'API). Collection « Best » : échéances de 3 h
// des derniers runs ; le service renvoie celle la plus proche de l'instant demandé.

const NCSS_URL = 'https://thredds.ucar.edu/thredds/ncss/grid/grib/NCEP/GFS/Global_0p25deg/Best';
const U_VAR = 'u-component_of_wind_height_above_ground';
const V_VAR = 'v-component_of_wind_height_above_ground';

// "Hour since 2026-10-16T00:00:00Z" + valeur -> date
export function hoursSince(units: string | undefined, hours: number): Date | null {
  const origin = units?.match(/since\s+(\S+)/)?.[1];
  return origin ? new Date(Date.parse(origin) + hours * 3_600_000) : null;
}

export async function fetchGfs(bounds: Bounds, target = new Date()): Promise<WindField> {
  const url = new URL(NCSS_URL);
  for (const variable of [U_VAR, V_VAR]) url.searchParams.append('var', variable);
  url.searchParams.set('north', String(bounds.maxLat));
  url.searchParams.set('south', String(bounds.minLat));
  url.searchParams.set('west', String(bounds.minLon));
  url.searchParams.set('east', String(bounds.maxLon));
  url.searchParams.set('time', target.toISOString().replace(/\.\d{3}Z$/, 'Z'));
  url.searchParams.set('vertCoord', '10');
  url.searchParams.set('accept', 'netcdf3');

  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`GFS THREDDS (${res.status}) : ${(await res.text()).slice(0, 200)}`);
  const reader = new NetCDFReader(new Uint8Array(await res.arrayBuffer()));

  const lat = reader.getDataVariable('latitude') as number[]; // nord -> sud
  const lon = (reader.getDataVariable('longitude') as number[]).map((l) => (l > 180 ? l - 360 : l));
  const units = (name: string): string | undefined => {
    const variable = reader.variables.find((v) => v.name === name) as
      | { attributes: { name: string; value: unknown }[] }
      | undefined;
    const value = variable?.attributes.find((a) => a.name === 'units')?.value;
    return typeof value === 'string' ? value : undefined;
  };
  // Noms numérotés selon le run servi : time / time1, reftime / reftime1…
  const named = (prefix: string) => reader.variables.find((v) => new RegExp(`^${prefix}\\d*$`).test(v.name))?.name;
  const timeVar = named('time');
  const refVar = named('reftime');
  if (!timeVar) throw new Error('GFS : variable de temps introuvable');
  const validTime = hoursSince(units(timeVar), (reader.getDataVariable(timeVar) as number[])[0]);
  const runTime = refVar ? hoursSince(units(refVar), (reader.getDataVariable(refVar) as number[])[0]) : null;
  if (!validTime) throw new Error('GFS : échéance introuvable');

  return {
    model: 'GFS 0,25° (NOAA)',
    width: lon.length,
    height: lat.length,
    u: Float32Array.from(reader.getDataVariable(U_VAR) as number[]),
    v: Float32Array.from(reader.getDataVariable(V_VAR) as number[]),
    bounds: { minLon: lon[0], maxLon: lon[lon.length - 1], minLat: lat[lat.length - 1], maxLat: lat[0] },
    runTime,
    validTime,
  };
}
