import { describe, expect, it } from 'vitest';
import { expandPlant } from './plantJson';

describe('expandPlant', () => {
  it('remet à null les champs omis par /api/plants', () => {
    const plant = expandPlant({
      id: 'de-nuclear-isar',
      country: 'DE',
      name: 'Isar',
      type: 'nuclear',
      capacity_mw: 1400,
      units: [{ eic_code: 'X', name: 'Isar 2', production_type: 'NUCLEAR' }],
    });
    expect(plant.region_code).toBeNull();
    expect(plant.contour).toBeNull();
    expect(plant.installations).toBeNull();
    expect(plant.units[0]).toEqual({
      eic_code: 'X',
      name: 'Isar 2',
      production_type: 'NUCLEAR',
      capacity_mw: null,
      commissioning_date: null,
    });
    expect(expandPlant({ id: 'x' }).units).toEqual([]);
  });

  it('garde les valeurs présentes, zéro compris', () => {
    expect(expandPlant({ id: 'x', installations: 0, region_code: '84' })).toMatchObject({ installations: 0, region_code: '84' });
  });
});
