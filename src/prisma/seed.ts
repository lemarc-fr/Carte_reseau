import 'dotenv/config';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '@/lib/prisma';
import { linkUnitsToPlants } from '@/lib/power/fr/unitPlants';
import { SEED_DIR, type SeedFile } from './format';

// Usage : npm run db:seed            (applique les changements)
//         npm run db:seed -- --dry-run   (affiche les changements sans écrire)
// Applique dataset/seed/<pays>.json, produits par `npm run db:seed:build`. Aucune transformation
// ici : l'état actuel de la base est lu, comparé aux fichiers, et seuls les écarts sont écrits
// (insertions groupées, mises à jour des seuls champs modifiés, suppressions).
// Idempotent : un second passage sur les mêmes fichiers n'écrit rien.

const DRY_RUN = process.argv.includes('--dry-run');
const INSERT_BATCH = 500;
const UPDATE_BATCH = 200;
const DELETE_BATCH = 1000;

type ArrayItem<T> = T extends readonly (infer E)[] ? E : never;
type PlantRow = ArrayItem<NonNullable<Parameters<typeof prisma.plant.createMany>[0]>['data']>;
type UnitRow = ArrayItem<NonNullable<Parameters<typeof prisma.unit.createMany>[0]>['data']>;
type UnitState = { eic_code: string; plant_id: string | null; [field: string]: unknown };

// Valeur comparable entre la base (Date, Decimal, Json) et les fichiers (ISO, nombres, tableaux)
function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === 'object') {
    if ('toNumber' in value && typeof value.toNumber === 'function') return value.toNumber();
    return JSON.stringify(value);
  }
  return value ?? null;
}

/** Champs de `target` qui diffèrent de `current`, ou null si rien ne change. */
function changes<T extends object>(current: Record<string, unknown>, target: T): Partial<T> | null {
  const changed = Object.entries(target).filter(([key, value]) => normalize(current[key]) !== normalize(value));
  return changed.length ? (Object.fromEntries(changed) as Partial<T>) : null;
}

async function inBatches<T>(items: T[], size: number, run: (batch: T[]) => Promise<unknown>) {
  if (DRY_RUN) return;
  for (let i = 0; i < items.length; i += size) await run(items.slice(i, i + size));
}

async function seedCountry({ country, datasets }: SeedFile, units: Map<string, UnitState>) {
  const plants = datasets.flatMap((d) => d.plants);
  const seedIds = new Set(plants.map((p) => p.id));
  const existing = new Map(
    (await prisma.plant.findMany({ where: { country } })).map((p) => [p.id, p as Record<string, unknown>])
  );

  // ─── Sites ───
  const plantInserts: PlantRow[] = [];
  const plantUpdates: { id: string; data: Partial<PlantRow> }[] = [];
  for (const { units: _units, ...row } of plants) {
    const current = existing.get(row.id);
    if (!current) {
      plantInserts.push(row);
      continue;
    }
    const data = changes(current, row);
    if (data) plantUpdates.push({ id: row.id, data });
  }
  const plantDeletes = [...existing.keys()].filter((id) => !seedIds.has(id));

  // ─── Groupes ───
  const unitInserts: UnitRow[] = [];
  const unitUpdates: { eic_code: string; data: Partial<UnitRow> }[] = [];
  const seedEics = new Set<string>();
  for (const plant of plants) {
    for (const unit of plant.units) {
      seedEics.add(unit.eic_code);
      const row: UnitRow = { ...unit, plant_id: plant.id };
      const current = units.get(unit.eic_code);
      if (!current) {
        unitInserts.push(row);
        continue;
      }
      const data = changes(current, row);
      if (data) unitUpdates.push({ eic_code: unit.eic_code, data });
    }
  }
  // Groupes rattachés à un site du pays mais retirés des jeux (ex. codes EIC remplacés par des BMU).
  // Les groupes RTE rattachés par leur nom le sont de nouveau par linkUnitsToPlants.
  const unitDetaches = [...units.values()]
    .filter((u) => u.plant_id !== null && seedIds.has(u.plant_id) && !seedEics.has(u.eic_code))
    .map((u) => u.eic_code);

  // ─── Écritures ───
  await inBatches(plantInserts, INSERT_BATCH, (data) => prisma.plant.createMany({ data }));
  await inBatches(plantUpdates, UPDATE_BATCH, (batch) =>
    prisma.$transaction(batch.map(({ id, data }) => prisma.plant.update({ where: { id }, data })))
  );
  await inBatches(unitInserts, INSERT_BATCH, (data) => prisma.unit.createMany({ data }));
  await inBatches(unitUpdates, UPDATE_BATCH, (batch) =>
    prisma.$transaction(batch.map(({ eic_code, data }) => prisma.unit.update({ where: { eic_code }, data })))
  );
  // Sites retirés : leurs groupes restent, détachés (ON DELETE SET NULL)
  await inBatches(plantDeletes, DELETE_BATCH, (ids) => prisma.plant.deleteMany({ where: { id: { in: ids } } }));
  await inBatches(unitDetaches, DELETE_BATCH, (eics) =>
    prisma.unit.updateMany({ where: { eic_code: { in: eics } }, data: { plant_id: null } })
  );

  console.log(
    `${country}  ${String(plants.length).padStart(6)} sites  ` +
      `+${plantInserts.length} ~${plantUpdates.length} -${plantDeletes.length}  |  ` +
      `groupes +${unitInserts.length} ~${unitUpdates.length} détachés ${unitDetaches.length}`
  );
}

async function main() {
  const files = existsSync(SEED_DIR) ? readdirSync(SEED_DIR).filter((f) => f.endsWith('.json')).sort() : [];
  if (!files.length) throw new Error(`Aucun fichier dans ${SEED_DIR} : lancez d'abord npm run db:seed:build`);
  if (DRY_RUN) console.log('Simulation (--dry-run) : aucune écriture.');

  const units = new Map<string, UnitState>(
    (
      await prisma.unit.findMany({
        select: {
          eic_code: true,
          name: true,
          production_type: true,
          country: true,
          capacity_mw: true,
          commissioning_date: true,
          plant_id: true,
        },
      })
    ).map((u) => [u.eic_code, u])
  );

  for (const file of files) {
    await seedCountry(JSON.parse(readFileSync(join(SEED_DIR, file), 'utf-8')) as SeedFile, units);
  }

  if (DRY_RUN) return;
  const linked = await linkUnitsToPlants();
  console.log(`${linked} groupe(s) RTE rattaché(s) par leur nom.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
