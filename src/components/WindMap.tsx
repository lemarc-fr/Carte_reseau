'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Map, useControl } from 'react-map-gl/maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { DeckProps } from '@deck.gl/core';
import { ParticleLayer, RasterLayer } from 'weatherlayers-gl';
import { ClipExtension } from '@deck.gl/extensions';
import {
  BOUNDS, INITIAL_VIEW_STATE, WIND_PALETTE,
  EUROPE_BOUNDS, PROTOMAPS_API_KEY, API_KEY_METEO,
  PARTICLE_COLOR
} from '@/config/mapConfig';
import { buildWindTexture } from '@/lib/wind/main';
import { fetchUVTiff } from '@/lib/wind/UV_TIFF';

// Overlay interleaved — partage le contexte WebGL2 de MapLibre
function DeckGLOverlay(props: DeckProps) {
  const overlay = useControl<MapboxOverlay>(
    () => new MapboxOverlay({ interleaved: true, ...props })
  );
  overlay.setProps(props);
  return null;
}

export default function MapEurope() {
  const [windImage, setWindImage] = useState<ImageData | null>(null);
  const [imageUnscale, setImageUnscale] = useState<[number, number]>([-128, 127]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [speedMax, setSpeedMax] = useState<number>(15);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [uBuffer, vBuffer] = await fetchUVTiff(API_KEY_METEO, BOUNDS);
      const { image, imageUnscale, speedMax } = await buildWindTexture([uBuffer, vBuffer]);
      setSpeedMax(speedMax);
      if (cancelled) return;
      setWindImage(image);
      setImageUnscale(imageUnscale);
      setStatus('ok');
    }
    load().catch(err => {
      if (cancelled) return;
      console.warn('Wind fetch failed:', err);
      setStatus('error');
    });
    return () => { cancelled = true; };
  }, []);

  const layers = windImage ? [
  // Fond coloré selon la vitesse
  new RasterLayer({
    id: 'wind-raster',
    image: windImage,
    imageUnscale,
    bounds: [BOUNDS.minLon, BOUNDS.minLat, BOUNDS.maxLon, BOUNDS.maxLat],
    palette: WIND_PALETTE,
    opacity: 0.6,
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
    maxAge: 80,
    speedFactor: 8.0,  // plus rapide
    width: 1.5,
    opacity: 0.85,
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
        mapStyle={{
          version: 8,
          sources: {
            protomaps: {
              type: 'vector',
              url: `https://api.protomaps.com/tiles/v4.json?key=${PROTOMAPS_API_KEY}`
            },
            terrain: {
              type: 'raster-dem',
              tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
              tileSize: 512,
              encoding: 'terrarium',
              maxzoom: 14
            }
          },
          layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#ffffff' } },
            {
              id: 'hillshade', type: 'hillshade', source: 'terrain',
              paint: { 'hillshade-shadow-color': '#000000', 'hillshade-highlight-color': '#ffffff', 'hillshade-exaggeration': 0.6 }
            },
            {
              id: 'countries', type: 'line', source: 'protomaps', 'source-layer': 'boundaries',
              filter: ['==', ['get', 'kind'], 'country'],
              paint: { 'line-color': '#222', 'line-width': 1.2 }
            },
            {
              id: 'coastline', type: 'line', source: 'protomaps', 'source-layer': 'water',
              paint: { 'line-color': '#1f2a44', 'line-width': 1.2 }
            }
          ]
        }}
      >
        {/* interleaved : partage le WebGL2 context de MapLibre, pas de canvas séparé */}
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