import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();


const REACTORS: { eic_code: string; name: string; production_type: string }[] = [
  { eic_code: '17W100P100P0135M', name: 'GRAVELINES 5', production_type: 'NUCLEAR' },
  { eic_code: '17W100P100P0134O', name: 'GRAVELINES 4', production_type: 'NUCLEAR' },
  // ... compléter les 55 réacteurs restants (Bugey, Chinon, Cattenom,
  // Cruas, Dampierre, Belleville, Nogent, Saint-Laurent, Blayais, Golfech,
  // Tricastin, Chooz, Civaux, Flamanville, Paluel, Penly, Fessenheim si applicable, etc.)
];

async function main() {
  for (const reactor of REACTORS) {
    await prisma.reactor.upsert({
      where: { eic_code: reactor.eic_code },
      update: reactor,
      create: reactor,
    });
  }
  console.log(`${REACTORS.length} réacteurs insérés/mis à jour.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
