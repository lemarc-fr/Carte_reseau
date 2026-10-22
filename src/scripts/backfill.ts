import 'dotenv/config';
import { addDays, parisDay } from '@/lib/power/rte';
import { backfillHistory, backfillStart, ingestDays } from '@/lib/power/ingest';
import { downsampleOldHourlyData } from '@/lib/downsample';
import { prisma } from '@/lib/prisma';

// Usage :
//   npm run backfill            -> complète l'historique depuis BACK_FILL_START (.env)
//   npm run backfill -- 30      -> (re)télécharge les 30 derniers jours
// Le serveur fait déjà le premier rattrapage à son démarrage ; ce script sert à le
// lancer à la main ou à rejouer une période.

async function main() {
  const arg = process.argv[2];

  if (arg === undefined) {
    const start = backfillStart();
    if (!start) throw new Error('Définir BACK_FILL_START (YYYY-MM-DD) dans .env ou passer un nombre de jours');
    const rows = await backfillHistory();
    console.log(rows ? `${rows} relevé(s) écrits depuis le ${start}.` : `Historique déjà complet depuis le ${start}.`);
    return;
  }

  const days = Number(arg);
  if (!Number.isInteger(days) || days < 1) throw new Error(`Nombre de jours invalide : ${arg}`);

  const today = parisDay();
  const from = addDays(today, -(days - 1));
  console.log(`Récupération RTE du ${from} au ${today}…`);
  const rows = await ingestDays(from, addDays(today, 1), (start, end, n) => console.log(`  ${start} → ${end} : ${n}`));
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
