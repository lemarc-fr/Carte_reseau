'use client';

import { useEffect } from 'react';
import { useMapStore, type WindLayerData } from '@/store/useMapStore';

type WindLayerMeta = Omit<WindLayerData, 'image'> & { imageUrl: string };

async function decode(url: string): Promise<ImageData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

// Couches de vent (GFS Europe, AROME HD France) préparées par /api/wind — poussées dans le store
export function useWindData() {
  const setWindLayers = useMapStore((s) => s.setWindLayers);
  const setWindStatus = useMapStore((s) => s.setWindStatus);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/wind/meta');
        if (!res.ok) throw new Error('Wind fetch failed');
        const { layers } = (await res.json()) as { layers: WindLayerMeta[] };
        const loaded = await Promise.all(
          layers.map(async ({ imageUrl, ...meta }) => ({ ...meta, image: await decode(imageUrl) }))
        );
        if (!cancelled) setWindLayers(loaded);
      } catch {
        if (!cancelled) setWindStatus('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [setWindLayers, setWindStatus]);
}
