import { EntsoeNoData, parseDocument, type EntsoeDocument } from './xml';

// API REST de la plateforme de transparence ENTSO-E : https://transparency.entsoe.eu
// Jeton personnel ENTSOE_API_KEY (compte gratuit, puis demande d'accès « Restful API »
// à transparency@entsoe.eu). Limite : 400 requêtes par minute.

const API_URL = 'https://web-api.tp.entsoe.eu/api';

export const hasEntsoeToken = () => Boolean(process.env.ENTSOE_API_KEY?.trim());

// yyyyMMddHHmm en UTC
const stamp = (date: Date) => date.toISOString().slice(0, 16).replace(/[-:T]/g, '');

/** Document ENTSO-E sur [from, to[ ; vide si l'API n'a rien à publier. */
export async function entsoeQuery(params: Record<string, string>, from: Date, to: Date): Promise<EntsoeDocument> {
  const token = process.env.ENTSOE_API_KEY?.trim();
  if (!token) throw new Error('ENTSOE_API_KEY absente');
  const url = new URL(API_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('periodStart', stamp(from));
  url.searchParams.set('periodEnd', stamp(to));

  // Jeton ajouté après coup : il n'apparaît pas dans les messages d'erreur
  const res = await fetch(`${url}&securityToken=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(120_000),
  });
  if (res.headers.get('content-type')?.includes('zip')) {
    throw new Error(`ENTSO-E ${params.documentType} : réponse zip non gérée`);
  }
  const body = await res.text();
  try {
    if (!res.ok && !body.includes('Acknowledgement_MarketDocument')) {
      throw new Error(`ENTSO-E ${params.documentType} (${res.status}) : ${body.slice(0, 200)}`);
    }
    return parseDocument(body);
  } catch (err) {
    if (err instanceof EntsoeNoData) return { created: null, series: [] };
    throw err;
  }
}
