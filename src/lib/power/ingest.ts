import { prisma } from '../prisma';
import { downsampleOldHourlyData } from '../downsample';
import {
  addDays,
  fetchActualGenerations,
  hasRteCredentials,
  MAX_DAYS_PER_CALL,
  parisDay,
  parisHour,
  type RteUnitResult,
} from './rte';

// Filières ingérées depuis RTE (le nucléaire pour l'instant ; l'API renvoie aussi
// gaz, hydraulique, éolien en mer… il suffira de les ajouter ici).
const INGESTED_PRODUCTION_TYPES = new Set(['NUCLEAR']);

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
// Aligné sur RETENTION_DAYS de lib/downsample.ts : au-delà, les relevés horaires
// sont convertis en moyennes journalières, inutile de les re-télécharger.
const HOURLY_RETENTION_DAYS = 7;
// Juste après minuit, RTE publie encore les dernières heures de la veille.
const LATE_PUBLICATION_HOURS = 3;
// Pause entre deux appels RTE lors d'un rattrapage long (un appel = 7 jours)
const BACKFILL_PAUSE_MS = 1000;

/**
 * Début de l'historique à conserver, variable d'environnement BACK_FILL_START
 * (jour au format YYYY-MM-DD, heure de Paris). Absente : seuls les 7 derniers jours
 * sont récupérés.
 */
export function backfillStart(): string | null {
  const value = process.env.BACK_FILL_START?.trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`BACK_FILL_START invalide : "${value}" (format attendu YYYY-MM-DD)`);
  }
  return value;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Enregistre les relevés horaires d'un lot d'unités RTE. Renvoie le nombre de lignes écrites. */
async function upsertUnits(units: RteUnitResult[]): Promise<number> {
  if (!units.length) return 0;

  // Une unité inconnue (nouveau réacteur côté RTE) est ajoutée sans centrale
  // associée, pour ne pas violer la clé étrangère des relevés.
  await prisma.reactor.createMany({
    data: units.map(({ unit }) => ({
      eic_code: unit.eic_code,
      name: unit.name,
      production_type: unit.production_type,
    })),
    skipDuplicates: true,
  });

  // RTE renvoie parfois plusieurs révisions d'un même créneau : on garde la plus récente
  // (un INSERT … ON CONFLICT ne peut pas toucher deux fois la même ligne).
  const latest = new Map<string, { unit: RteUnitResult['unit']; reading: RteUnitResult['values'][number] }>();
  for (const { unit, values: readings } of units) {
    for (const reading of readings) {
      const key = `${unit.eic_code}|${Date.parse(reading.start_date)}`;
      const previous = latest.get(key);
      if (!previous || Date.parse(reading.updated_date) >= Date.parse(previous.reading.updated_date)) {
        latest.set(key, { unit, reading });
      }
    }
  }
  if (!latest.size) return 0;

  const eics: string[] = [];
  const names: string[] = [];
  const types: string[] = [];
  const starts: string[] = [];
  const values: number[] = [];
  const updated: string[] = [];
  for (const { unit, reading } of latest.values()) {
    eics.push(unit.eic_code);
    names.push(unit.name);
    types.push(unit.production_type);
    starts.push(reading.start_date);
    values.push(reading.value);
    updated.push(reading.updated_date);
  }

  // Un seul INSERT … ON CONFLICT pour tout le lot (jusqu'à ~10 000 lignes pour 7 jours).
  // Les dates RTE portent leur décalage (+01:00/+02:00) : converties en UTC comme le
  // reste de la table (colonnes TIMESTAMP sans fuseau, écrites en UTC par Prisma).
  return prisma.$executeRaw`
    INSERT INTO production_readings
      (eic_code, name, production_type, start_date, granularity, value, updated_date)
    SELECT
      r.eic_code,
      r.name,
      r.production_type,
      r.start_date::timestamptz AT TIME ZONE 'UTC',
      'HOUR'::"Granularity",
      r.value,
      r.updated_date::timestamptz AT TIME ZONE 'UTC'
    FROM unnest(
      ${eics}::text[], ${names}::text[], ${types}::text[],
      ${starts}::text[], ${values}::float8[], ${updated}::text[]
    ) AS r(eic_code, name, production_type, start_date, value, updated_date)
    ON CONFLICT (eic_code, start_date, granularity) DO UPDATE
      SET value = EXCLUDED.value, updated_date = EXCLUDED.updated_date
      WHERE production_readings.value IS DISTINCT FROM EXCLUDED.value
         OR production_readings.updated_date IS DISTINCT FROM EXCLUDED.updated_date
  `;
}

