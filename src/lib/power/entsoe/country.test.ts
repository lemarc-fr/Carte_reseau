import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDocument } from './xml';
import { A68, A73, A75, NO_DATA } from './fixtures';

vi.mock('../store', () => ({
  upsertAggregates: vi.fn(async (rows: unknown[]) => rows.length),
  upsertUnits: vi.fn(async (_country: string, units: unknown[]) => units.length),
  aggregateDays: vi.fn(async () => new Set()),
  unitDays: vi.fn(async () => new Set()),
}));
const store = await import('../store');
const { entsoeCountry, loadFactors, netHourly } = await import('./country');
const { PSR_TYPES } = await import('./psr');

const H = (iso: string) => Date.parse(iso);
const BE = { code: 'BE', name: 'Belgique', timeZone: 'Europe/Brussels', domain: '10YBE----------2' };

describe('netHourly', () => {
  it('soustrait le pompage des STEP et moyenne par heure', () => {
    const byType = netHourly(parseDocument(A75).series, (s) => PSR_TYPES[s.psrType ?? '']);
    expect([...byType.get('NUCLEAR')!]).toEqual([[H('2026-10-23T22:00Z'), 3930]]);
    expect([...byType.get('HYDRO_PUMPED_STORAGE')!]).toEqual([
      [H('2026-10-23T22:00Z'), 200],
      [H('2026-10-23T23:00Z'), -200],
    ]);
  });
});

describe('loadFactors', () => {
  it('rapporte la production d’une famille à sa puissance installée', () => {
    const byType = new Map([
      ['WIND_ONSHORE', new Map([[0, 600]])],
      ['WIND_OFFSHORE', new Map([[0, 400]])],
      ['SOLAR', new Map([[0, 50]])],
    ]);
    const factors = loadFactors(byType, new Map([['WIND_ONSHORE', 1500], ['WIND_OFFSHORE', 500]]));
    expect(factors.get('WIND')?.get(0)).toBe(0.5);
    expect(factors.has('SOLAR')).toBe(false); // puissance installée inconnue
  });
});

describe('entsoeCountry', () => {
  const urls: URL[] = [];
  beforeEach(() => {
    vi.stubEnv('ENTSOE_API_KEY', 'jeton-secret');
    urls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = new URL(input);
        urls.push(url);
        const body = { A75, A73, A68 }[url.searchParams.get('documentType') as 'A75'] ?? NO_DATA;
        return new Response(body, { status: 200, headers: { 'content-type': 'text/xml' } });
      })
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.mocked(store.upsertAggregates).mockClear();
    vi.mocked(store.upsertUnits).mockClear();
  });

  it('dépend du jeton et de ENTSOE_COUNTRIES', () => {
    const country = entsoeCountry(BE);
    expect(country.enabled()).toBe(true);
    vi.stubEnv('ENTSOE_COUNTRIES', 'DE, NL');
    expect(country.enabled()).toBe(false);
    vi.stubEnv('ENTSOE_COUNTRIES', 'de,be');
    expect(country.enabled()).toBe(true);
    vi.stubEnv('ENTSOE_API_KEY', '');
    expect(country.enabled()).toBe(false);
  });

  it('écrit filières, total et taux de charge nationaux', async () => {
    const [perType] = entsoeCountry(BE).sources;
    await perType.ingest('2026-10-25', '2026-10-26');

    const a75 = urls.find((u) => u.searchParams.get('documentType') === 'A75')!;
    expect(a75.searchParams.get('in_Domain')).toBe('10YBE----------2');
    expect(a75.searchParams.get('periodStart')).toBe('202610242200'); // minuit à Bruxelles (heure d'été)
    expect(a75.searchParams.get('periodEnd')).toBe('202610252300'); // minuit après le passage à l'heure d'hiver

    const rows = vi.mocked(store.upsertAggregates).mock.calls[0][0];
    const at = (series: string, iso: string) => rows.find((r) => r.series === series && r.start === iso)?.value;
    expect(at('BE:NUCLEAR', '2026-10-23T22:00:00.000Z')).toBe(3930);
    expect(at('BE:HYDRO_PUMPED_STORAGE', '2026-10-23T23:00:00.000Z')).toBe(-200);
    expect(at('BE:TOTAL', '2026-10-23T22:00:00.000Z')).toBe(3930 + 200 + 1000);
    expect(at('BE-*:NUCLEAR', '2026-10-23T22:00:00.000Z')).toBeCloseTo(3930 / 3908);
    expect(at('BE-*:WIND', '2026-10-23T23:00:00.000Z')).toBe(0.5);
    expect(rows.every((r) => r.updated === '2026-10-24T08:00:00Z')).toBe(true);
  });

  it('écrit la production par groupe pour chaque zone de réglage', async () => {
    const [, perUnit] = entsoeCountry({ ...BE, unitDomains: ['A', 'B'] }).sources;
    await perUnit.ingest('2026-10-24', '2026-10-25');
    expect(urls.filter((u) => u.searchParams.get('documentType') === 'A73').map((u) => u.searchParams.get('in_Domain'))).toEqual(['A', 'B']);
    const [country, units] = vi.mocked(store.upsertUnits).mock.calls[0];
    expect(country).toBe('BE');
    expect(units[0]).toEqual({
      unit: { eic_code: '22WDOEL1000000X', name: 'DOEL 1', production_type: 'NUCLEAR' },
      values: [{ start_date: '2026-10-23T22:00:00.000Z', updated_date: '2026-10-24T08:05:00Z', value: 445 }],
    });
    expect(units).toHaveLength(2); // même groupe vu dans les deux zones de l'essai
  });

  it('ne laisse pas fuir le jeton dans les erreurs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unauthorized', { status: 401 })));
    const [perType] = entsoeCountry(BE).sources;
    const error = await perType.ingest('2026-10-24', '2026-10-25').catch((e: Error) => e);
    expect((error as Error).message).toMatch(/401/);
    expect((error as Error).message).not.toContain('jeton-secret');
  });

  it('traite « pas de données » comme une réponse vide', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(NO_DATA, { status: 200 })));
    const [, perUnit] = entsoeCountry(BE).sources;
    expect(await perUnit.ingest('2026-10-24', '2026-10-25')).toBe(0);
  });
});
