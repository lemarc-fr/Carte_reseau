import { describe, expect, it } from 'vitest';
import { A68, A73, A75, NO_DATA } from './fixtures';
import { EntsoeNoData, hourlyAverages, parseDocument, resolutionMs } from './xml';

const H = (iso: string) => Date.parse(iso);

describe('resolutionMs', () => {
  it('convertit les pas ISO 8601', () => {
    expect(resolutionMs('PT15M')).toBe(900_000);
    expect(resolutionMs('PT60M')).toBe(3_600_000);
    expect(resolutionMs('PT1H')).toBe(3_600_000);
    expect(resolutionMs('P1D')).toBe(86_400_000);
    expect(resolutionMs('P1Y')).toBe(0);
    expect(() => resolutionMs('X')).toThrow(/résolution inconnue/);
  });
});

describe('parseDocument', () => {
  it('lit les séries par filière, leur zone et leurs points', () => {
    const doc = parseDocument(A75);
    expect(doc.created).toBe('2026-10-24T08:00:00Z');
    expect(doc.series).toHaveLength(4);
    const [nuclear, pumpedGen, pumping] = doc.series;
    expect(nuclear).toMatchObject({ psrType: 'B14', inDomain: '10YBE----------2', outDomain: null, resolutionMs: 900_000 });
    expect(nuclear.points.map((p) => p.value)).toEqual([3900, 3920, 3940, 3960]);
    expect(nuclear.points[3].start).toBe(H('2026-10-23T22:45Z'));
    expect(pumping).toMatchObject({ psrType: 'B10', inDomain: null, outDomain: '10YBE----------2' });
    // Courbe A03 : la position 2 absente reprend la valeur précédente
    expect(pumpedGen.points).toEqual([
      { start: H('2026-10-23T22:00Z'), value: 300 },
      { start: H('2026-10-23T23:00Z'), value: 300 },
    ]);
  });

  it('lit le groupe de la production par groupe', () => {
    const [unit] = parseDocument(A73).series;
    expect(unit).toMatchObject({ psrType: 'B14', resourceId: '22WDOEL1000000X', resourceName: 'DOEL 1' });
    expect(unit.points).toEqual([{ start: H('2026-10-23T22:00Z'), value: 445 }]);
  });

  it('lit la puissance installée annuelle (un point)', () => {
    const series = parseDocument(A68).series;
    expect(series.map((s) => [s.psrType, s.points[0].value])).toEqual([
      ['B14', 3908],
      ['B19', 3000],
    ]);
  });

  it('signale l’absence de données et les autres refus', () => {
    expect(() => parseDocument(NO_DATA)).toThrow(EntsoeNoData);
    expect(() =>
      parseDocument('<Acknowledgement_MarketDocument><Reason><code>999</code></Reason></Acknowledgement_MarketDocument>'.replace('999', '401'))
    ).toThrow(/ENTSO-E/);
  });
});

describe('hourlyAverages', () => {
  it('fait la moyenne des quarts d’heure', () => {
    const [nuclear] = parseDocument(A75).series;
    expect([...hourlyAverages(nuclear.points)]).toEqual([[H('2026-10-23T22:00Z'), 3930]]);
  });
});
