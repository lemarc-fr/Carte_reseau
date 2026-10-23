import { prisma } from './prisma';

const RETENTION_DAYS = 7;

/**
 * Convertit en quotidien toutes les données horaires plus vieilles que
 * `retentionDays` jours :
 *  1. Calcule la moyenne des valeurs horaires de chaque jour, par centrale.
 *  2. Insère (ou met à jour si déjà fait) la ligne journalière correspondante.
 *  3. Supprime les lignes horaires devenues obsolètes.
 *
 * Le tout dans une transaction : soit les deux étapes réussissent, soit
 * aucune donnée n'est perdue.
 *
 * Remarque sur l'agrégation : ici la valeur quotidienne = moyenne des 24
 * valeurs horaires (puissance moyenne du jour, même unité que la donnée
 * source, ex MW). Si vous préférez une énergie quotidienne cumulée
 * (MWh ≈ somme des 24 valeurs horaires puisque le pas est d'1h), remplacez
 * AVG(value) par SUM(value) ci-dessous.
 */

let intervalId: NodeJS.Timeout | null = null;

export function startDownSampleRefresh() {
  if (intervalId) return;
  const run = () =>
    downsampleOldHourlyData().catch((err) => console.error('[downsample] échec :', err));
  run();
  intervalId = setInterval(run, 24 * 60 * 60 * 1000);
}
export async function downsampleOldHourlyData(retentionDays: number = RETENTION_DAYS) {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);

  return prisma.$transaction(async (tx) => {
    const insertedOrUpdated = await tx.$executeRaw`
      INSERT INTO production_readings
        (eic_code, name, production_type, start_date, granularity, value, updated_date, created_at)
      SELECT
        eic_code,
        MAX(name),
        MAX(production_type),
        date_trunc('day', start_date) AS start_date,
        'DAY'::"Granularity",
        AVG(value) AS value,
        now(),
        now()
      FROM production_readings
      WHERE granularity = 'HOUR' AND start_date < ${cutoff}
      GROUP BY eic_code, date_trunc('day', start_date)
      ON CONFLICT (eic_code, start_date, granularity)
      DO UPDATE SET value = EXCLUDED.value, updated_date = EXCLUDED.updated_date
    `;

    const deletedHourlyRows = await tx.$executeRaw`
      DELETE FROM production_readings
      WHERE granularity = 'HOUR' AND start_date < ${cutoff}
    `;

    // Même traitement pour les séries agrégées (production nationale, taux de charge
    // régionaux), pour qu'elles restent alignées sur les relevés des groupes.
    await tx.$executeRaw`
      INSERT INTO aggregate_readings (series, start_date, granularity, value, updated_date, created_at)
      SELECT series, date_trunc('day', start_date), 'DAY'::"Granularity", AVG(value), now(), now()
      FROM aggregate_readings
      WHERE granularity = 'HOUR' AND start_date < ${cutoff}
      GROUP BY series, date_trunc('day', start_date)
      ON CONFLICT (series, start_date, granularity)
      DO UPDATE SET value = EXCLUDED.value, updated_date = EXCLUDED.updated_date
    `;
    await tx.$executeRaw`
      DELETE FROM aggregate_readings
      WHERE granularity = 'HOUR' AND start_date < ${cutoff}
    `;

    return { cutoff, insertedOrUpdated, deletedHourlyRows };
  }, { timeout: 5 * 60 * 1000 }); // un rattrapage (BACK_FILL_START) peut laisser des centaines de milliers de lignes
}
