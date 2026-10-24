import { describe, expect, it } from 'vitest';
import { addDays, dayIn, daysBetween, hourIn, midnightIn } from './days';

const PARIS = 'Europe/Paris';

describe('jours calendaires', () => {
  it('donne le jour et l’heure locaux', () => {
    const date = new Date('2026-10-23T22:30:00Z'); // 00:30 à Paris (UTC+2)
    expect(dayIn(PARIS, date)).toBe('2026-10-24');
    expect(hourIn(PARIS, date)).toBe(0);
    expect(dayIn('UTC', date)).toBe('2026-10-23');
  });

  it('ajoute des jours en franchissant mois et années', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('compte les jours entre deux dates', () => {
    expect(daysBetween('2026-01-01', '2026-01-08')).toBe(7);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // passage à l’heure d’été
  });
});

describe('midnightIn', () => {
  it('donne le décalage de l’heure d’hiver et d’été', () => {
    expect(midnightIn(PARIS, '2026-01-15')).toBe('2026-01-15T00:00:00+01:00');
    expect(midnightIn(PARIS, '2026-07-15')).toBe('2026-07-15T00:00:00+02:00');
  });

  it('gère les jours de changement d’heure', () => {
    // Minuit précède le changement : encore l’ancien décalage
    expect(midnightIn(PARIS, '2026-03-29')).toBe('2026-03-29T00:00:00+01:00');
    expect(midnightIn(PARIS, '2026-03-30')).toBe('2026-03-30T00:00:00+02:00');
    expect(midnightIn(PARIS, '2026-10-25')).toBe('2026-10-25T00:00:00+02:00');
    expect(midnightIn(PARIS, '2026-10-26')).toBe('2026-10-26T00:00:00+01:00');
  });

  it('marche hors d’Europe', () => {
    expect(midnightIn('UTC', '2026-06-01')).toBe('2026-06-01T00:00:00+00:00');
    expect(midnightIn('America/New_York', '2026-06-01')).toBe('2026-06-01T00:00:00-04:00');
  });
});
