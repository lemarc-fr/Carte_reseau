import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Country, Source } from './types';

vi.mock('../downsample', () => ({ downsampleOldHourlyData: vi.fn(async () => ({})) }));
const { downsampleOldHourlyData } = await import('../downsample');
const { backfillHistory, backfillStart, ingestDays, syncRecent } = await import('./ingest');

function source(maxDays: number, ingest: Source['ingest'] = async () => 1, extra: Partial<Source> = {}): Source {
  return { name: 'test', maxDays, ingest: vi.fn(ingest), daysWithData: async () => new Set<string>(), ...extra };
}

// Jours de `from` à `to` inclus
function days(from: string, to: string): Set<string> {
  const result = new Set<string>();
  for (let d = new Date(`${from}T00:00Z`); d <= new Date(`${to}T00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    result.add(d.toISOString().slice(0, 10));
  }
  return result;
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

describe('syncRecent', () => {
  it('reprend chaque source à son propre premier jour manquant', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-25T12:00:00Z') });
    const upToDate = source(1, async () => 1, { daysWithData: async () => days('2026-10-01', '2026-10-24') });
    const late = source(2, async () => 1, {
      lookbackDays: 14,
      daysWithData: async () => days('2026-10-01', '2026-10-15'), // publiée jusqu'au 15
    });
    const run = syncRecent(country([upToDate, late]));
    await vi.runAllTimersAsync();
    await run;
    expect(vi.mocked(upToDate.ingest).mock.calls).toEqual([['2026-10-25', '2026-10-26']]);
    expect(vi.mocked(late.ingest).mock.calls[0]).toEqual(['2026-10-16', '2026-10-18']);
    expect(vi.mocked(late.ingest).mock.calls.at(-1)).toEqual(['2026-10-24', '2026-10-26']);
    // Relevés horaires écrits avant la fenêtre de 7 jours : résumés aussitôt
    expect(downsampleOldHourlyData).toHaveBeenCalled();
  });

  it('ne résume pas quand rien n’est écrit au-delà de la rétention', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-25T12:00:00Z') });
    vi.mocked(downsampleOldHourlyData).mockClear();
    const recent = source(7, async () => 5, { daysWithData: async () => days('2026-10-01', '2026-10-24') });
    const run = syncRecent(country([recent]));
    await vi.runAllTimersAsync();
    expect(await run).toBe(5);
    expect(downsampleOldHourlyData).not.toHaveBeenCalled();
  });
});

describe('backfillHistory', () => {
  it('ne remonte pas avant l’historique de la source', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-25T12:00:00Z') });
    vi.stubEnv('BACK_FILL_START', '2026-01-01');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const short = source(1, async () => 0, { historyDays: 10 });
    const run = backfillHistory(country([short]));
    await vi.runAllTimersAsync();
    await run;
    // du 15/10 (aujourd'hui - 10 jours) à la fenêtre récente (19/10)
    expect(vi.mocked(short.ingest).mock.calls.map((c) => c[0])).toEqual([
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
  });
});
