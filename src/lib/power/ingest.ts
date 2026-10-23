import { prisma } from '../prisma';
import { downsampleOldHourlyData } from '../downsample';
import { fetchRegionalLoadFactors } from './eco2mix';
import {
  addDays,
  fetchActualGenerations,
  fetchGenerationsPerType,
  hasRteCredentials,
  MAX_DAYS_PER_CALL,
  parisDay,
  parisHour,
  type RteUnitResult,
} from './rte';
import { linkUnitsToPlants } from './unitPlants';

// Trois sources, synchronisées ensemble toutes les 15 minutes :
//   units     RTE, production par groupe (> 100 MW)        -> production_readings
//   national  RTE, production nationale par filière         -> aggregate_readings "FR:<TYPE>"
//   regional  éCO2mix, taux de charge régionaux (estimation des parcs sans donnée propre)
//                                                           -> aggregate_readings "REGION:<code>:<WIND|HYDRO>"

// Groupes suivis : nucléaire, grande hydraulique (dont STEP) et éolien en mer
const UNIT_PRODUCTION_TYPES = new Set([
  'NUCLEAR',
  'HYDRO_PUMPED_STORAGE',
  'HYDRO_WATER_RESERVOIR',
  'HYDRO_RUN_OF_RIVER_AND_POUNDAGE',
  'WIND_OFFSHORE',
]);
// Un jour est complet pour les groupes s'il contient chacun de ces types
// (l'éolien en mer n'existe que depuis 2022, il n'est pas exigé)
const UNIT_TYPES_REQUIRED = ['NUCLEAR', 'HYDRO_PUMPED_STORAGE', 'HYDRO_WATER_RESERVOIR'];

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
// Aligné sur RETENTION_DAYS de lib/downsample.ts : au-delà, les relevés horaires
// sont convertis en moyennes journalières, inutile de les re-télécharger.
const HOURLY_RETENTION_DAYS = 7;
// Juste après minuit, RTE publie encore les dernières heures de la veille.
const LATE_PUBLICATION_HOURS = 3;
// Pause entre deux fenêtres lors d'un rattrapage long (une fenêtre = 7 jours)
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

// ─── Écriture ────────────────────────────────────────────────────────────────

/** Enregistre les relevés horaires d'un lot de groupes RTE. Renvoie le nombre de lignes écrites. */
async function upsertUnits(units: RteUnitResult[]): Promise<number> {
  if (!units.length) return 0;

  // Un groupe inconnu (nouveau côté RTE) est ajouté puis rattaché à sa centrale si
  // une règle existe (unitPlants.ts), pour ne pas violer la clé étrangère des relevés.
  const { count: created } = await prisma.unit.createMany({
    data: units.map(({ unit }) => ({
      eic_code: unit.eic_code,
      name: unit.name,
      production_type: unit.production_type,
    })),
    skipDuplicates: true,
  });
  if (created) await linkUnitsToPlants();

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

  // Un seul INSERT … ON CONFLICT pour tout le lot (près de 20 000 lignes pour 7 jours).
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

interface AggregateRow {
  series: string;
  start: string; // ISO 8601 avec fuseau
  value: number;
  updated: string;
}

/** Enregistre des points horaires de séries agrégées. Renvoie le nombre de lignes écrites. */
async function upsertAggregates(rows: AggregateRow[]): Promise<number> {
  const latest = new Map<string, AggregateRow>();
  for (const row of rows) latest.set(`${row.series}|${Date.parse(row.start)}`, row);
  if (!latest.size) return 0;

  const series: string[] = [];
  const starts: string[] = [];
  const values: number[] = [];
  const updated: string[] = [];
  for (const row of latest.values()) {
    series.push(row.series);
    starts.push(row.start);
    values.push(row.value);
    updated.push(row.updated);
  }

  return prisma.$executeRaw`
    INSERT INTO aggregate_readings (series, start_date, granularity, value, updated_date)
    SELECT
      r.series,
      r.start_date::timestamptz AT TIME ZONE 'UTC',
      'HOUR'::"Granularity",
      r.value,
      r.updated_date::timestamptz AT TIME ZONE 'UTC'
    FROM unnest(${series}::text[], ${starts}::text[], ${values}::float8[], ${updated}::text[])
      AS r(series, start_date, value, updated_date)
    ON CONFLICT (series, start_date, granularity) DO UPDATE
      SET value = EXCLUDED.value, updated_date = EXCLUDED.updated_date
      WHERE aggregate_readings.value IS DISTINCT FROM EXCLUDED.value
  `;
}

// ─── Sources ─────────────────────────────────────────────────────────────────

interface Source {
  name: string;
  /** Télécharge et enregistre les jours [fromDay, toDay[ (au plus MAX_DAYS_PER_CALL jours). */
  ingest: (fromDay: string, toDay: string) => Promise<number>;
  /** Jours (heure de Paris) déjà présents en base depuis `fromDay`. */
  daysWithData: (fromDay: string) => Promise<Set<string>>;
}

// Relevés horaires : jour parisien. Relevés journaliers (sous-échantillonnés) : jour UTC.
const DAY_OF_READING = `(CASE
  WHEN granularity = 'DAY' THEN start_date::date
  ELSE ((start_date AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date
END)::text`;

async function aggregateDays(fromDay: string, series: string): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<{ day: string }[]>(
    `SELECT DISTINCT ${DAY_OF_READING} AS day FROM aggregate_readings
     WHERE series = $1 AND start_date >= $2::date - 1`,
    series,
    fromDay
  );
  return new Set(rows.map((r) => r.day));
}

