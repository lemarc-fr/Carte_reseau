import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';



const adapter = new PrismaPg({ connectionString: "postgresql://postgres:150718@192.168.0.35:5432/nuclear_production" });
const prisma = new PrismaClient({ adapter });


const REACTORS: { eic_code: string; name: string; production_type: string }[] = [
    { eic_code: '17W100P100P0135M', name: 'GRAVELINES 5', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0136K', name: 'GRAVELINES 6', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0133Q', name: 'GRAVELINES 4', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0130W', name: 'GRAVELINES 1', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0132S', name: 'GRAVELINES 3', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0131U', name: 'GRAVELINES 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0141R', name: 'PALUEL 3', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0142P', name: 'PALUEL 4', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0140T', name: 'PALUEL 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0139E', name: 'PALUEL 1', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0103Z', name: 'CATTENOM 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0105V', name: 'CATTENOM 4', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P01012', name: 'CATTENOM 1', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0104X', name: 'CATTENOM 3', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0126N', name: 'FLAMANVILLE 1', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P03639', name: 'FLAMANVILLE 3', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0127L', name: 'FLAMANVILLE 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0107R', name: 'CHINON 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0106T', name: 'CHINON 1', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0108P', name: 'CHINON 3', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0109N', name: 'CHINON 4', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0093C', name: 'BLAYAIS 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0094A', name: 'BLAYAIS 3', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P00958', name: 'BLAYAIS 4', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0092E', name: 'BLAYAIS 1', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0116Q', name: 'CRUAS 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0118M', name: 'CRUAS 3', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0115S', name: 'CRUAS 1', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0119K', name: 'CRUAS 4', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0152M', name: 'TRICASTIN 3', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0150Q', name: 'TRICASTIN 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0153K', name: 'TRICASTIN 4', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0149B', name: 'TRICASTIN 1', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P00966', name: 'BUGEY 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P00974', name: 'BUGEY 3', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P01004', name: 'BUGEY 5', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P00982', name: 'BUGEY 4', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0122V', name: 'DAMPIERRE 3', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0121X', name: 'DAMPIERRE 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0120Z', name: 'DAMPIERRE 1', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0123T', name: 'DAMPIERRE 4', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0112Y', name: 'CHOOZ 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P01101', name: 'CHOOZ 1', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0114U', name: 'CIVAUX 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0113W', name: 'CIVAUX 1', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0145J', name: 'ST ALBAN 1', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0146H', name: 'ST ALBAN 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0143N', name: 'PENLY 1', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0144L', name: 'PENLY 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0137I', name: 'NOGENT 1', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0138G', name: 'NOGENT 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0091G', name: 'BELLEVILLE 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0090I', name: 'BELLEVILLE 1', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0129H', name: 'GOLFECH 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0128J', name: 'GOLFECH 1', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0148D', name: 'ST LAURENT 2', production_type: 'NUCLEAR' },
    { eic_code: '17W100P100P0147F', name: 'ST LAURENT 1', production_type: 'NUCLEAR' },
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
