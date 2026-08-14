import { prisma } from './prisma';
import type { Granularity } from '@prisma/client';

export interface ProductionReadingInput {
  eic_code: string;
  name: string;
  production_type: string;
  start_date: string | Date;
  value: number;
  updated_date?: string | Date;
  granularity?: Granularity; // 'HOUR' | 'DAY' — par défaut 'HOUR'
}

function normalize(r: ProductionReadingInput) {
  return {
    eic_code: r.eic_code,
    name: r.name,
    production_type: r.production_type,
    start_date: new Date(r.start_date),
    granularity: r.granularity ?? ('HOUR' as Granularity),
    value: r.value,
    updated_date: r.updated_date ? new Date(r.updated_date) : new Date(),
  };
}

// ---------- CREATE / UPDATE (upsert = idempotent, safe à rejouer) ----------

export async function upsertReading(input: ProductionReadingInput) {
  const r = normalize(input);
  return prisma.productionReading.upsert({
    where: {
      eic_code_start_date_granularity: {
        eic_code: r.eic_code,
        start_date: r.start_date,
        granularity: r.granularity,
      },
    },
    update: {
      value: r.value,
      updated_date: r.updated_date,
      name: r.name,
      production_type: r.production_type,
    },
    create: r,
  });
}

// Upsert de plusieurs relevés en une transaction (ex : les 57 réacteurs pour
// un créneau horaire donné, envoyés en une seule requête d'ingestion).
export async function upsertReadingsBulk(inputs: ProductionReadingInput[]) {
  const ops = inputs.map((input) => {
    const r = normalize(input);
    return prisma.productionReading.upsert({
      where: {
        eic_code_start_date_granularity: {
          eic_code: r.eic_code,
          start_date: r.start_date,
          granularity: r.granularity,
        },
      },
      update: {
        value: r.value,
        updated_date: r.updated_date,
        name: r.name,
        production_type: r.production_type,
      },
      create: r,
    });
  });
  return prisma.$transaction(ops);
}

// ---------- READ ----------

export async function getReadingsByReactor(
  eic_code: string,
  opts: { from?: Date; to?: Date; granularity?: Granularity } = {}
) {
  return prisma.productionReading.findMany({
    where: {
      eic_code,
      granularity: opts.granularity,
      start_date: {
        gte: opts.from,
        lte: opts.to,
      },
    },
    orderBy: { start_date: 'asc' },
  });
}

// Dernière valeur connue pour une centrale donnée
export async function getLatestForReactor(eic_code: string) {
  return prisma.productionReading.findFirst({
    where: { eic_code },
    orderBy: { start_date: 'desc' },
  });
}

// Dernière valeur connue pour CHAQUE centrale en une seule requête (DISTINCT ON
// + l'index sur start_date rend ça rapide même avec beaucoup d'historique).
export async function getLatestForAllReactors() {
  return prisma.$queryRaw<
    {
      eic_code: string;
      name: string;
      production_type: string;
      start_date: Date;
      granularity: Granularity;
      value: number;
      updated_date: Date;
    }[]
  >`
    SELECT DISTINCT ON (eic_code)
      eic_code, name, production_type, start_date, granularity, value, updated_date
    FROM production_readings
    ORDER BY eic_code, start_date DESC
  `;
}

// Production cumulée (somme de toutes les centrales) pour le graphique.
// bucket='hour' -> uniquement les relevés horaires encore présents (< 7 jours).
// bucket='day'  -> regroupe par jour, que la donnée source soit encore horaire
//                  (semaine en cours) ou déjà convertie en quotidien (plus ancien) ;
//                  comme le downsampling supprime les lignes HOUR converties,
//                  il n'y a jamais de double comptage.
export async function getCumulativeProduction(
  from: Date,
  to: Date,
  bucket: 'hour' | 'day' = 'day'
) {
  if (bucket === 'hour') {
    return prisma.$queryRaw<{ bucket: Date; total_value: number }[]>`
      SELECT start_date AS bucket, SUM(value) AS total_value
      FROM production_readings
      WHERE granularity = 'HOUR' AND start_date >= ${from} AND start_date <= ${to}
      GROUP BY start_date
      ORDER BY start_date
    `;
  }

  return prisma.$queryRaw<{ bucket: Date; total_value: number }[]>`
    SELECT date_trunc('day', start_date) AS bucket, SUM(value) AS total_value
    FROM production_readings
    WHERE start_date >= ${from} AND start_date <= ${to}
    GROUP BY 1
    ORDER BY 1
  `;
}

// ---------- UPDATE explicite (alias lisible autour de upsert) ----------

export async function updateReading(input: ProductionReadingInput) {
  return upsertReading(input);
}

// ---------- DELETE ----------

export async function deleteReading(
  eic_code: string,
  start_date: Date,
  granularity: Granularity = 'HOUR'
) {
  return prisma.productionReading.delete({
    where: {
      eic_code_start_date_granularity: { eic_code, start_date, granularity },
    },
  });
}

// ---------- CRUD table Reactor (référentiel des 57 centrales) ----------

export async function listReactors() {
  return prisma.reactor.findMany({ orderBy: { name: 'asc' } });
}

export async function getReactor(eic_code: string) {
  return prisma.reactor.findUnique({ where: { eic_code } });
}

export async function upsertReactor(data: {
  eic_code: string;
  name: string;
  production_type?: string;
}) {
  return prisma.reactor.upsert({
    where: { eic_code: data.eic_code },
    update: { name: data.name, production_type: data.production_type ?? 'NUCLEAR' },
    create: {
      eic_code: data.eic_code,
      name: data.name,
      production_type: data.production_type ?? 'NUCLEAR',
    },
  });
}

export async function deleteReactor(eic_code: string) {
  return prisma.reactor.delete({ where: { eic_code } });
}
