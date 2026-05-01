'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { Map } from 'react-map-gl/maplibre';
import { ParticleLayer } from 'weatherlayers-gl';
import { ClipExtension } from '@deck.gl/extensions';
import { GRID_ROWS, GRID_COLS, BOUNDS, UV_MAX, INITIAL_VIEW_STATE, WIND_PALETTE, EUROPE_BOUNDS, PROTOMAPS_API_KEY } from '@/config/mapConfig';
import { fetchWindGrid, buildWindImageData } from '@/lib/wind';

export default function MapEurope() {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [windImage, setWindImage] = useState<ImageData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;

    fetchWindGrid()
      .then(uvData => {
        if (cancelled) return;
        setWindImage(buildWindImageData(uvData));
        setStatus('ok');
      })
      .catch(err => {
        if (cancelled) return;
        console.warn('Wind fetch failed:', err);
        setWindImage(buildWindImageData(Array(GRID_COLS * GRID_ROWS).fill({ u: 0, v: 0 })));
        setStatus('error');
      });

    return () => { cancelled = true; };
  }, []);

  const onViewStateChange = useCallback(({ viewState: vs }: any) => {
    setViewState({
      ...vs,
      longitude: Math.min(BOUNDS.maxLon, Math.max(BOUNDS.minLon, vs.longitude)),
      latitude:  Math.min(BOUNDS.maxLat, Math.max(BOUNDS.minLat, vs.latitude)),
    });
  }, []);

  const layers = useMemo(() => {
    if (!windImage) return [];

    return [
      new ParticleLayer({
        id: 'wind-particles',
        image: windImage,
        imageUnscale: [-UV_MAX, UV_MAX],
        bounds: [BOUNDS.minLon, BOUNDS.minLat, BOUNDS.maxLon, BOUNDS.maxLat],
        numParticles: 5000,
        maxAge: 80,
        speedFactor: 2.0,
        width: 1.5,
        opacity: 0.85,
        animate: true,
        palette: WIND_PALETTE,
        extensions: [new ClipExtension()],
        clipBounds: [BOUNDS.minLon, BOUNDS.minLat, BOUNDS.maxLon, BOUNDS.maxLat],
      }),
    ];
  }, [windImage]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <DeckGL
  viewState={viewState}
  onViewStateChange={onViewStateChange}
  controller={{ dragRotate: false }}
  layers={layers}
  onWebGLInitialized={(gl) => {
    if (!(gl instanceof WebGL2RenderingContext)) {
  console.error('WebGL2 required for ParticleLayer');
}}}>
        <Map
          reuseMaps
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
              {
                id: 'background',
                type: 'background',
                paint: { 'background-color': '#ffffff' }
              },
              {
                id: 'hillshade',
                type: 'hillshade',
                source: 'terrain',
                paint: {
                  'hillshade-shadow-color': '#000000',
                  'hillshade-highlight-color': '#ffffff',
                  'hillshade-exaggeration': 0.6
                }
              },
              {
                id: 'countries',
                type: 'line',
                source: 'protomaps',
                'source-layer': 'boundaries',
                filter: ['==', ['get', 'kind'], 'country'],
                paint: { 'line-color': '#222', 'line-width': 1.2 }
              },
              {
                id: 'coastline',
                type: 'line',
                source: 'protomaps',
                'source-layer': 'water',
                paint: { 'line-color': '#1f2a44', 'line-width': 1.2 }
              }
            ]
          }}
        />
      </DeckGL>

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