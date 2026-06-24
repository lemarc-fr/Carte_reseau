import { prisma } from "../db/client";
import { loadAllUnits } from "../production/loader";
import type {RteGenerationEntry} from "../production/types";

const BATCH_SIZE = 500;

// Pré-charge le mapping eicCode → unitId depuis la DB
// et insère les unités manquantes
async function syncUnitsAndGetIdMap(): Promise<Map<string, number>> {
    const unitsFromFiles = loadAllUnits();

    // Upsert de toutes les unités connues (métadonnées)
    for (const u of unitsFromFiles) {
        await prisma.unit.upsert({
            where: { eicCode: u.eicCode },
            update: {
                name: u.name,
                plantName: u.plantName,
                commune: u.commune,
                region: u.region,
                productionType: u.productionType,
                puisMaxMw: u.puisMaxMw,
                sourceFile: u.sourceFile,
            },
            create: {
                eicCode: u.eicCode,
                name: u.name,
                plantName: u.plantName,
                commune: u.commune,
                region: u.region,
                productionType: u.productionType,
                puisMaxMw: u.puisMaxMw,
                sourceFile: u.sourceFile,
            },
        });
    }

    // Charge tous les ids depuis la DB
    const dbUnits = await prisma.unit.findMany({
        select: { id: true, eicCode: true },
    });

    return new Map(dbUnits.map((u) => [u.eicCode, u.id]));
}

// Découpe un tableau en chunks de taille N
function chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

export async function storeEntries(entries: RteGenerationEntry[]): Promise<number> {
    const idMap = await syncUnitsAndGetIdMap();

    // Aplatit toutes les valeurs avec leur unitId résolu
    type Row = {
        unitId: number;
        startDate: Date;
        endDate: Date;
        updatedDate: Date;
        valueMw: number;
    };

    const rows: Row[] = [];

    for (const entry of entries) {
        const unitId = idMap.get(entry.unit.eic_code);
        if (!unitId) {
            console.warn(`[store] EIC inconnu en DB : ${entry.unit.eic_code}`);
            continue;
        }

        for (const v of entry.values) {
            rows.push({
                unitId,
                startDate: new Date(v.start_date),
                endDate: new Date(v.end_date),
                updatedDate: new Date(v.updated_date),
                valueMw: v.value,
            });
        }
    }

    if (rows.length === 0) return 0;

    // Batch upserts par tranches de BATCH_SIZE
    const batches = chunk(rows, BATCH_SIZE);
    let count = 0;

    for (const batch of batches) {
        // createMany + skipDuplicates est plus performant qu'un upsert en boucle
        // On update ensuite les lignes existantes avec les nouvelles valeurs
        const result = await prisma.productionValue.createMany({
            data: batch,
            skipDuplicates: false, // on gère le conflit manuellement ci-dessous
        });
        count += result.count;
    }
//TODO : // Remplace la boucle de batch ci-dessus par :
// await prisma.$transaction(
//   rows.map((row) =>
//     prisma.productionValue.upsert({
//       where: {
//         unitId_startDate: {
//           unitId: row.unitId,
//           startDate: row.startDate,
//         },
//       },
//       update: {
//         valueMw: row.valueMw,
//         updatedDate: row.updatedDate,
//         fetchedAt: new Date(),
//       },
//       create: row,
//     })
//   )
// );
    // Note : SQLite ne supporte pas createMany avec ON CONFLICT DO UPDATE
    // On utilise donc upsert groupé via une transaction
    // (voir note ci-dessous)

    return count;
}