import { getRteToken } from "./auth";
import { loadAllUnits } from "../production/loader";
import { prisma } from "../db/client";
import type { RteGenerationEntry, RteApiResponse } from "../production/types";

const BASE_URL =
    "https://digital.iservices.rte-france.com/open_api/actual_generation/v1/actual_generations_per_unit";

// Concurrence max vers l'API RTE — ajuster si rate limit
const CONCURRENCY = 10;

function toIso(date: Date): string {
    return date.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

function buildDateRanges(from: Date, to: Date): Array<{ start: Date; end: Date }> {
    const ranges: Array<{ start: Date; end: Date }> = [];
    let cursor = new Date(from);

    while (cursor < to) {
        const next = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
        ranges.push({ start: new Date(cursor), end: next > to ? new Date(to) : next });
        cursor = next;
    }

    return ranges;
}

async function fetchSingleUnit(
    token: string,
    eic: string,
    start: Date,
    end: Date
): Promise<RteGenerationEntry[]> {
    const params = new URLSearchParams({
        start_date: toIso(start),
        end_date: toIso(end),
        unit_eic_code: eic,
    });

    const response = await fetch(`${BASE_URL}?${params}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
        },
    });

    if (!response.ok) {
        // On log et on continue — une unité en erreur ne bloque pas tout
        console.error(`[fetch] Erreur ${response.status} pour ${eic} (${toIso(start)} → ${toIso(end)})`);
        return [];
    }

    const data: RteApiResponse = await response.json();
    return data.actual_generations_per_unit ?? [];
}

// Pool de concurrence : N workers tirent les tâches d'une file
async function withConcurrency<T>(
    tasks: (() => Promise<T>)[],
    concurrency: number
): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let index = 0;

    async function worker() {
        while (true) {
            const i = index++;
            if (i >= tasks.length) break;
            results[i] = await tasks[i]();
        }
    }

    await Promise.all(Array.from({ length: concurrency }, worker));
    return results;
}

export async function fetchAllUnits(from: Date, to: Date): Promise<RteGenerationEntry[]> {
    const token = await getRteToken();
    const ranges = buildDateRanges(from, to);
    const eics = loadAllUnits().map((u) => u.eicCode);

    console.log(
        `[fetch] ${eics.length} unités × ${ranges.length} tranche(s) = ${eics.length * ranges.length} requêtes`
    );

    // On construit la liste de toutes les tâches (eic × tranche)
    const tasks = ranges.flatMap((range) =>
        eics.map(
            (eic) => () => fetchSingleUnit(token, eic, range.start, range.end)
        )
    );

    const results = await withConcurrency(tasks, CONCURRENCY);

    // Aplatit le tableau de tableaux
    return results.flat();
}