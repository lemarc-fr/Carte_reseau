'use client';

import React, { useEffect } from 'react';
import { Map, NavigationControl, useControl } from 'react-map-gl/maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { DeckProps } from '@deck.gl/core';
import { ParticleLayer, RasterLayer } from 'weatherlayers-gl';
import { ClipExtension } from '@deck.gl/extensions';
import {
  BOUNDS, INITIAL_VIEW_STATE, WIND_PALETTE,
  EUROPE_BOUNDS, PARTICLE_COLOR,
} from '@/config/mapConfig';
import { mapStyle } from '@/config/mapStyle';
import { ReactControl } from './controls/ReactControl';
import WindTogglePanel from './controls/WindTogglePanel';
import ProductionTypesPanel from './controls/ProductionTypesPanel';
import { useMapStore } from '@/store/useMapStore';
import OSMLayer from "@/components/plant/OSMLayer";

// ─── DeckGL overlay ───────────────────────────────────────────────────────────

function DeckGLOverlay(props: DeckProps) {
  const overlay = useControl<MapboxOverlay>(
      () => new MapboxOverlay({ interleaved: true, ...props })
  );
  overlay.setProps(props);
  return null;
}

// ─── IControls — plus de props, tout vient du store ──────────────────────────

function WindToggleControl() {
  const control = useControl<ReactControl>(
      () => new ReactControl(<WindTogglePanel />),
      { position: 'top-right' }
  );

  useEffect(() => {
    control.setContent(<WindTogglePanel />);
  }, [control]);

  return null;
}

function ProductionTypesControl() {
  const control = useControl<ReactControl>(
      () => new ReactControl(<ProductionTypesPanel />),
      { position: 'top-right' }
  );

  useEffect(() => {
    control.setContent(<ProductionTypesPanel />);
  }, [control]);

  return null;
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function MapEurope() {
  // Lecture du store
  const windData    = useMapStore((s) => s.windData);
  const windVisible = useMapStore((s) => s.windVisible);
  const windStatus  = useMapStore((s) => s.windStatus);

  // Écriture dans le store
  const setWindData   = useMapStore((s) => s.setWindData);
  const setWindStatus = useMapStore((s) => s.setWindStatus);

  // Chargement des données vent — pousse dans le store, pas dans useState local
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [metaRes, imgRes] = await Promise.all([
          fetch('/api/wind/meta'),
          fetch('/api/wind/image'),
        ]);

        if (!metaRes.ok || !imgRes.ok) throw new Error('Wind fetch failed');

        const { imageUnscale, speedMax } = await metaRes.json();
        const blob   = await imgRes.blob();
        const bitmap = await createImageBitmap(blob);

        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx    = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        const image  = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

        if (!cancelled) {
          setWindData({ image, imageUnscale, speedMax });
        }
      } catch {
        if (!cancelled) setWindStatus('error');
      }
    }

    load();
    return () => { cancelled = true; };
  }, [setWindData, setWindStatus]);

  // Layers deck.gl — dépendent uniquement de windData et windVisible
  const layers =
      windVisible && windData
          ? [
            new RasterLayer({
              id: 'wind-raster',
              image: windData.image,
              imageUnscale: [0, windData.speedMax],
              bounds: [BOUNDS.minLon, BOUNDS.minLat, BOUNDS.maxLon, BOUNDS.maxLat],
              palette: WIND_PALETTE,
              opacity: 0.2,
              extensions: [new ClipExtension()],
              clipBounds: [BOUNDS.minLon, BOUNDS.minLat, BOUNDS.maxLon, BOUNDS.maxLat],
            }),
            new ParticleLayer({
              id: 'wind-particles',
              image: windData.image,
              imageUnscale: windData.imageUnscale,
              bounds: [BOUNDS.minLon, BOUNDS.minLat, BOUNDS.maxLon, BOUNDS.maxLat],
              numParticles: 5000,
              speedFactor: 3.0,
              width: 1,
              opacity: 0.85,
              maxAge: 100,
              animate: true,
              color: PARTICLE_COLOR,
              extensions: [new ClipExtension()],
              clipBounds: [BOUNDS.minLon, BOUNDS.minLat, BOUNDS.maxLon, BOUNDS.maxLat],
            }),
          ]
          : [];

  return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <Map
            initialViewState={INITIAL_VIEW_STATE}
            maxBounds={EUROPE_BOUNDS}
            mapStyle={mapStyle}
        >
          <NavigationControl position="top-right" />
          <WindToggleControl />
          <ProductionTypesControl />
          <DeckGLOverlay layers={layers} />
          <OSMLayer />
        </Map>

        {windStatus !== 'ok' && (
            <div style={{
              position: 'absolute', bottom: 16, left: 16,
              background: 'rgba(0,0,0,0.6)', color: '#fff',
              padding: '6px 12px', borderRadius: 6,
              fontSize: 13, pointerEvents: 'none',
            }}>
              {windStatus === 'loading' ? '⟳ Chargement des vents…' : '⚠ Données vent indisponibles'}
            </div>
        )}
      </div>
  );
}