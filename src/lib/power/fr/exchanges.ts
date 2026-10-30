// Échanges commerciaux de la France par frontière, publiés par RTE dans éCO2mix national
// via ODRE (sans authentification) : MW, positif = import en France, négatif = export.
//   eco2mix-national-cons-def : données consolidées puis définitives
//   eco2mix-national-tr       : temps réel (pas 15 min)

import { midnightIn } from '../days';
import { FR_TIME_ZONE } from './rte';

const ODRE_DATASETS = 'https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets';
// Le consolidé fait foi quand les deux jeux couvrent la même heure (traité en dernier)
const DATASETS = ['eco2mix-national-tr', 'eco2mix-national-cons-def'] as const;
const HOUR_MS = 3_600_000;

// Champ éCO2mix -> frontière (code des séries "FR~<FRONTIÈRE>:COMM")
export const BORDER_FIELDS = {
  ech_comm_angleterre: 'GB',
  ech_comm_espagne: 'ES',
  ech_comm_italie: 'IT',
  ech_comm_suisse: 'CH',
  ech_comm_allemagne_belgique: 'DE_BE', // publiés ensemble (couplage CWE)
} as const;

type Row = { date_heure: string; ech_physiques: number | null } & Record<keyof typeof BORDER_FIELDS, number | null>;

export interface ExchangeReading {
  series: string; // "FR~GB:COMM" (échange commercial par frontière) ou "FR:EXCHANGE" (solde physique)
  start: Date; // début de l'heure (UTC)
  value: number; // MW, positif = import
}

async function fetchRows(dataset: string, from: string, to: string): Promise<Row[]> {
  const url = new URL(`${ODRE_DATASETS}/${dataset}/exports/json`);
  url.searchParams.set('select', ['date_heure', 'ech_physiques', ...Object.keys(BORDER_FIELDS)].join(','));
  url.searchParams.set('where', `date_heure >= "${from}" AND date_heure < "${to}"`);
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`éCO2mix ${dataset} (${res.status}) : ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Row[];
}

/** Moyennes horaires des échanges pour les jours [fromDay, toDay[ (heure de Paris). */
export async function fetchExchanges(fromDay: string, toDay: string): Promise<ExchangeReading[]> {
  const from = midnightIn(FR_TIME_ZONE, fromDay);
  const to = midnightIn(FR_TIME_ZONE, toDay);
  const hourly = new Map<string, ExchangeReading>();
  for (const dataset of DATASETS) {
    const sums = new Map<string, { series: string; start: Date; sum: number; n: number }>();
    const add = (series: string, start: Date, value: number | null) => {
      if (value === null || Number.isNaN(value)) return;
      const key = `${series}|${start.getTime()}`;
      const acc = sums.get(key) ?? { series, start, sum: 0, n: 0 };
      acc.sum += value;
      acc.n++;
      sums.set(key, acc);
    };
    for (const row of await fetchRows(dataset, from, to)) {
      const start = new Date(Math.floor(Date.parse(row.date_heure) / HOUR_MS) * HOUR_MS);
      for (const [field, border] of Object.entries(BORDER_FIELDS)) {
        add(`FR~${border}:COMM`, start, row[field as keyof typeof BORDER_FIELDS]);
      }
      add('FR:EXCHANGE', start, row.ech_physiques);
    }
    for (const [key, { series, start, sum, n }] of sums) hourly.set(key, { series, start, value: sum / n });
  }
  return [...hourly.values()];
}
