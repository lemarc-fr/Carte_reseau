export const RTE_CLIENT_ID:string ="850b7ed4-385e-4d5e-bb94-6e34fe7158e7";
export const RTE_CLIENT_SECRET:string ="b85fc814-c626-4ffc-b62b-989e54248afc";
export const START_DATE:string ="2026-08-01T00:00:00+01:00";
export const END_DATE:string ="2026-08-03T00:00:00+01:00";

export const nuclear_eics: string[] = [
    '17W100P100P0135M', '17W100P100P0136K', '17W100P100P0133Q', '17W100P100P0130W',
    '17W100P100P0132S', '17W100P100P0131U', '17W100P100P0141R', '17W100P100P0142P',
    '17W100P100P0140T', '17W100P100P0139E', '17W100P100P0103Z', '17W100P100P0105V',
    '17W100P100P01012', '17W100P100P0104X', '17W100P100P0126N', '17W100P100P03639',
    '17W100P100P0127L', '17W100P100P0107R', '17W100P100P0106T', '17W100P100P0108P',
    '17W100P100P0109N', '17W100P100P0093C', '17W100P100P0094A', '17W100P100P00958',
    '17W100P100P0092E', '17W100P100P0116Q', '17W100P100P0118M', '17W100P100P0115S',
    '17W100P100P0119K', '17W100P100P0152M', '17W100P100P0150Q', '17W100P100P0153K',
    '17W100P100P0149B', '17W100P100P00966', '17W100P100P00974', '17W100P100P01004',
    '17W100P100P00982', '17W100P100P0122V', '17W100P100P0121X', '17W100P100P0120Z',
    '17W100P100P0123T', '17W100P100P0112Y', '17W100P100P01101', '17W100P100P0114U',
    '17W100P100P0113W', '17W100P100P0145J', '17W100P100P0146H', '17W100P100P0143N',
    '17W100P100P0144L', '17W100P100P0137I', '17W100P100P0138G', '17W100P100P0091G',
    '17W100P100P0090I', '17W100P100P0129H', '17W100P100P0128J', '17W100P100P0148D',
    '17W100P100P0147F',
];

const TOKEN_URL = 'https://digital.iservices.rte-france.com/token/oauth/';
const API_BASE = 'https://digital.iservices.rte-france.com/open_api/actual_generation/v1/actual_generations_per_unit';

const DELAY_BETWEEN_CALLS_MS = 300;

interface RteValue {
    start_date: string;
    end_date: string;
    updated_date: string;
    production_type: string;
    value: number;
}

interface RteUnitResult {
    start_date: string;
    end_date: string;
    unit: { eic_code: string; name: string };
    values: RteValue[];
}

interface RteResponse {
    actual_generations_per_unit: RteUnitResult[];
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Échec de l'authentification RTE (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { access_token: string; token_type: string; expires_in: number };
    return data.access_token;
}

async function fetchActualGenerationForUnit(
    eicCode: string,
    accessToken: string,
    startDate?: string,
    endDate?: string,
): Promise<RteUnitResult[]> {
    const url = new URL(API_BASE);
    url.searchParams.set('unit_eic_code', eicCode);
    if (startDate) url.searchParams.set('start_date', startDate);
    if (endDate) url.searchParams.set('end_date', endDate);

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Erreur API pour ${eicCode} (${res.status}): ${body}`);
    }

    const data = (await res.json()) as RteResponse;
    return data.actual_generations_per_unit ?? [];
}

async function fetchAll(
    eicCodes: string[],
    startDate?: string,
    endDate?: string,
): Promise<RteUnitResult[]> {
    const clientId = RTE_CLIENT_ID;
    const clientSecret = RTE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Définis RTE_CLIENT_ID et RTE_CLIENT_SECRET dans l\'environnement.');
    }

    const accessToken = await getAccessToken(clientId, clientSecret);

    const results: RteUnitResult[] = [];
    const errors: { eic: string; error: string }[] = [];

    for (const [index, eic] of eicCodes.entries()) {
        try {
            const unitResults = await fetchActualGenerationForUnit(eic, accessToken, startDate, endDate);
            results.push(...unitResults);
            console.log(`[${index + 1}/${eicCodes.length}] OK - ${eic}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[${index + 1}/${eicCodes.length}] ERREUR - ${eic}: ${message}`);
            errors.push({ eic, error: message });
        }

        if (index < eicCodes.length - 1) {
            await sleep(DELAY_BETWEEN_CALLS_MS);
        }
    }

    if (errors.length > 0) {
        console.warn(`\n${errors.length} EIC(s) en erreur:`, errors);
    }

    return results;
}

async function main() {

    const results = await fetchAll(nuclear_eics, START_DATE, END_DATE);

    console.log(`\nTotal unités récupérées: ${results.length}`);

    // Écriture du résultat dans un fichier JSON
    const fs = await import('fs/promises');
    const outputPath = 'actual_generations_per_unit.json';
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`Résultats écrits dans ${outputPath}`);
}

main().catch((err) => {
    console.error('Erreur fatale:', err);
    process.exit(1);
});