import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Country, Source } from './types';

vi.mock('../downsample', () => ({ downsampleOldHourlyData: vi.fn(async () => ({})) }));
const { backfillStart, ingestDays } = await import('./ingest');

function source(maxDays: number, ingest: Source['ingest'] = async () => 1): Source {
  return { name: 'test', maxDays, ingest: vi.fn(ingest), daysWithData: async () => new Set<string>() };
}

const country = (sources: Source[]): Country => ({
  code: 'XX',
  name: 'Test',
  timeZone: 'UTC',
  sources,
  enabled: () => true,
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('backfillStart', () => {
  it('lit BACK_FILL_START', () => {
    vi.stubEnv('BACK_FILL_START', ' 2026-01-01 ');
    expect(backfillStart()).toBe('2026-01-01');
  });
  it('est vide sans valeur', () => {
    vi.stubEnv('BACK_FILL_START', '');
    expect(backfillStart()).toBeNull();
  });
  it('refuse un format invalide', () => {
    vi.stubEnv('BACK_FILL_START', '01/01/2026');
    expect(() => backfillStart()).toThrow(/BACK_FILL_START invalide/);
  });
});

describe('ingestDays', () => {
  it('découpe la période en fenêtres de maxDays jours', async () => {
    vi.useFakeTimers();
    const src = source(7);
    const run = ingestDays(country([src]), '2026-01-01', '2026-01-17');
    await vi.runAllTimersAsync();
    expect(await run).toBe(3);
    expect(vi.mocked(src.ingest).mock.calls).toEqual([
      ['2026-01-01', '2026-01-08'],
      ['2026-01-08', '2026-01-15'],
      ['2026-01-15', '2026-01-17'],
    ]);
  });

  it('réessaie après une erreur passagère', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let calls = 0;
    const src = source(7, async () => {
      if (++calls === 1) throw new Error('502 Bad Gateway');
      return 5;
    });
    const run = ingestDays(country([src]), '2026-01-01', '2026-01-02');
    await vi.runAllTimersAsync();
    expect(await run).toBe(5);
    expect(calls).toBe(2);
  });

  it('abandonne après les nouvelles tentatives', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const src = source(7, async () => {
      throw new Error('panne');
    });
    const run = ingestDays(country([src]), '2026-01-01', '2026-01-02');
    const assertion = expect(run).rejects.toThrow('panne');
    await vi.runAllTimersAsync();
    await assertion;
    expect(src.ingest).toHaveBeenCalledTimes(3);
  });
});