/** Télécharge et enregistre la production des jours [fromDay, toDay[ (heure de Paris). */
export async function ingestDays(
  fromDay: string,
  toDay: string,
  onProgress?: (windowStart: string, windowEnd: string, rows: number) => void
): Promise<number> {
  let written = 0;
  for (let start = fromDay; start < toDay; start = addDays(start, MAX_DAYS_PER_CALL)) {
    if (start !== fromDay) await sleep(BACKFILL_PAUSE_MS);
    const windowEnd = addDays(start, MAX_DAYS_PER_CALL);
    const end = windowEnd < toDay ? windowEnd : toDay;
    const units = await fetchActualGenerations(start, end);
    const rows = await upsertUnits(units.filter((u) => INGESTED_PRODUCTION_TYPES.has(u.unit.production_type)));
    written += rows;
    onProgress?.(start, end, rows);
  }
  return written;
}

/** Jours (heure de Paris) pour lesquels la base a au moins un relevé, depuis `fromDay`. */
async function daysWithData(fromDay: string): Promise<Set<string>> {
  // Relevés horaires : rattachés à leur jour parisien. Relevés journaliers : jour UTC.
  const rows = await prisma.$queryRaw<{ day: string }[]>`
    SELECT DISTINCT (CASE
      WHEN granularity = 'DAY' THEN start_date::date
      ELSE ((start_date AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date
    END)::text AS day
    FROM production_readings
    WHERE start_date >= ${fromDay}::date - 1
  `;
  return new Set(rows.map((r) => r.day));
}

/**
 * Récupère tous les jours manquants entre BACK_FILL_START et la fenêtre récente
 * (gérée par syncRecent), puis les résume en moyennes journalières. Sans effet si
 * l'historique est complet.
 */
export async function backfillHistory(): Promise<number> {
  const start = backfillStart();
  if (!start) return 0;

  const end = addDays(parisDay(), -(HOURLY_RETENTION_DAYS - 1));
  const present = await daysWithData(start);

  // Regroupe les jours manquants consécutifs en plages [from, to[
  const ranges: [string, string][] = [];
  for (let day = start; day < end; day = addDays(day, 1)) {
    if (present.has(day)) continue;
    const last = ranges[ranges.length - 1];
    if (last && last[1] === day) last[1] = addDays(day, 1);
    else ranges.push([day, addDays(day, 1)]);
  }
  if (!ranges.length) return 0;

  let rows = 0;
  for (const [from, to] of ranges) {
    console.log(`[production] rattrapage RTE du ${from} au ${to} (BACK_FILL_START=${start})…`);
    rows += await ingestDays(from, to, (a, b, n) => console.log(`[production]   ${a} → ${b} : ${n} relevé(s)`));
  }
  await downsampleOldHourlyData();
  return rows;
}

/**
 * Rattrape tout ce qui manque depuis le dernier relevé horaire (au plus
 * HOURLY_RETENTION_DAYS jours en arrière) jusqu'à aujourd'hui inclus.
 */
async function syncRecent(): Promise<number> {
  const today = parisDay();
  const oldest = addDays(today, -(HOURLY_RETENTION_DAYS - 1));

  const { _max } = await prisma.productionReading.aggregate({
    _max: { start_date: true },
    where: { granularity: 'HOUR' },
  });
  let from = _max.start_date ? parisDay(_max.start_date) : oldest;
  if (from < oldest) from = oldest;
  if (parisHour() < LATE_PUBLICATION_HOURS && from > addDays(today, -1)) from = addDays(today, -1);

  return ingestDays(from, addDays(today, 1));
}

let running: Promise<number> | null = null;
let intervalId: NodeJS.Timeout | null = null;

export function syncRecentOnce(): Promise<number> {
  running ??= syncRecent().finally(() => {
    running = null;
  });
  return running;
}

export function startProductionRefresh() {
  if (intervalId) return;
  if (!hasRteCredentials()) {
    console.warn('[production] RTE_CLIENT_ID / RTE_CLIENT_SECRET absents : ingestion RTE désactivée');
    return;
  }

  const run = () =>
    syncRecentOnce()
      .then((rows) => console.log(`[production] synchronisation RTE : ${rows} relevé(s) écrit(s)`))
      .catch((err) => console.error('[production] synchronisation RTE échouée :', err));

  // Données récentes d'abord (affichées tout de suite), puis l'historique éventuel
  run()
    .then(() => backfillHistory())
    .then((rows) => {
      if (rows) console.log(`[production] rattrapage terminé : ${rows} relevé(s)`);
    })
    .catch((err) => console.error('[production] rattrapage RTE échoué :', err));
  intervalId = setInterval(run, REFRESH_INTERVAL_MS);
}
