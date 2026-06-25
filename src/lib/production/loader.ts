import path from "path";
import fs from "fs";
import type { UnitInfo } from "./types";

// Cache par fichier pour ne pas relire le disque à chaque appel
const _cache = new Map<string, UnitInfo[]>();

function parseProductionFile(filename: string): UnitInfo[] {
    if (_cache.has(filename)) return _cache.get(filename)!;

    const filePath = path.join(process.cwd(), "public", "production", filename);

    if (!fs.existsSync(filePath)) {
        console.warn(`[loader] Fichier introuvable : ${filename}`);
        return [];
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const plants: any[] = JSON.parse(raw);
    const units: UnitInfo[] = [];

    for (const plant of plants) {
        const eics = plant.wikidata_details?.eics;
        if (!eics) continue;

        for (const [eicCode, details] of Object.entries(eics)) {
            // On ignore les codes sans données
            if (!details) continue;

            const d = details as any;

            units.push({
                eicCode,
                name: d.nominstallation ?? eicCode,
                plantName: plant.name ?? "",
                commune: d.commune ?? "",
                region: d.region ?? "",
                productionType: d.filiere?.toUpperCase().replace(/ /g, "_") ?? "UNKNOWN",
                // puismaxinstallee est en W dans le JSON → on convertit en MW
                puisMaxMw: d.puismaxinstallee ? d.puismaxinstallee / 1000 : 0,
                sourceFile: filename,
            });
        }
    }

    console.log(`[loader] ${units.length} unités chargées depuis ${filename}`);
    _cache.set(filename, units);
    return units;
}

// Filières disponibles — ajouter ici quand on ajoute un fichier JSON
const PRODUCTION_FILES = [
    "NUCLEAR.json",
    // "HYDRO.json",
    // "WIND.json",
    // "SOLAR.json",
] as const;

export function loadAllUnits(): UnitInfo[] {
    return PRODUCTION_FILES.flatMap((f) => parseProductionFile(f));
}

export function loadUnitsByType(productionType: string): UnitInfo[] {
    return loadAllUnits().filter((u) => u.productionType === productionType);
}

export function getEicCodes(): string[] {
    return loadAllUnits().map((u) => u.eicCode);
}