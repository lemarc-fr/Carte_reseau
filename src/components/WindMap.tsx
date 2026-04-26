'use client';

import {useMemo} from 'react';
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

const EUROPE_BOUNDS: [[number, number], [number, number]] = [
  [-11, 34],
  [35, 72]
];

export default function MapEurope() {
  const layers = useMemo(() => [], []);

  return (
    <DeckGL
      initialViewState={INITIAL_VIEW_STATE}
      controller={{maxBounds: EUROPE_BOUNDS}}
      layers={layers}
    >
      <Map
        reuseMaps
        mapStyle={{
          version: 8,

          sources: {
            // vector (frontières uniquement)
            protomaps: {
              type: 'vector',
              url: `https://api.protomaps.com/tiles/v4.json?key=${protomaps_api_key}`
            },

            // 🌄 Mapterhorn DEM (IMPORTANT: WEBP tiles)
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

            // 🌄 relief en ombre (hillshade)
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