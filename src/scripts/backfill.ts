import 'dotenv/config';
import { addDays, parisDay } from '@/lib/power/rte';
import { ingestDays } from '@/lib/power/ingest';
import { downsampleOldHourlyData } from '@/lib/downsample';
import { prisma } from '@/lib/prisma';

// Usage : npm run backfill -- [jours]   (7 par défaut)
// Récupère la production RTE des N derniers jours (aujourd'hui inclus), puis
// convertit en journalier ce qui dépasse la rétention horaire.

async function main() {
  const days = Number(process.argv[2] ?? 7);
  if (!Number.isInteger(days) || days < 1) throw new Error(`Nombre de jours invalide : ${process.argv[2]}`);

  const today = parisDay();
  const from = addDays(today, -(days - 1));
  console.log(`Récupération RTE du ${from} au ${today}…`);

  const rows = await ingestDays(from, addDays(today, 1));
  console.log(`${rows} relevé(s) horaires écrits.`);

  const { insertedOrUpdated, deletedHourlyRows } = await downsampleOldHourlyData();
  console.log(`Sous-échantillonnage : ${insertedOrUpdated} jour(s) agrégés, ${deletedHourlyRows} relevés horaires supprimés.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
