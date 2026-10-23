// Taux de charge régionaux par filière et charge/décharge des batteries, publiés par
// RTE dans éCO2mix via ODRE (open data, sans authentification). Ils servent à estimer
// la production des sites dont RTE ne publie pas la production individuelle.
//   eco2mix-regional-cons-def : données consolidées puis définitives (depuis 2020, pas 30 min)
//   eco2mix-regional-tr       : temps réel (mois en cours et précédent, pas 15 min)
// 12 régions métropolitaines (la Corse n'y figure pas).

import { midnightIn } from '../days';
import { FR_TIME_ZONE } from './rte';

const ODRE_DATASETS = 'https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets';
// Le consolidé fait foi quand les deux jeux couvrent la même heure
const DATASETS = ['eco2mix-regional-cons-def', 'eco2mix-regional-tr'] as const;

const HOUR_MS = 60 * 60 * 1000;

// Taux de charge éCO2mix (%) -> filière des séries "FR-<région>:<FILIÈRE>"
const LOAD_FACTOR_FIELDS = {
  tch_eolien: 'WIND',
  tch_hydraulique: 'HYDRO',
  tch_solaire: 'SOLAR',
  tch_thermique: 'THERMAL',
  tch_bioenergies: 'BIOENERGY',
} as const;

type Eco2mixRow = {
  code_insee_region: string;
  date_heure: string;
  // Charge (négative) et décharge des batteries, MW ; parfois publiés sous forme de texte
  stockage_batterie: number | string | null;
  destockage_batterie: number | string | null;
} & Record<keyof typeof LOAD_FACTOR_FIELDS, number | null>;

export interface RegionalReading {
  region: string; // code INSEE de la région
  kind: string; // WIND, HYDRO, SOLAR, THERMAL, BIOENERGY, BATTERY_MW
  start: Date; // début de l'heure (UTC)
  value: number; // taux de charge 0-1, ou MW pour BATTERY_MW (positif = décharge)
}

async function fetchRows(dataset: string, from: string, to: string): Promise<Eco2mixRow[]> {
  const url = new URL(`${ODRE_DATASETS}/${dataset}/exports/json`);
  url.searchParams.set(
    'select',
    ['code_insee_region', 'date_heure', ...Object.keys(LOAD_FACTOR_FIELDS), 'stockage_batterie', 'destockage_batterie'].join(',')
  );
  url.searchParams.set('where', `date_heure >= "${from}" AND date_heure < "${to}"`);
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`éCO2mix ${dataset} (${res.status}) : ${await res.text()}`);
  return (await res.json()) as Eco2mixRow[];
}

const toNumber = (value: number | string | null | undefined) =>
  value === null || value === undefined || value === '' ? null : Number(value);

/** Moyennes horaires par région pour les jours [fromDay, toDay[ (heure de Paris). */
export async function fetchRegionalReadings(fromDay: string, toDay: string): Promise<RegionalReading[]> {
  const from = midnightIn(FR_TIME_ZONE, fromDay);
  const to = midnightIn(FR_TIME_ZONE, toDay);

  const hourly = new Map<string, RegionalReading>();
  for (const dataset of [...DATASETS].reverse()) {
    const sums = new Map<string, { reading: RegionalReading; sum: number; n: number }>();
    const add = (region: string, kind: string, start: Date, value: number | null) => {
      if (value === null || Number.isNaN(value)) return;
      const key = `${region}|${kind}|${start.getTime()}`;
      const acc = sums.get(key) ?? { reading: { region, kind, start, value: 0 }, sum: 0, n: 0 };
      acc.sum += value;
      acc.n++;
      sums.set(key, acc);
    };
    for (const row of await fetchRows(dataset, from, to)) {
      const start = new Date(Math.floor(Date.parse(row.date_heure) / HOUR_MS) * HOUR_MS);
      for (const [field, kind] of Object.entries(LOAD_FACTOR_FIELDS)) {
        const tch = row[field as keyof typeof LOAD_FACTOR_FIELDS];
        add(row.code_insee_region, kind, start, tch === null ? null : tch / 100);
      }
      const charge = toNumber(row.stockage_batterie);
      const discharge = toNumber(row.destockage_batterie);
      if (charge !== null || discharge !== null) {
        add(row.code_insee_region, 'BATTERY_MW', start, (discharge ?? 0) + (charge ?? 0));
      }
    }
    // Le jeu traité en dernier (consolidé) remplace le temps réel heure par heure
    for (const [key, { reading, sum, n }] of sums) hourly.set(key, { ...reading, value: sum / n });
  }
  return [...hourly.values()];
}
