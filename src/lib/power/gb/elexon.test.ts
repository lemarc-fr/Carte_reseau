import { describe, expect, it } from 'vitest';
import { b1610Hourly, completeDay, pnHourly, type B1610Row, type PnRow } from './elexon';
import { perTypeRows } from './index';

const T = (iso: string) => Date.parse(iso);

describe('pnHourly', () => {
  const from = T('2026-10-25T00:00Z');
  const to = T('2026-10-26T00:00Z');
  const pn = (bmUnit: string | null, timeFrom: string, timeTo: string, levelFrom: number, levelTo: number): PnRow => ({
    bmUnit,
    timeFrom,
    timeTo,
    levelFrom,
    levelTo,
  });

  it('moyenne les segments par heure, pondérés par leur durée', () => {
    const hourly = pnHourly(
      [
        pn('T_A', '2026-10-25T10:00:00Z', '2026-10-25T10:30:00Z', 600, 600),
        // rampe de 0 à 600 MW en 6 minutes, puis palier
        pn('T_A', '2026-10-25T10:30:00Z', '2026-10-25T10:36:00Z', 0, 600),
        pn('T_A', '2026-10-25T10:36:00Z', '2026-10-25T11:00:00Z', 600, 600),
        // doublon (tranches de requête qui se chevauchent)
        pn('T_A', '2026-10-25T10:00:00Z', '2026-10-25T10:30:00Z', 600, 600),
      ],
      from,
      to,
      to
    );
    expect(hourly.get('T_A')!.get(T('2026-10-25T10:00Z'))).toBeCloseTo((600 * 30 + 300 * 6 + 600 * 24) / 60);
  });

  it('ignore le segment qui touche la borne, les segments pas encore commencés et les lignes sans unité', () => {
    const hourly = pnHourly(
      [
        pn('T_A', '2026-10-24T23:30:00Z', '2026-10-25T00:00:00Z', 100, 100),
        pn('T_A', '2026-10-25T09:00:00Z', '2026-10-25T09:30:00Z', 200, 200),
        pn('T_A', '2026-10-25T13:00:00Z', '2026-10-25T13:30:00Z', 300, 300),
        pn(null, '2026-10-25T09:00:00Z', '2026-10-25T09:30:00Z', 1, 1),
      ],
      from,
      to,
      T('2026-10-25T12:00Z')
    );
    expect([...hourly.get('T_A')!]).toEqual([[T('2026-10-25T09:00Z'), 200]]);
    // segment en cours : gardé
    const current = pnHourly([pn('T_A', '2026-10-25T13:00:00Z', '2026-10-25T13:30:00Z', 300, 300)], from, to, T('2026-10-25T13:10Z'));
    expect(current.get('T_A')!.get(T('2026-10-25T13:00Z'))).toBe(300);
    expect(hourly.size).toBe(1);
  });
});

describe('b1610Hourly', () => {
  const row = (bmUnit: string, sp: number, end: string, quantity: number): B1610Row => ({
    bmUnit,
    settlementDate: '2026-10-16',
    settlementPeriod: sp,
    halfHourEndTime: end,
    quantity,
  });

  it('convertit les MWh par demi-heure en MW horaires', () => {
    const { hourly, periods } = b1610Hourly([
      row('T_DRAXX-1', 27, '2026-10-16T12:30:00', 320),
      row('T_DRAXX-1', 28, '2026-10-16T13:00:00', 330),
    ]);
    expect([...hourly.get('T_DRAXX-1')!]).toEqual([[T('2026-10-16T12:00Z'), 650]]);
    expect([...periods.get('2026-10-16')!]).toEqual([27, 28]);
  });

  it('juge un jour complet à 46 demi-heures (heure d’été) ou plus', () => {
    expect(completeDay(new Set(Array.from({ length: 46 }, (_, i) => i + 1)))).toBe(true);
    expect(completeDay(new Set([1, 2, 3]))).toBe(false);
  });
});

describe('perTypeRows', () => {
  const from = T('2026-10-24T23:00Z');
  const to = T('2026-10-25T23:00Z');
  const fuel = (fuelType: string, startTime: string, generation: number) => ({ fuelType, startTime, generation });

  const rows = perTypeRows(
    [
      fuel('CCGT', '2026-10-25T12:00:00Z', 4000),
      fuel('OCGT', '2026-10-25T12:00:00Z', 100),
      fuel('CCGT', '2026-10-25T12:30:00Z', 5000),
      fuel('OCGT', '2026-10-25T12:30:00Z', 100),
      fuel('CCGT', '2026-10-25T12:30:00Z', 5000), // doublon
      fuel('NUCLEAR', '2026-10-25T12:00:00Z', 5000),
      fuel('NUCLEAR', '2026-10-25T12:30:00Z', 5000),
      fuel('WIND', '2026-10-25T12:00:00Z', 6000),
      fuel('WIND', '2026-10-25T12:30:00Z', 6000),
      fuel('INTFR', '2026-10-25T12:00:00Z', 2000),
      fuel('NUCLEAR', '2026-10-24T22:30:00Z', 9999), // avant la fenêtre
    ],
    [
      { psrType: 'Wind Offshore', startTime: '2026-10-25T12:00:00Z', publishTime: '2026-10-25T13:00:00Z', quantity: 9000 },
      { psrType: 'Wind Offshore', startTime: '2026-10-25T12:00:00Z', publishTime: '2026-10-25T14:00:00Z', quantity: 9500 },
      { psrType: 'Solar', startTime: '2026-10-25T12:00:00Z', publishTime: '2026-10-25T13:00:00Z', quantity: 1500 },
    ],
    new Map([
      ['NUCLEAR', 6000],
      ['WIND', 15000],
      ['CCGT', 30000],
      ['OCGT', 2000],
      ['COAL', 0],
      ['OIL', 0],
    ]),
    from,
    to,
    'maintenant'
  );
  const at = (series: string) => rows.find((r) => r.series === series && r.start === '2026-10-25T12:00:00.000Z')?.value;

  it('additionne CCGT et OCGT, moyenne les demi-heures', () => {
    expect(at('GB:FOSSIL_GAS')).toBe(4600);
    expect(at('GB:NUCLEAR')).toBe(5000);
  });

  it('prend l’éolien et le solaire d’AGWS (dernière publication), pas de FUELHH', () => {
    expect(at('GB:WIND_OFFSHORE')).toBe(9500);
    expect(at('GB:SOLAR')).toBe(1500);
    expect(at('GB:WIND')).toBeUndefined();
    expect(at('GB:INTFR')).toBeUndefined();
    expect(at('GB:TOTAL')).toBe(4600 + 5000 + 9500 + 1500);
  });

  it('calcule les taux de charge avec la puissance des BMU', () => {
    expect(at('GB-*:NUCLEAR')).toBeCloseTo(5000 / 6000);
    expect(at('GB-*:WIND')).toBeCloseTo(6000 / 15000);
    expect(at('GB-*:THERMAL')).toBeCloseTo(4600 / 32000);
    expect(rows.some((r) => r.value === 9999)).toBe(false);
  });
});
