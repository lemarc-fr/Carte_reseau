import { prisma } from '../prisma';

// Rattachement des groupes publiés par RTE à leur centrale, quand le code EIC du
// groupe n'apparaît pas dans les jeux de données (cas de l'hydraulique : RTE publie
// par groupe, le registre ODRE et HYDRO.json par site). Clé = début du nom RTE.
export const UNIT_NAME_PLANTS: { prefix: string; plantId: string }[] = [
  { prefix: 'AIGLE ', plantId: 'hydro-aigle' },
  { prefix: 'BATHIE ', plantId: 'hydro-la-bathie' },
  { prefix: 'BORT ', plantId: 'hydro-bort' },
  { prefix: 'BROMMAT ', plantId: 'hydro-brommat' },
  { prefix: 'CHASTANG ', plantId: 'hydro-chastang' },
  { prefix: 'CHEYLAS ', plantId: 'hydro-le-cheylas' },
  { prefix: 'COCHE ', plantId: 'hydro-la-coche' },
  { prefix: "COMBE D'AVRIEUX", plantId: 'hydro-combe-d-avrieux' },
  { prefix: 'GRAND MAISON ', plantId: 'hydro-grand-maison' },
  { prefix: 'MONTEZIC ', plantId: 'hydro-montezic' },
  { prefix: 'POUGET ', plantId: 'hydro-pouget' },
  { prefix: 'REVIN ', plantId: 'hydro-revin' },
  // « SAINT-PIERRE » : usine de Saint-Pierre-Marèges (SHEM, commune de Saint-Pierre),
  // classée comme Chastang en « run of river and poundage » par RTE
  { prefix: 'SAINT-PIERRE', plantId: 'hydro-saint-pierre' },
  { prefix: 'SISTERON ', plantId: 'hydro-sisteron' },
  { prefix: 'SUPER BISSORTE ', plantId: 'hydro-super-bissorte' },
  { prefix: 'VILLARODIN ', plantId: 'hydro-villarodin' },
];

/** Rattache les groupes encore orphelins aux centrales existantes. Renvoie le nombre de groupes liés. */
export async function linkUnitsToPlants(): Promise<number> {
  const plantIds = new Set(
    (await prisma.plant.findMany({ select: { id: true } })).map((p) => p.id)
  );
  let linked = 0;
  for (const { prefix, plantId } of UNIT_NAME_PLANTS) {
    if (!plantIds.has(plantId)) continue;
    const { count } = await prisma.unit.updateMany({
      where: { plant_id: null, name: { startsWith: prefix } },
      data: { plant_id: plantId },
    });
    linked += count;
  }
  return linked;
}
