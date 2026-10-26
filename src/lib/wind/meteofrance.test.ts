import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { latestCoverage, nearest, runTimeOf, validTimes } from './meteofrance';

// Réponse DescribeCoverage réelle (run du 24/10/2026 03 UTC, 52 échéances horaires)
const DESCRIPTION = readFileSync(new URL('./fixtures/arome-describe-coverage.xml', import.meta.url), 'utf8');

const U = 'U_COMPONENT_OF_WIND__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND___';
const V = 'V_COMPONENT_OF_WIND__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND___';
const summary = (id: string) =>
  `<wcs:CoverageSummary><ows:Title>t</ows:Title><wcs:CoverageId>${id}</wcs:CoverageId></wcs:CoverageSummary>`;

describe('GetCapabilities', () => {
  const capabilities = [
    `${U}2026-10-23T21.00.00Z`,
    `${U}2026-10-24T03.00.00Z`,
    `${U}2026-10-24T00.00.00Z`,
    `${V}2026-10-24T06.00.00Z`,
    'GEOMETRIC_HEIGHT__GROUND_OR_WATER_SURFACE___2026-10-24T09.00.00Z',
  ]
    .map(summary)
    .join('\n');

  it('lit la date du run dans l’identifiant', () => {
    expect(runTimeOf(`${U}2026-10-24T03.00.00Z`)?.toISOString()).toBe('2026-10-24T03:00:00.000Z');
    expect(runTimeOf('SANS_DATE')).toBeNull();
  });

  it('choisit le dernier run de chaque composante', () => {
    expect(latestCoverage(capabilities, U)).toBe(`${U}2026-10-24T03.00.00Z`);
    expect(latestCoverage(capabilities, V)).toBe(`${V}2026-10-24T06.00.00Z`);
    expect(latestCoverage(capabilities, 'TEMPERATURE')).toBeNull();
  });
});

describe('DescribeCoverage', () => {
  it('lit les échéances horaires de l’axe time', () => {
    const times = validTimes(DESCRIPTION);
    expect(times).toHaveLength(52);
    expect(new Date(times[0]).toISOString()).toBe('2026-10-24T03:00:00.000Z');
    expect(new Date(times[51]).toISOString()).toBe('2026-10-26T06:00:00.000Z');
    expect(times[1] - times[0]).toBe(3_600_000);
  });

  it('échoue sans axe temporel', () => {
    expect(() => validTimes('<wcs:CoverageDescriptions/>')).toThrow(/axe temporel/);
  });
});

describe('nearest', () => {
  it('prend l’échéance la plus proche de l’instant demandé', () => {
    const times = validTimes(DESCRIPTION);
    const at = (iso: string) => new Date(nearest(times, Date.parse(iso))).toISOString();
    expect(at('2026-10-24T09:00:00Z')).toBe('2026-10-24T09:00:00.000Z'); // échéance GFS exacte
    expect(at('2026-10-24T09:20:00Z')).toBe('2026-10-24T09:00:00.000Z');
    expect(at('2026-10-24T01:00:00Z')).toBe('2026-10-24T03:00:00.000Z'); // avant le run
    expect(at('2026-10-30T00:00:00Z')).toBe('2026-10-26T06:00:00.000Z'); // après la dernière échéance
  });
});
