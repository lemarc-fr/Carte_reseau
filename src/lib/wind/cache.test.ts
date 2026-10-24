import { describe, expect, it, vi } from 'vitest';
import { alignedFields } from './cache';
import type { WindField } from './types';

const field = (validTime: string): WindField => ({
  width: 1,
  height: 1,
  u: new Float32Array([1]),
  v: new Float32Array([1]),
  bounds: { minLon: 0, maxLon: 0, minLat: 0, maxLat: 0 },
  runTime: null,
  validTime: new Date(validTime),
});

describe('alignedFields', () => {
  const gfs = field('2026-10-24T09:00:00Z');

  it('garde les deux couches à la même échéance', () => {
    const arome = field('2026-10-24T09:00:00Z');
    expect(alignedFields({ europe: gfs, france: arome })).toEqual({ europe: gfs, france: arome });
  });

  it('affiche GFS seul si AROME est à une autre échéance', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(alignedFields({ europe: gfs, france: field('2026-10-24T10:00:00Z') })).toEqual({ europe: gfs });
  });

  it('affiche la source disponible quand l’autre manque', () => {
    const arome = field('2026-10-24T10:00:00Z');
    expect(alignedFields({ france: arome })).toEqual({ europe: undefined, france: arome });
    expect(alignedFields({ europe: gfs })).toEqual({ europe: gfs, france: undefined });
  });
});
