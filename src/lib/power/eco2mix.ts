// Taux de charge régionaux de l'éolien et de l'hydraulique, publiés par RTE dans
// éCO2mix via ODRE (open data, sans authentification). Ils servent à estimer la
// production des parcs et centrales dont RTE ne publie pas la production individuelle.
//   eco2mix-regional-cons-def : données consolidées puis définitives (depuis 2020, pas 30 min)
//   eco2mix-regional-tr       : temps réel (mois en cours et précédent, pas 15 min)
// 12 régions métropolitaines (la Corse n'y figure pas).

import { parisMidnight } from './rte';

const ODRE_DATASETS = 'https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets';
// Le consolidé fait foi quand les deux jeux couvrent la même heure
const DATASETS = ['eco2mix-regional-cons-def', 'eco2mix-regional-tr'] as const;

const HOUR_MS = 60 * 60 * 1000;

interface Eco2mixRow {
  code_insee_region: string;
  date_heure: string;
  tch_eolien: number | null;
  tch_hydraulique: number | null;
}

export interface RegionalLoadFactor {
  series: string; // "REGION:<code>:WIND" | "REGION:<code>:HYDRO"
  start: Date; // début de l'heure (UTC)
  value: number; // taux de charge 0-1
}

async function fetchRows(dataset: string, from: string, to: string): Promise<Eco2mixRow[]> {
  const url = new URL(`${ODRE_DATASETS}/${dataset}/exports/json`);
  url.searchParams.set('select', 'code_insee_region,date_heure,tch_eolien,tch_hydraulique');
  url.searchParams.set('where', `date_heure >= "${from}" AND date_heure < "${to}"`);
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`éCO2mix ${dataset} (${res.status}) : ${await res.text()}`);
  return (await res.json()) as Eco2mixRow[];
}

/** Taux de charge horaires par région pour les jours [fromDay, toDay[ (heure de Paris). */
export async function fetchRegionalLoadFactors(fromDay: string, toDay: string): Promise<RegionalLoadFactor[]> {
  const from = parisMidnight(fromDay);
  const to = parisMidnight(toDay);

  // Moyenne horaire des pas de 15/30 min, jeu par jeu
  const hourly = new Map<string, { series: string; start: Date; value: number }>();
  for (const dataset of [...DATASETS].reverse()) {
    const sums = new Map<string, { series: string; start: Date; sum: number; n: number }>();
    for (const row of await fetchRows(dataset, from, to)) {
      const start = new Date(Math.floor(Date.parse(row.date_heure) / HOUR_MS) * HOUR_MS);
      for (const [kind, tch] of [['WIND', row.tch_eolien], ['HYDRO', row.tch_hydraulique]] as const) {
        if (tch === null || tch === undefined) continue;
        const series = `REGION:${row.code_insee_region}:${kind}`;
        const key = `${series}|${start.getTime()}`;
        const acc = sums.get(key) ?? { series, start, sum: 0, n: 0 };
        acc.sum += tch / 100;
        acc.n++;
        sums.set(key, acc);
      }
    }
    // Le jeu traité en dernier (consolidé) remplace le temps réel heure par heure
    for (const [key, { series, start, sum, n }] of sums) hourly.set(key, { series, start, value: sum / n });
  }
  return [...hourly.values()];
}
