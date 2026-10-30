// Prix day-ahead (€/MWh) par zone de prix, API Energy-Charts du Fraunhofer ISE (sans clé) :
// https://api.energy-charts.info — données SMARD (Bundesnetzagentur), licence CC BY 4.0.
// Le service limite le débit (429 avec Retry-After) : une requête à la fois, espacées, et
// nouvel essai après le délai demandé.

const API_URL = 'https://api.energy-charts.info/price';
const HOUR_MS = 3_600_000;
const PAUSE_MS = 3000;
const MAX_ATTEMPTS = 5;

// Pays des séries "<pays>:PRICE" -> zone de prix Energy-Charts (le Royaume-Uni n'y est pas)
export const PRICE_ZONES: Record<string, string> = {
  FR: 'FR',
  DE: 'DE-LU',
  BE: 'BE',
  CH: 'CH',
  ES: 'ES',
  IT: 'IT-North', // zone italienne couplée à la France
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Moyennes horaires (début d'heure UTC -> €/MWh) des prix d'une zone sur [from, to[. */
export async function fetchDayAheadPrices(zone: string, from: Date, to: Date): Promise<Map<number, number>> {
  const url = new URL(API_URL);
  url.searchParams.set('bzn', zone);
  url.searchParams.set('start', from.toISOString().slice(0, 16) + 'Z');
  url.searchParams.set('end', to.toISOString().slice(0, 16) + 'Z');
  let res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  for (let attempt = 1; res.status === 429 && attempt < MAX_ATTEMPTS; attempt++) {
    const wait = Number(res.headers.get('retry-after')) || 15;
    await sleep((wait + 1) * 1000);
    res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  }
  if (!res.ok) throw new Error(`Energy-Charts ${zone} (${res.status}) : ${(await res.text()).slice(0, 200)}`);
  const { unix_seconds: times, price } = (await res.json()) as { unix_seconds: number[]; price: (number | null)[] };
  return hourlyPrices(times, price, from.getTime(), to.getTime());
}

export function hourlyPrices(times: number[], prices: (number | null)[], from: number, to: number): Map<number, number> {
  const sums = new Map<number, { sum: number; n: number }>();
  times.forEach((seconds, i) => {
    const t = seconds * 1000;
    const value = prices[i];
    if (value === null || value === undefined || t < from || t >= to) return;
    const hour = Math.floor(t / HOUR_MS) * HOUR_MS;
    const acc = sums.get(hour) ?? { sum: 0, n: 0 };
    acc.sum += value;
    acc.n++;
    sums.set(hour, acc);
  });
  return new Map([...sums].map(([hour, { sum, n }]) => [hour, sum / n]));
}

/** Prix de toutes les zones, une requête après l'autre. */
export async function fetchAllPrices(from: Date, to: Date): Promise<{ country: string; hours: Map<number, number> }[]> {
  const result = [];
  for (const [country, zone] of Object.entries(PRICE_ZONES)) {
    if (result.length) await sleep(PAUSE_MS);
    result.push({ country, hours: await fetchDayAheadPrices(zone, from, to) });
  }
  return result;
}
