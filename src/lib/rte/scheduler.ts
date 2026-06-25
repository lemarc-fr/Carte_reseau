import cron from "node-cron";
import { fetchAllUnits } from "./fetch";
import { storeEntries } from "./store";

export function scheduleJob(): void {
    cron.schedule("*/30 * * * *", async () => {
        console.log("[cron] Déclenchement fetch RTE...");
        try {
            const now = new Date();
            const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const entries = await fetchAllUnits(from, now);
            const count = await storeEntries(entries);
            console.log(`[cron] ${count} points mis à jour.`);
        } catch (err) {
            console.error("[cron] Erreur :", err);
        }
    });

    console.log("[cron] Job planifié (toutes les 30 min).");
}