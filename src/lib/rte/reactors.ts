import path from "path";
import fs from "fs";

export interface ReactorInfo {
    eicCode: string;
    name: string;          // "GRAVELINES 1" (depuis nominstallation ou unit.name RTE)
    plantName: string;     // "Centre Nucléaire de Production d'Electricité de Gravelines"
    commune: string;
    puismaxinstallee: number; // en W dans le JSON, à diviser par 1000 pour MW
}

let _cache: ReactorInfo[] | null = null;

export function loadReactors(): ReactorInfo[] {
    if (_cache) return _cache;

    const filePath = path.join(process.cwd(), "public", "production", "NUCLEAR.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    const plants: any[] = JSON.parse(raw);

    const reactors: ReactorInfo[] = [];

    for (const plant of plants) {
        const eics = plant.wikidata_details?.eics;
        if (!eics) continue;

        for (const [eicCode, details] of Object.entries(eics)) {
            // On ignore les codes sans données
            if (!details) continue;

            const d = details as any;
            reactors.push({
                eicCode,
                name: d.nominstallation ?? eicCode,
                plantName: plant.name,
                commune: d.commune ?? "",
                puismaxinstallee: d.puismaxinstallee ?? 0,
            });
        }
    }

    _cache = reactors;
    console.log(`[reactors] ${reactors.length} réacteurs chargés depuis NUCLEAR.json`);
    return reactors;
}

export function getEicCodes(): string[] {
    return loadReactors().map((r) => r.eicCode);
}