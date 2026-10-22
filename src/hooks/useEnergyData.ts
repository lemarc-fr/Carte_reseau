'use client';

import { useEffect } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { DAY_MS } from '@/lib/generationUtils';
import type { GenerationSeries, PlantInfo } from '@/types/energy';

const WINDOW_MS = 7 * DAY_MS;
const LIVE_REFRESH_MS = 5 * 60 * 1000;

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function generationUrl(from: number, to: number) {
  const params = new URLSearchParams({ from: new Date(from).toISOString(), to: new Date(to).toISOString() });
  return `/api/generation?${params}`;
}

/**
 * Charge les centrales puis la production sur une fenêtre de 7 jours :
 *  - en temps réel, les 7 derniers jours, rafraîchis toutes les 5 minutes ;
 *  - pour une date hors de la fenêtre chargée, les 7 jours qui l'entourent.
 */
export function useEnergyData() {
  const selectedTime = useMapStore((s) => s.selectedTime);
  const loadedFrom = useMapStore((s) => s.generation?.from);
  const loadedTo = useMapStore((s) => s.generation?.to);
  const setPlants = useMapStore((s) => s.setPlants);
  const setPlantsStatus = useMapStore((s) => s.setPlantsStatus);
  const setGeneration = useMapStore((s) => s.setGeneration);
  const setGenerationStatus = useMapStore((s) => s.setGenerationStatus);

  useEffect(() => {
    const controller = new AbortController();
    fetchJson<PlantInfo[]>('/api/plants', controller.signal)
      .then(setPlants)
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error(err);
        setPlantsStatus('error');
      });
    return () => controller.abort();
  }, [setPlants, setPlantsStatus]);

  const isLive = selectedTime === null;

  // Temps réel
  useEffect(() => {
    if (!isLive) return;
    const controller = new AbortController();
    const load = () => {
      const now = Date.now();
      fetchJson<GenerationSeries>(generationUrl(now - WINDOW_MS, now), controller.signal)
        .then(setGeneration)
        .catch((err) => {
          if (controller.signal.aborted) return;
          console.error(err);
          setGenerationStatus('error');
        });
    };
    load();
    const intervalId = setInterval(load, LIVE_REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(intervalId);
    };
  }, [isLive, setGeneration, setGenerationStatus]);

  // Historique : ne recharge que si la date choisie sort de la fenêtre chargée
  useEffect(() => {
    if (selectedTime === null) return;
    if (loadedFrom !== undefined && loadedTo !== undefined && selectedTime >= loadedFrom && selectedTime <= loadedTo) {
      return;
    }
    const controller = new AbortController();
    const to = Math.min(selectedTime + WINDOW_MS / 2, Date.now());
    setGenerationStatus('loading');
    fetchJson<GenerationSeries>(generationUrl(to - WINDOW_MS, to), controller.signal)
      .then(setGeneration)
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error(err);
        setGenerationStatus('error');
      });
    return () => controller.abort();
  }, [selectedTime, loadedFrom, loadedTo, setGeneration, setGenerationStatus]);
}
