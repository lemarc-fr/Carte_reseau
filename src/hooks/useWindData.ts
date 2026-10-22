'use client';

import { useEffect } from 'react';
import { useMapStore } from '@/store/useMapStore';

// Chargement des données vent (AROME, préparées par /api/wind) — pousse dans le store
export function useWindData() {
  const setWindData = useMapStore((s) => s.setWindData);
  const setWindStatus = useMapStore((s) => s.setWindStatus);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [metaRes, imgRes] = await Promise.all([
          fetch('/api/wind/meta'),
          fetch('/api/wind/image'),
        ]);

        if (!metaRes.ok || !imgRes.ok) throw new Error('Wind fetch failed');

        const { imageUnscale, speedMax, runTime, validTime } = await metaRes.json();
        const blob = await imgRes.blob();
        const bitmap = await createImageBitmap(blob);

        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

        if (!cancelled) {
          setWindData({ image, imageUnscale, speedMax, runTime: runTime ?? null, validTime: validTime ?? null });
        }
      } catch {
        if (!cancelled) setWindStatus('error');
      }
    }

    load();
    return () => { cancelled = true; };
  }, [setWindData, setWindStatus]);
}
