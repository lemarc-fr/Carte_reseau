import 'dotenv/config';
import { addDays, dayIn } from '@/lib/power/days';
import { backfillHistory, backfillStart, ingestDays } from '@/lib/power/ingest';
import { COUNTRIES } from '@/lib/power/countries';
import { downsampleOldHourlyData } from '@/lib/downsample';
import { prisma } from '@/lib/prisma';

// Usage :
//   npm run backfill            -> complète l'historique depuis BACK_FILL_START (.env)
//   npm run backfill -- 30      -> (re)télécharge les 30 derniers jours
// Le serveur fait déjà le rattrapage à son démarrage ; ce script sert à le lancer à la
// main ou à rejouer une période.

async function main() {
  const arg = process.argv[2];
  const countries = COUNTRIES.filter((c) => c.enabled());

  if (arg === undefined) {
    const start = backfillStart();
    if (!start) throw new Error('Définir BACK_FILL_START (YYYY-MM-DD) dans .env ou passer un nombre de jours');
    for (const country of countries) {
      const rows = await backfillHistory(country);
      console.log(`${country.code} : ${rows ? `${rows} relevé(s) écrits` : 'historique déjà complet'} depuis le ${start}.`);
    }
    return;
  }

  const days = Number(arg);
  if (!Number.isInteger(days) || days < 1) throw new Error(`Nombre de jours invalide : ${arg}`);

  for (const country of countries) {
    const today = dayIn(country.timeZone);
    const from = addDays(today, -(days - 1));
    console.log(`${country.code} : récupération du ${from} au ${today}…`);
    const rows = await ingestDays(country, from, addDays(today, 1), (source, start, end, n) =>
      console.log(`  ${source.padEnd(20)} ${start} → ${end} : ${n}`)
    );
    console.log(`${rows} relevé(s) écrits.`);
  }

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
