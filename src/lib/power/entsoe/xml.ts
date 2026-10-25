// Lecture des documents de l'API ENTSO-E Transparency (GL_MarketDocument) :
// TimeSeries > Period (timeInterval, resolution) > Point (position, quantity).
// Schéma fixe et documenté : quelques expressions régulières suffisent.

export interface EntsoePoint {
  start: number; // epoch ms
  value: number; // MW
}

export interface EntsoeSeries {
  psrType: string | null; // B01…B25
  inDomain: string | null; // production (inBiddingZone_Domain / in_Domain)
  outDomain: string | null; // consommation (pompage, recharge) : outBiddingZone_Domain
  resourceId: string | null; // code EIC du groupe (production par groupe)
  resourceName: string | null;
  resolutionMs: number;
  points: EntsoePoint[];
}

export interface EntsoeDocument {
  created: string | null; // createdDateTime, ISO
  series: EntsoeSeries[];
}

/** Réponse « pas de données » de l'API (Acknowledgement, raison 999). */
export class EntsoeNoData extends Error {}

const escape = (name: string) => name.replace(/[.]/g, '\\.');

function blocks(xml: string, name: string): string[] {
  const re = new RegExp(`<${escape(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escape(name)}>`, 'g');
  return [...xml.matchAll(re)].map((m) => m[1]);
}

function text(xml: string, name: string): string | null {
  return blocks(xml, name)[0]?.trim() ?? null;
}

/** Durée ISO 8601 des résolutions ENTSO-E (PT15M, PT30M, PT60M, PT1H, P1D, P7D) en ms. */
export function resolutionMs(duration: string): number {
  const m = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) {
    // P1Y, P1M (puissance installée) : un seul point par période
    if (/^P\d+[YM]$/.test(duration)) return 0;
    throw new Error(`ENTSO-E : résolution inconnue "${duration}"`);
  }
  return ((Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 60_000;
}

/**
 * Points d'une période. En courbe A03, une position absente reprend la valeur de la
 * précédente jusqu'à la fin de la période.
 */
function periodPoints(period: string, curveType: string | null): { resolution: number; points: EntsoePoint[] } {
  const interval = blocks(period, 'timeInterval')[0] ?? '';
  const start = Date.parse(text(interval, 'start') ?? '');
  const end = Date.parse(text(interval, 'end') ?? '');
  const resolution = resolutionMs(text(period, 'resolution') ?? '');
  if (Number.isNaN(start)) throw new Error('ENTSO-E : période sans début');

  const byPosition = new Map<number, number>();
  for (const point of blocks(period, 'Point')) {
    const position = Number(text(point, 'position'));
    const quantity = Number(text(point, 'quantity'));
    if (Number.isInteger(position) && Number.isFinite(quantity)) byPosition.set(position, quantity);
  }
  if (!resolution) {
    const value = byPosition.get(1);
    return { resolution, points: value === undefined ? [] : [{ start, value }] };
  }

  const points: EntsoePoint[] = [];
  if (curveType === 'A03' && !Number.isNaN(end)) {
    const count = Math.round((end - start) / resolution);
    let last: number | undefined;
    for (let position = 1; position <= count; position++) {
      last = byPosition.get(position) ?? last;
      if (last !== undefined) points.push({ start: start + (position - 1) * resolution, value: last });
    }
  } else {
    for (const [position, value] of [...byPosition].sort((a, b) => a[0] - b[0])) {
      points.push({ start: start + (position - 1) * resolution, value });
    }
  }
  return { resolution, points };
}

export function parseDocument(xml: string): EntsoeDocument {
  if (xml.includes('Acknowledgement_MarketDocument')) {
    const reason = blocks(xml, 'Reason')[0] ?? '';
    const code = text(reason, 'code');
    const message = text(reason, 'text') ?? 'réponse sans données';
    if (code === '999') throw new EntsoeNoData(message);
    throw new Error(`ENTSO-E : ${message}`);
  }

  const series: EntsoeSeries[] = [];
  for (const ts of blocks(xml, 'TimeSeries')) {
    const psr = blocks(ts, 'MktPSRType')[0] ?? '';
    const resource = blocks(psr, 'PowerSystemResources')[0] ?? '';
    const curveType = text(ts, 'curveType');
    for (const period of blocks(ts, 'Period')) {
      const { resolution, points } = periodPoints(period, curveType);
      series.push({
        psrType: text(psr, 'psrType'),
        inDomain: text(ts, 'inBiddingZone_Domain.mRID') ?? text(ts, 'in_Domain.mRID'),
        outDomain: text(ts, 'outBiddingZone_Domain.mRID') ?? text(ts, 'out_Domain.mRID'),
        resourceId: text(resource, 'mRID') ?? text(ts, 'registeredResource.mRID'),
        resourceName: text(resource, 'name') ?? text(ts, 'registeredResource.name'),
        resolutionMs: resolution,
        points,
      });
    }
  }
  return { created: text(xml, 'createdDateTime'), series };
}

/** Moyennes horaires (début d'heure UTC -> MW) de points à pas fin (15 ou 30 min). */
export function hourlyAverages(points: EntsoePoint[]): Map<number, number> {
  const HOUR = 3_600_000;
  const sums = new Map<number, { sum: number; n: number }>();
  for (const { start, value } of points) {
    const hour = Math.floor(start / HOUR) * HOUR;
    const acc = sums.get(hour) ?? { sum: 0, n: 0 };
    acc.sum += value;
    acc.n++;
    sums.set(hour, acc);
  }
  return new Map([...sums].map(([hour, { sum, n }]) => [hour, sum / n]));
}
