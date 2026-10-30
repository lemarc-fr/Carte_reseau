import { describe, expect, it } from 'vitest';
import type { GenerationSeries, PlantInfo, UnitInfo } from '@/types/energy';
import {
  DAY_MS,
  exchangeFlow,
  exchangeTotals,
  formatEuros,
  price,
  hasLargeUnit,
  HOUR_MS,
  isEstimated,
  nationalOutput,
  plantSnapshot,
  regionalLoadFactor,
  slotIndexAt,
  unitOutput,
} from './generationUtils';

const T0 = Date.UTC(2026, 9, 20);

function unit(eic: string, capacity: number | null = 900): UnitInfo {
  return { eic_code: eic, name: eic, production_type: 'NUCLEAR', capacity_mw: capacity, commissioning_date: null };
}

function plant(overrides: Partial<PlantInfo> = {}): PlantInfo {
  return {
    id: 'site',
    country: 'FR',
    name: 'Site',
    full_name: 'Site',
    type: 'nuclear',
    technology: null,
    operator: null,
    latitude: 45,
    longitude: 2,
    capacity_mw: 1800,
    commissioning_date: null,
    commune: null,
    departement: null,
    region: null,
    region_code: null,
    installations: null,
    wikidata_id: null,
    osm_id: null,
    contour: null,
    units: [],
    ...overrides,
  };
}

// Deux jours résumés (DAY) suivis de quatre heures (HOUR)
function generation(
  series: GenerationSeries['series'] = {},
  aggregates: GenerationSeries['aggregates'] = {}
): GenerationSeries {
  const times = [T0, T0 + DAY_MS, ...[0, 1, 2, 3].map((h) => T0 + 2 * DAY_MS + h * HOUR_MS)];
  return {
    from: T0,
    to: T0 + 2 * DAY_MS + 4 * HOUR_MS,
    times,
    granularity: ['DAY', 'DAY', 'HOUR', 'HOUR', 'HOUR', 'HOUR'],
    series,
    aggregates,
    earliest: T0,
    latest: times[times.length - 1],
    updatedAt: null,
  };
}

describe('slotIndexAt', () => {
  const gen = generation();
  it('trouve le créneau journalier ou horaire', () => {
    expect(slotIndexAt(gen, T0)).toBe(0);
    expect(slotIndexAt(gen, T0 + DAY_MS + 23 * HOUR_MS)).toBe(1);
    expect(slotIndexAt(gen, T0 + 2 * DAY_MS + 90 * 60_000)).toBe(3);
  });
  it('renvoie -1 hors de la fenêtre', () => {
    expect(slotIndexAt(gen, T0 - 1)).toBe(-1);
    expect(slotIndexAt(gen, T0 + 2 * DAY_MS + 4 * HOUR_MS)).toBe(-1);
  });
});

describe('unitOutput', () => {
  const gen = generation({ A: [null, 10, -5, 900, 0, 0] });
  it('ramène les valeurs négatives à 0 sauf en mode signé', () => {
    expect(unitOutput(gen, unit('A'), 2)).toBe(0);
    expect(unitOutput(gen, unit('A'), 2, true)).toBe(-5);
    expect(unitOutput(gen, unit('A'), 3)).toBe(900);
  });
  it('renvoie null sans donnée', () => {
    expect(unitOutput(gen, unit('A'), 0)).toBeNull();
    expect(unitOutput(gen, unit('B'), 3)).toBeNull();
    expect(unitOutput(null, unit('A'), 3)).toBeNull();
    expect(unitOutput(gen, unit('A'), -1)).toBeNull();
  });
});

describe('plantSnapshot', () => {
  it('somme les groupes publiés et compte ceux en marche', () => {
    const site = plant({ units: [unit('A'), unit('B'), unit('C')] });
    const gen = generation({ A: [0, 0, 0, 900, 0, 0], B: [0, 0, 0, -3, 0, 0] });
    expect(isEstimated(site, gen)).toBe(false);
    expect(plantSnapshot(site, gen, 3)).toEqual({ output: 900, capacity: 1800, running: 1, units: 2, estimated: false });
  });

  it('garde la recharge d’un stockage', () => {
    const step = plant({ type: 'pumped_storage', capacity_mw: 1000, units: [unit('P')] });
    const gen = generation({ P: [0, 0, 0, -400, 0, 0] });
    expect(plantSnapshot(step, gen, 3).output).toBe(-400);
  });

  it('estime un site sans groupe publié par le taux de charge régional', () => {
    const farm = plant({ type: 'wind', capacity_mw: 50, region_code: '84' });
    const gen = generation({}, { 'FR-84:WIND': [0.2, 0.3, 0.5, null, null, null] });
    expect(isEstimated(farm, gen)).toBe(true);
    expect(plantSnapshot(farm, gen, 2)).toMatchObject({ output: 25, estimated: true });
  });
});

