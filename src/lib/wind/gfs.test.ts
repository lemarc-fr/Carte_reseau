import { describe, expect, it } from 'vitest';
import { hoursSince } from './gfs';

describe('hoursSince', () => {
  it('convertit les heures depuis l’origine des unités NetCDF', () => {
    expect(hoursSince('Hour since 2026-10-17T00:00:00Z', 174)?.toISOString()).toBe('2026-10-24T06:00:00.000Z');
    expect(hoursSince('Hour since 2026-10-17T00:00:00Z', 1.5)?.toISOString()).toBe('2026-10-17T01:30:00.000Z');
  });
  it('renvoie null sans origine', () => {
    expect(hoursSince(undefined, 3)).toBeNull();
    expect(hoursSince('m s-1', 3)).toBeNull();
  });
});
