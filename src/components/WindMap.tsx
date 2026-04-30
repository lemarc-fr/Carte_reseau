'use client';

import { useState, useCallback, useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import {Map} from 'react-map-gl/maplibre';

const protomaps_api_key = "d0a95613fda80905";

const INITIAL_VIEW_STATE = {
  longitude: 10,
  latitude: 50,
  zoom: 4.2,
  minZoom: 3,
  maxZoom: 7,
  pitch: 0,
  bearing: 0
};

const BOUNDS = {
  minLon: -8, maxLon: 10,
  minLat: 40,  maxLat: 52,
};

const EUROPE_BOUNDS: [[number, number], [number, number]] = [
  [BOUNDS.minLon, BOUNDS.minLat],
  [BOUNDS.maxLon, BOUNDS.maxLat]
];

export default function MapEurope() {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const onViewStateChange = useCallback(({ viewState: vs }: any) => {
    setViewState({
      ...vs,
      longitude: Math.min(BOUNDS.maxLon, Math.max(BOUNDS.minLon, vs.longitude)),
      latitude:  Math.min(BOUNDS.maxLat, Math.max(BOUNDS.minLat, vs.latitude)),
    });
  }, []);
  
  const layers = useMemo(() => [], []);

  return (
    <DeckGL
      viewState={viewState}
      onViewStateChange={onViewStateChange}
      controller={{ dragRotate: false }}
      layers={layers}
    >
      <Map
        reuseMaps
        maxBounds={EUROPE_BOUNDS}
        mapStyle={{
          version: 8,

          sources: {
            // vector (frontières uniquement)
            protomaps: {
              type: 'vector',
              url: `https://api.protomaps.com/tiles/v4.json?key=${protomaps_api_key}`
            },

            // Mapterhorn DEM (IMPORTANT: WEBP tiles)
            terrain: {
              type: 'raster-dem',
              tiles: [
                'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'
              ],
              tileSize: 512,
              encoding: 'terrarium',
              maxzoom: 14
            }
          },

          layers: [
            // fond blanc
            {
              id: 'background',
              type: 'background',
              paint: {
                'background-color': '#ffffff'
              }
            },

            // relief en ombre (hillshade)
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

            // frontières pays uniquement
            {
              id: 'countries',
              type: 'line',
              source: 'protomaps',
              'source-layer': 'boundaries',
              filter: ['==', ['get', 'kind'], 'country'],
              paint: {
                'line-color': '#222',
                'line-width': 1.2
              }
            },
            {
                id: 'coastline',
                type: 'line',
                source: 'protomaps',
                'source-layer': 'water',
                paint: {
                    'line-color': '#1f2a44',
                    'line-width': 1.2
                }
            }
          ]
        }}
      />
    </DeckGL>
  );
}