describe('regionalLoadFactor', () => {
  const farm = plant({ type: 'solar', region_code: '11' });
  it('reprend la dernière heure publiée, dans la limite de 3 créneaux', () => {
    const gen = generation({}, { 'FR-11:SOLAR': [0.1, 0.1, 0.4, null, null, null] });
    expect(regionalLoadFactor(gen, farm, 3)).toBe(0.4);
    expect(regionalLoadFactor(gen, farm, 4)).toBe(0.4);
    expect(regionalLoadFactor(gen, farm, 5)).toBeNull();
  });
  it('ne remonte pas d’un créneau horaire à un créneau journalier', () => {
    const gen = generation({}, { 'FR-11:SOLAR': [0.1, 0.2, null, null, null, null] });
    expect(regionalLoadFactor(gen, farm, 2)).toBeNull();
    expect(regionalLoadFactor(gen, farm, 1)).toBe(0.2);
  });
  it('se replie sur le taux national "<pays>-*" sans série régionale', () => {
    const gen = generation({}, { 'DE-*:SOLAR': [0, 0, 0.3, 0, 0, 0], 'FR-11:SOLAR': [0, 0, 0.6, 0, 0, 0] });
    expect(regionalLoadFactor(gen, { ...farm, country: 'DE', region_code: null }, 2)).toBe(0.3);
    expect(regionalLoadFactor(gen, farm, 2)).toBe(0.6); // la série régionale prime
    expect(regionalLoadFactor(gen, { ...farm, country: 'GB', region_code: null }, 2)).toBeNull();
  });
  it('utilise le pays du site dans la clé', () => {
    const gen = generation({}, { 'BE-11:SOLAR': [0, 0, 0.7, 0, 0, 0] });
    expect(regionalLoadFactor(gen, { ...farm, country: 'BE' }, 2)).toBe(0.7);
    expect(regionalLoadFactor(gen, farm, 2)).toBeNull();
  });
  it('renvoie null sans région ou sans série régionale pour la filière', () => {
    const gen = generation({}, { 'FR-11:SOLAR': [0, 0, 0.7, 0, 0, 0] });
    expect(regionalLoadFactor(gen, { ...farm, region_code: null }, 2)).toBeNull();
    expect(regionalLoadFactor(gen, { ...farm, type: 'nuclear' }, 2)).toBeNull();
  });
});

describe('nationalOutput', () => {
  it('additionne les séries nationales de la filière pour les pays demandés', () => {
    const gen = generation({}, { 'FR:NUCLEAR': [0, 0, 40_000, 0, 0, 0], 'BE:NUCLEAR': [0, 0, 3_000, 0, 0, 0] });
    expect(nationalOutput(gen, 'nuclear', 2)).toBe(40_000);
    expect(nationalOutput(gen, 'nuclear', 2, ['FR', 'BE'])).toBe(43_000);
    expect(nationalOutput(gen, 'coal', 2)).toBeNull();
  });
});

describe('hasLargeUnit', () => {
  it('retient les sites dotés d’un groupe d’au moins 100 MW', () => {
    const commune = { installations: 12, capacity_mw: 300 };
    expect(hasLargeUnit(plant({ ...commune, units: [unit('A', 100)] }))).toBe(true);
    expect(hasLargeUnit(plant({ ...commune, units: [unit('A', 99), unit('B', 40)] }))).toBe(false);
    expect(hasLargeUnit(plant({ ...commune, units: [] }))).toBe(false);
  });
  it('compte un groupe de puissance inconnue (publié par RTE ou ENTSO-E, donc ≥ 100 MW)', () => {
    expect(hasLargeUnit(plant({ installations: 3, units: [unit('A', null)] }))).toBe(true);
  });
  it('retient une centrale isolée de 100 MW ou plus sans groupe connu', () => {
    expect(hasLargeUnit(plant({ country: 'DE', capacity_mw: 1200, units: [] }))).toBe(true);
    expect(hasLargeUnit(plant({ country: 'DE', capacity_mw: 80, units: [] }))).toBe(false);
  });
});

describe('échanges', () => {
  const link = { id: 'CH', label: 'Suisse', france: [0, 0] as [number, number], neighbour: [1, 1] as [number, number], priceCountries: ['CH'] };
  const gen = generation(
    {},
    {
      'FR~CH:COMM': [-1000, null, 500, -2000, 0, null],
      'FR:PRICE': [50, 60, 100, 80, 0, 0],
      'CH:PRICE': [55, 0, 120, 90, 0, 0],
      'DE:PRICE': [0, 0, 70, 0, 0, 0],
      'BE:PRICE': [0, 0, 90, 0, 0, 0],
    }
  );

  it('lit le flux et les prix du créneau', () => {
    expect(exchangeFlow(gen, link, 2)).toBe(500);
    expect(exchangeFlow(gen, link, 1)).toBeNull();
    expect(price(gen, ['CH'], 2)).toBe(120);
    expect(price(gen, ['DE', 'BE'], 2)).toBe(80); // moyenne
    expect(price(gen, [], 2)).toBeNull(); // pas de prix (Grande-Bretagne)
  });

  it('totalise énergie et valeur au prix français (créneau journalier = 24 h)', () => {
    const totals = exchangeTotals(gen, link);
    // index 0 : journalier, export 1 000 MW × 24 h à 50 € ; index 3 : export 2 000 MWh à 80 €
    expect(totals.exportMWh).toBe(24_000 + 2_000);
    expect(totals.exportEur).toBe(24_000 * 50 + 2_000 * 80);
    expect(totals.importMWh).toBe(500);
    expect(totals.importEur).toBe(500 * 100);
  });

  it('formate les montants', () => {
    expect(formatEuros(1_234_567)).toBe('1,2 M€');
    expect(formatEuros(12_345)).toBe('12,3 k€');
    expect(formatEuros(42)).toBe('42 €');
  });
});
