import { PROTOMAPS_API_KEY } from '@/config/mapConfig';
import type { StyleSpecification } from 'maplibre-gl';

export const mapStyle: StyleSpecification = {
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
        };