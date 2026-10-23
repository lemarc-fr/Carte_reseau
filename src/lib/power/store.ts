import { prisma } from '../prisma';

// Écriture des relevés en base, commune à tous les pays.

export interface UnitReadings {
  unit: { eic_code: string; name: string; production_type: string };
  values: { start_date: string; updated_date: string; value: number }[]; // dates ISO avec fuseau
}

/**
 * Enregistre les relevés horaires d'un lot de groupes. Les groupes inconnus sont
 * créés (sans centrale) puis `onNewUnits` permet de les rattacher. Renvoie le nombre
 * de lignes écrites.
 */
export async function upsertUnits(units: UnitReadings[], onNewUnits?: () => Promise<unknown>): Promise<number> {
  if (!units.length) return 0;

  const { count: created } = await prisma.unit.createMany({
    data: units.map(({ unit }) => ({
      eic_code: unit.eic_code,
      name: unit.name,
      production_type: unit.production_type,
    })),
    skipDuplicates: true,
  });
  if (created && onNewUnits) await onNewUnits();

  // Plusieurs révisions d'un même créneau : on garde la plus récente
  // (un INSERT … ON CONFLICT ne peut pas toucher deux fois la même ligne).
  const latest = new Map<string, { unit: UnitReadings['unit']; reading: UnitReadings['values'][number] }>();
  for (const { unit, values } of units) {
    for (const reading of values) {
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

  // Un seul INSERT … ON CONFLICT pour tout le lot (plusieurs dizaines de milliers de
  // lignes pour 7 jours). Dates converties en UTC comme le reste de la table
  // (colonnes TIMESTAMP sans fuseau, écrites en UTC par Prisma).
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

export interface AggregateRow {
  series: string;
  start: string; // ISO 8601 avec fuseau
  value: number;
  updated: string;
}

/** Enregistre des points horaires de séries agrégées. Renvoie le nombre de lignes écrites. */
export async function upsertAggregates(rows: AggregateRow[]): Promise<number> {
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

// Jour local d'un relevé : relevés horaires dans le fuseau du pays, relevés
// journaliers (sous-échantillonnés) au jour UTC.
const dayOfReading = (timeZone: string) => `(CASE
  WHEN granularity = 'DAY' THEN start_date::date
  ELSE ((start_date AT TIME ZONE 'UTC') AT TIME ZONE '${timeZone.replace(/'/g, '')}')::date
END)::text`;

/** Jours où chacun des types de groupes `types` a au moins un relevé. */
export async function unitDays(fromDay: string, types: string[], timeZone: string): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<{ day: string }[]>(
    `SELECT day FROM (
       SELECT ${dayOfReading(timeZone)} AS day, production_type FROM production_readings
       WHERE start_date >= $1::date - 1 AND production_type = ANY($2::text[])
     ) t GROUP BY day HAVING count(DISTINCT production_type) = $3`,
    fromDay,
    types,
    types.length
  );
  return new Set(rows.map((r) => r.day));
}

/** Jours où la série agrégée `series` a au moins un point. */
export async function aggregateDays(fromDay: string, series: string, timeZone: string): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<{ day: string }[]>(
    `SELECT DISTINCT ${dayOfReading(timeZone)} AS day FROM aggregate_readings
     WHERE series = $1 AND start_date >= $2::date - 1`,
    series,
    fromDay
  );
  return new Set(rows.map((r) => r.day));
}