const SOURCES: Source[] = [
  {
    name: 'groupes RTE',
    ingest: async (fromDay, toDay) => {
      const units = await fetchActualGenerations(fromDay, toDay);
      return upsertUnits(units.filter((u) => UNIT_PRODUCTION_TYPES.has(u.unit.production_type)));
    },
    daysWithData: async (fromDay) => {
      const rows = await prisma.$queryRawUnsafe<{ day: string }[]>(
        `SELECT day FROM (
           SELECT ${DAY_OF_READING} AS day, production_type FROM production_readings
           WHERE start_date >= $1::date - 1 AND production_type = ANY($2::text[])
         ) t GROUP BY day HAVING count(DISTINCT production_type) = $3`,
        fromDay,
        UNIT_TYPES_REQUIRED,
        UNIT_TYPES_REQUIRED.length
      );
      return new Set(rows.map((r) => r.day));
    },
  },
  {
    name: 'filières RTE',
    ingest: async (fromDay, toDay) => {
      const now = new Date().toISOString();
      const types = await fetchGenerationsPerType(fromDay, toDay);
      return upsertAggregates(
        types.flatMap((t) =>
          t.values.map((v) => ({
            series: `FR:${t.production_type}`,
            start: v.start_date,
            value: v.value,
            updated: v.updated_date ?? now, // absent de certaines réponses par filière
          }))
        )
      );
    },
    daysWithData: (fromDay) => aggregateDays(fromDay, 'FR:NUCLEAR'),
  },
  {
    name: 'taux de charge éCO2mix',
    ingest: async (fromDay, toDay) => {
      const now = new Date().toISOString();
      const rows = await fetchRegionalLoadFactors(fromDay, toDay);
      return upsertAggregates(
        rows.map((r) => ({ series: r.series, start: r.start.toISOString(), value: r.value, updated: now }))
      );
    },
    // Auvergne-Rhône-Alpes : région présente dans toutes les publications
    daysWithData: (fromDay) => aggregateDays(fromDay, 'REGION:84:WIND'),
  },
];

// ─── Synchronisation ─────────────────────────────────────────────────────────

type Progress = (source: string, windowStart: string, windowEnd: string, rows: number) => void;

/** Télécharge et enregistre les jours [fromDay, toDay[ (heure de Paris) pour les sources données. */
export async function ingestDays(
  fromDay: string,
  toDay: string,
  onProgress?: Progress,
  sources: Source[] = SOURCES
): Promise<number> {
  let written = 0;
  for (let start = fromDay; start < toDay; start = addDays(start, MAX_DAYS_PER_CALL)) {
    if (start !== fromDay) await sleep(BACKFILL_PAUSE_MS);
    const windowEnd = addDays(start, MAX_DAYS_PER_CALL);
    const end = windowEnd < toDay ? windowEnd : toDay;
    for (const source of sources) {
      const rows = await source.ingest(start, end);
      written += rows;
      onProgress?.(source.name, start, end, rows);
    }
  }
  return written;
}

/**
 * Récupère, source par source, tous les jours manquants entre BACK_FILL_START et la
 * fenêtre récente (gérée par syncRecent), puis les résume en moyennes journalières.
 * Sans effet si l'historique est complet.
 */
export async function backfillHistory(): Promise<number> {
  const start = backfillStart();
  if (!start) return 0;
  const end = addDays(parisDay(), -(HOURLY_RETENTION_DAYS - 1));

  let rows = 0;
  for (const source of SOURCES) {
    const present = await source.daysWithData(start);
    // Regroupe les jours manquants consécutifs en plages [from, to[
    const ranges: [string, string][] = [];
    for (let day = start; day < end; day = addDays(day, 1)) {
      if (present.has(day)) continue;
      const last = ranges[ranges.length - 1];
      if (last && last[1] === day) last[1] = addDays(day, 1);
      else ranges.push([day, addDays(day, 1)]);
    }
    for (const [from, to] of ranges) {
      console.log(`[production] rattrapage ${source.name} du ${from} au ${to} (BACK_FILL_START=${start})…`);
      rows += await ingestDays(
        from,
        to,
        (_, a, b, n) => console.log(`[production]   ${a} → ${b} : ${n} relevé(s)`),
        [source]
      );
    }
  }
  if (rows) await downsampleOldHourlyData();
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
      .then((rows) => console.log(`[production] synchronisation : ${rows} relevé(s) écrit(s)`))
      .catch((err) => console.error('[production] synchronisation échouée :', err));

  // Données récentes d'abord (affichées tout de suite), puis l'historique éventuel
  run()
    .then(() => backfillHistory())
    .then((rows) => {
      if (rows) console.log(`[production] rattrapage terminé : ${rows} relevé(s)`);
    })
    .catch((err) => console.error('[production] rattrapage échoué :', err));
  intervalId = setInterval(run, REFRESH_INTERVAL_MS);
}
