import { prisma } from "./lib/db/client";
import { fetchAllUnits } from "./lib/rte/fetch";
import { storeEntries } from "./lib/rte/store";
import { loadAllUnits } from "./lib/production/loader";

const BACKFILL_DAYS = 7;

export async function runStartup(): Promise<void> {
    // Charge et logue les unités connues
    const units = loadAllUnits();
    console.log(`[startup] ${units.length} unités connues au total`);

    const latest = await prisma.productionValue.findFirst({
        orderBy: { startDate: "desc" },
        select: { startDate: true },
    });

    const now = new Date();
    let from: Date;

    if (!latest) {
        from = new Date(now.getTime() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);
        console.log(`[startup] DB vide → backfill depuis ${from.toISOString()}`);
    } else {
        from = latest.startDate;
        const diffH = Math.round((now.getTime() - from.getTime()) / 3_600_000);
        console.log(`[startup] Dernière entrée il y a ~${diffH}h, backfill depuis ${from.toISOString()}`);
    }

    if (now.getTime() - from.getTime() < 60_000) {
        console.log("[startup] DB à jour, rien à faire.");
        return;
    }

    const entries = await fetchAllUnits(from, now);
    const count = await storeEntries(entries);
    console.log(`[startup] ${count} points insérés/mis à jour.`);
}