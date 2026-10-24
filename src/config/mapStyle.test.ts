import { describe, expect, it } from 'vitest';
import { featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { osmSourceFilter } from './mapStyle';

const matches = (filter: ReturnType<typeof osmSourceFilter>, properties: Record<string, unknown>) =>
  featureFilter(filter).filter({ zoom: 12 }, { type: 1, properties, geometry: [] } as never);

describe('osmSourceFilter', () => {
  it('ne garde que les filières affichées et les sources inconnues', () => {
    const filter = osmSourceFilter(['wind']);
    expect(matches(filter, { source: 'wind' })).toBe(true);
    expect(matches(filter, { source: 'solar' })).toBe(false);
    expect(matches(filter, { source: 'geothermal' })).toBe(true);
    expect(matches(filter, {})).toBe(true);
  });

  it('filtre sur la puissance (MW) si demandé', () => {
    const filter = osmSourceFilter(['wind', 'nuclear'], 100);
    expect(matches(filter, { source: 'nuclear', output: 2600 })).toBe(true);
    expect(matches(filter, { source: 'wind', output: 3 })).toBe(false);
    expect(matches(filter, { source: 'wind' })).toBe(false);
  });
});
