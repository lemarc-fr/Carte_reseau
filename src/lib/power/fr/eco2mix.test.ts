import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRegionalReadings } from './eco2mix';

type Row = Record<string, string | number | null>;

const row = (region: string, dateHeure: string, values: Row): Row => ({
  code_insee_region: region,
  date_heure: dateHeure,
  tch_eolien: null,
  tch_hydraulique: null,
  tch_solaire: null,
  tch_thermique: null,
  tch_bioenergies: null,
  stockage_batterie: null,
  destockage_batterie: null,
  ...values,
});

function mockOdre(datasets: Record<string, Row[]>) {
  const urls: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL) => {
      urls.push(input);
      const dataset = input.pathname.split('/datasets/')[1].split('/')[0];
      return new Response(JSON.stringify(datasets[dataset] ?? []), { status: 200 });
    })
  );
  return urls;
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchRegionalReadings', () => {
  it('demande la fenêtre de minuit à minuit, heure de Paris', async () => {
    const urls = mockOdre({});
    await fetchRegionalReadings('2026-10-25', '2026-10-26');
    expect(urls).toHaveLength(2);
    expect(urls[0].searchParams.get('where')).toBe(
      'date_heure >= "2026-10-25T00:00:00+02:00" AND date_heure < "2026-10-26T00:00:00+01:00"'
    );
  });

  it('fait la moyenne horaire des taux de charge (en fraction) et des batteries', async () => {
    mockOdre({
      'eco2mix-regional-tr': [
        row('84', '2026-10-24T10:00:00+00:00', { tch_eolien: 20, stockage_batterie: -30, destockage_batterie: 0 }),
        row('84', '2026-10-24T10:15:00+00:00', { tch_eolien: 30, stockage_batterie: '-10', destockage_batterie: '5' }),
        row('84', '2026-10-24T11:00:00+00:00', { tch_eolien: 50 }),
      ],
    });
    const readings = await fetchRegionalReadings('2026-10-24', '2026-10-25');
    const find = (kind: string, iso: string) =>
      readings.find((r) => r.kind === kind && r.start.toISOString() === iso)?.value;
    expect(find('WIND', '2026-10-24T10:00:00.000Z')).toBeCloseTo(0.25);
    expect(find('WIND', '2026-10-24T11:00:00.000Z')).toBeCloseTo(0.5);
    expect(find('BATTERY_MW', '2026-10-24T10:00:00.000Z')).toBe(-17.5);
    expect(find('BATTERY_MW', '2026-10-24T11:00:00.000Z')).toBeUndefined();
    expect(readings.every((r) => r.region === '84')).toBe(true);
  });

  it('préfère le consolidé au temps réel pour une même heure', async () => {
    mockOdre({
      'eco2mix-regional-tr': [
        row('11', '2026-10-01T10:00:00+00:00', { tch_solaire: 10 }),
        row('11', '2026-10-01T11:00:00+00:00', { tch_solaire: 40 }),
      ],
      'eco2mix-regional-cons-def': [row('11', '2026-10-01T10:00:00+00:00', { tch_solaire: 12 })],
    });
    const readings = await fetchRegionalReadings('2026-10-01', '2026-10-02');
    const solar = readings.filter((r) => r.kind === 'SOLAR').sort((a, b) => +a.start - +b.start);
    expect(solar.map((r) => r.value)).toEqual([0.12, 0.4]);
  });

  it('remonte une erreur HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('quota', { status: 429 })));
    await expect(fetchRegionalReadings('2026-10-01', '2026-10-02')).rejects.toThrow(/429/);
  });
});
