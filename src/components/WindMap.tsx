'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { Map } from 'react-map-gl/maplibre';
import { ParticleLayer } from 'weatherlayers-gl';
import { ClipExtension } from '@deck.gl/extensions';
import {
  BOUNDS, INITIAL_VIEW_STATE, WIND_PALETTE,
  EUROPE_BOUNDS, PROTOMAPS_API_KEY, API_KEY_METEO
} from '@/config/mapConfig';
import { buildWindTexture } from '@/lib/wind/main';
import { fetchUVTiff } from '@/lib/wind/UV_TIFF';

export default function MapEurope() {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [windImage, setWindImage] = useState<ImageData | null>(null);
  const [imageUnscale, setImageUnscale] = useState<[number, number]>([-128, 127]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [uBuffer, vBuffer] = await fetchUVTiff(API_KEY_METEO, BOUNDS);
      const { image, imageUnscale } = await buildWindTexture([uBuffer, vBuffer]);
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

  const onViewStateChange = useCallback(({ viewState: vs }: any) => {
    setViewState({
      ...vs,
      longitude: Math.min(BOUNDS.maxLon, Math.max(BOUNDS.minLon, vs.longitude)),
      latitude: Math.min(BOUNDS.maxLat, Math.max(BOUNDS.minLat, vs.latitude)),
    });
  }, []);

  const layers = useMemo(() => {
    if (!windImage) return [];
    return [
      new ParticleLayer({
        id: 'wind-particles',
        image: windImage,
        imageUnscale,
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
  }, [windImage, imageUnscale]);

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
          }
        }}
      >
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