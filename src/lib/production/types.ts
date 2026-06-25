// Représente une unité de production (un réacteur, une turbine, etc.)
export interface UnitInfo {
    eicCode: string;
    name: string;
    plantName: string;
    commune: string;
    region: string;
    productionType: string;
    puisMaxMw: number;
    sourceFile: string;
}

// Un point de mesure brut retourné par l'API RTE
export interface RteValue {
    start_date: string;
    end_date: string;
    updated_date: string;
    value: number;
}

// Une entrée par unité dans la réponse RTE
export interface RteGenerationEntry {
    start_date: string;
    end_date: string;
    unit: {
        eic_code: string;
        name: string;
        production_type: string;
    };
    values: RteValue[];
}

export interface RteApiResponse {
    actual_generations_per_unit: RteGenerationEntry[];
}