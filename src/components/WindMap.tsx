'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Map, NavigationControl, useControl } from 'react-map-gl/maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { DeckProps } from '@deck.gl/core';
import { ParticleLayer, RasterLayer } from 'weatherlayers-gl';
import { ClipExtension } from '@deck.gl/extensions';
import {
  BOUNDS, INITIAL_VIEW_STATE, WIND_PALETTE,
  EUROPE_BOUNDS, PARTICLE_COLOR
} from '@/config/mapConfig';
import { mapStyle } from '@/config/mapStyle';
import { ReactControl } from './controls/ReactControl';
import WindTogglePanel from './controls/WindTogglePanel';
import ProductionTypesPanel, {
  ProductionType,
  ProductionTypesState,
  DEFAULT_PRODUCTION_TYPES_STATE,
} from './controls/ProductionTypesPanel';

// Overlay interleaved — partage le contexte WebGL2 de MapLibre
function DeckGLOverlay(props: DeckProps) {
  const overlay = useControl<MapboxOverlay>(
    () => new MapboxOverlay({ interleaved: true, ...props })
  );
  overlay.setProps(props);
  return null;
}

// Wrapper components that use useControl — must be rendered inside <Map>
function WindToggleControl({
  windVisible,
  onToggleWind,
}: {
  windVisible: boolean;
  onToggleWind: () => void;
}) {
  const controlRef = useRef<ReactControl | null>(null);

  const control = useControl<ReactControl>(
    () => {
      const c = new ReactControl(
        <WindTogglePanel active={windVisible} onToggle={onToggleWind} />
      );
      controlRef.current = c;
      return c;
    },
    { position: 'top-right' }
  );

  useEffect(() => {
    control.setContent(
      <WindTogglePanel active={windVisible} onToggle={onToggleWind} />
    );
  }, [control, windVisible, onToggleWind]);

  return null;
}

function ProductionTypesControl({
  state,
  onToggle,
}: {
  state: ProductionTypesState;
  onToggle: (key: ProductionType) => void;
}) {
  const control = useControl<ReactControl>(
    () =>
      new ReactControl(
        <ProductionTypesPanel state={state} onToggle={onToggle} />
      ),
    { position: 'top-right' }
  );

  useEffect(() => {
    control.setContent(
      <ProductionTypesPanel state={state} onToggle={onToggle} />
    );
  }, [control, state, onToggle]);

  return null;
}

export default function MapEurope() {
  const [windImage, setWindImage] = useState<ImageData | null>(null);
  const [imageUnscale, setImageUnscale] = useState<[number, number]>([-128, 127]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [speedMax, setSpeedMax] = useState<number>(15);
  const [windVisible, setWindVisible] = useState(true);
  const [productionTypes, setProductionTypes] = useState<ProductionTypesState>(
    DEFAULT_PRODUCTION_TYPES_STATE
  );

  const toggleWind = useCallback(() => setWindVisible((v) => !v), []);
  const toggleProductionType = useCallback((key: ProductionType) => {
    setProductionTypes((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [metaRes, imgRes] = await Promise.all([
        fetch('/api/wind/meta'),
        fetch('/api/wind/image'),
      ]);

      if (!metaRes.ok || !imgRes.ok) throw new Error('Wind fetch failed');

      const { imageUnscale, speedMax } = await metaRes.json();

      const blob = await imgRes.blob();
      const bitmap = await createImageBitmap(blob);

      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

      if (cancelled) return;
      setWindImage(image);
      setImageUnscale(imageUnscale);
      setSpeedMax(speedMax);
      setStatus('ok');
    }
    load().catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, []);

  const layers = windVisible && windImage ? [
    // Fond coloré selon la vitesse
    new RasterLayer({
      id: 'wind-raster',
      image: windImage,
      imageUnscale: [0, speedMax],
      bounds: [BOUNDS.minLon, BOUNDS.minLat, BOUNDS.maxLon, BOUNDS.maxLat],
      palette: WIND_PALETTE,
      opacity: 0.2,
      extensions: [new ClipExtension()],
      clipBounds: [BOUNDS.minLon, BOUNDS.minLat, BOUNDS.maxLon, BOUNDS.maxLat],
    }),
    // Particules blanches rapides par-dessus
    new ParticleLayer({
      id: 'wind-particles',
      image: windImage,
      imageUnscale,
      bounds: [BOUNDS.minLon, BOUNDS.minLat, BOUNDS.maxLon, BOUNDS.maxLat],
      numParticles: 5000,
      speedFactor: 3.0,
      width: 1,
      opacity: 0.85,
      maxAge: 100,
      animate: true,
      color: PARTICLE_COLOR,  // blanc
      extensions: [new ClipExtension()],
      clipBounds: [BOUNDS.minLon, BOUNDS.minLat, BOUNDS.maxLon, BOUNDS.maxLat],
    }),
  ] : [];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Map
        initialViewState={INITIAL_VIEW_STATE}
        maxBounds={EUROPE_BOUNDS}
        mapStyle={mapStyle}>

        <NavigationControl position="top-right" />
        <WindToggleControl windVisible={windVisible} onToggleWind={toggleWind} />
        <ProductionTypesControl state={productionTypes} onToggle={toggleProductionType} />
        <DeckGLOverlay layers={layers} />
      </Map>

      {status !== 'ok' && (
        <div style={{
          position: 'absolute', bottom: 16, left: 16,
          background: 'rgba(0,0,0,0.6)', color: '#fff',
          padding: '6px 12px', borderRadius: 6,
          fontSize: 13, pointerEvents: 'none',
        }}>
          {status === 'loading' ? '⟳ Chargement des vents…' : '⚠ Données vent indisponibles'}
        </div>
      )}
    </div>
  );
}