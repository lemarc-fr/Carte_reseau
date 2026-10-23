// Client de l'API RTE « Actual Generation » : production réalisée par groupe (> 100 MW)
// et par filière (France entière).
// https://data.rte-france.com/catalog/-/api/generation/Actual-Generation/v1.1
//
// Comportement observé de actual_generations_per_unit :
//  - un seul appel sans unit_eic_code renvoie toutes les unités (~155, dont 57 réacteurs) ;
//  - start_date / end_date doivent tomber à minuit heure de Paris ;
//  - 7 jours maximum par appel (erreur ACTUALGEN_PERUNIT_F03 au-delà) ;
//  - pas horaire, valeurs en MW, publiées avec ~20 min de retard.

const TOKEN_URL = 'https://digital.iservices.rte-france.com/token/oauth/';
const API_BASE = 'https://digital.iservices.rte-france.com/open_api/actual_generation/v1';

export const MAX_DAYS_PER_CALL = 7;
const PARIS_TZ = 'Europe/Paris';

export interface RteValue {
  start_date: string;
  end_date: string;
  updated_date: string;
  value: number;
}

export interface RteProductionTypeResult {
  start_date: string;
  end_date: string;
  production_type: string; // NUCLEAR, WIND_ONSHORE, HYDRO_PUMPED_STORAGE, …, TOTAL
  values: (Omit<RteValue, 'updated_date'> & { updated_date?: string })[];
}

export interface RteUnitResult {
  start_date: string;
  end_date: string;
  unit: { eic_code: string; name: string; production_type: string };
  values: RteValue[];
}

// ─── Jours calendaires à Paris ('YYYY-MM-DD') ────────────────────────────────

const parisDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: PARIS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const parisHourFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: PARIS_TZ,
  hour: '2-digit',
  hourCycle: 'h23',
});

export function parisDay(date: Date = new Date()): string {
  return parisDateFormat.format(date);
}

export function parisHour(date: Date = new Date()): number {
  return Number(parisHourFormat.format(date));
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// Minuit à Paris avec le bon décalage (+01:00 l'hiver, +02:00 l'été) — format attendu par RTE.
export function parisMidnight(day: string): string {
  for (const offset of ['+01:00', '+02:00']) {
    const iso = `${day}T00:00:00${offset}`;
    const date = new Date(iso);
    if (parisDay(date) === day && parisHour(date) === 0) return iso;
  }
  throw new Error(`Impossible de déterminer minuit à Paris pour ${day}`);
}

// ─── Authentification (OAuth2 client credentials, jeton valable ~2 h) ────────

let cachedToken: { value: string; expiresAt: number } | null = null;

export function hasRteCredentials(): boolean {
  return Boolean(process.env.RTE_CLIENT_ID && process.env.RTE_CLIENT_SECRET);
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const { RTE_CLIENT_ID, RTE_CLIENT_SECRET } = process.env;
  if (!RTE_CLIENT_ID || !RTE_CLIENT_SECRET) {
    throw new Error('RTE_CLIENT_ID et RTE_CLIENT_SECRET doivent être définis');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${RTE_CLIENT_ID}:${RTE_CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  if (!res.ok) {
    throw new Error(`Authentification RTE refusée (${res.status}) : ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

// ─── Données ─────────────────────────────────────────────────────────────────

async function fetchWindow<T>(resource: string, fromDay: string, toDay: string): Promise<T> {
  const span = daysBetween(fromDay, toDay);
  if (span < 1 || span > MAX_DAYS_PER_CALL) {
    throw new Error(`Fenêtre RTE invalide (${fromDay} → ${toDay}) : 1 à ${MAX_DAYS_PER_CALL} jours`);
  }

  const url = new URL(`${API_BASE}/${resource}`);
  url.searchParams.set('start_date', parisMidnight(fromDay));
  url.searchParams.set('end_date', parisMidnight(toDay));

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${await getAccessToken()}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 401) cachedToken = null;
  if (!res.ok) {
    throw new Error(`API RTE ${resource} ${fromDay} → ${toDay} (${res.status}) : ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/**
 * Production réalisée de toutes les unités entre deux jours (Paris), fin exclue.
 * La fenêtre est limitée à MAX_DAYS_PER_CALL jours.
 */
export async function fetchActualGenerations(fromDay: string, toDay: string): Promise<RteUnitResult[]> {
  const data = await fetchWindow<{ actual_generations_per_unit?: RteUnitResult[] }>(
    'actual_generations_per_unit', fromDay, toDay
  );
  return data.actual_generations_per_unit ?? [];
}

/** Production nationale par filière (horaire) entre deux jours (Paris), fin exclue. */
export async function fetchGenerationsPerType(fromDay: string, toDay: string): Promise<RteProductionTypeResult[]> {
  const data = await fetchWindow<{ actual_generations_per_production_type?: RteProductionTypeResult[] }>(
    'actual_generations_per_production_type', fromDay, toDay
  );
  return data.actual_generations_per_production_type ?? [];
}
