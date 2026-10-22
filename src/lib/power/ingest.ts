import { prisma } from '../prisma';
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

  const eics: string[] = [];
  const names: string[] = [];
  const types: string[] = [];
  const starts: string[] = [];
  const values: number[] = [];
  const updated: string[] = [];
  for (const { unit, values: readings } of units) {
    for (const reading of readings) {
      eics.push(unit.eic_code);
      names.push(unit.name);
      types.push(unit.production_type);
      starts.push(reading.start_date);
      values.push(reading.value);
      updated.push(reading.updated_date);
    }
  }
  if (!eics.length) return 0;

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
export async function ingestDays(fromDay: string, toDay: string): Promise<number> {
  let written = 0;
  for (let start = fromDay; start < toDay; start = addDays(start, MAX_DAYS_PER_CALL)) {
    const windowEnd = addDays(start, MAX_DAYS_PER_CALL);
    const end = windowEnd < toDay ? windowEnd : toDay;
    const units = await fetchActualGenerations(start, end);
    written += await upsertUnits(units.filter((u) => INGESTED_PRODUCTION_TYPES.has(u.unit.production_type)));
  }
  return written;
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

  run();
  intervalId = setInterval(run, REFRESH_INTERVAL_MS);
}
