import { MAP_MAX_ZOOM, PROTOMAPS_API_KEY } from '@/config/mapConfig';
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';

// Fond de carte sobre (terre claire, mer gris-bleu, relief) pour faire ressortir
// les centrales, dans l'esprit de la GB Renewables Map. Ordre de rendu :
//   fond de carte → [vent deck.gl] → lignes électriques → [cercles deck.gl] → noms des centrales
// Les calques deck.gl s'insèrent via `beforeId` sur les identifiants exportés ci-dessous.

const WATER = '#dde4ea';
const LAND = '#f7f7f5';

export const PLANTS_SOURCE_ID = 'plants';
// Premier calque des noms : les cercles deck.gl s'insèrent juste en dessous
export const PLANT_LABELS_LAYER_ID = 'plant-labels';
const PLANT_LABELS_MAJOR_LAYER_ID = 'plant-labels-major';
export const PLANT_LABEL_LAYER_IDS = [PLANT_LABELS_LAYER_ID, PLANT_LABELS_MAJOR_LAYER_ID];

// ─── Lignes électriques (Open Infrastructure Map) ────────────────────────────

const voltage: ExpressionSpecification = ['to-number', ['coalesce', ['get', 'voltage'], 0]];
const inService: ExpressionSpecification = ['all', ['!=', ['get', 'disused'], true], ['!=', ['get', 'construction'], true]];

// Les filtres MapLibre n'acceptent pas ['zoom'] : un calque par niveau de tension,
// les tensions les plus basses n'apparaissant qu'en zoomant.
const powerLineLayer = (id: string, minVoltage: number, maxVoltage: number, minzoom: number, width: number): LayerSpecification => ({
  id,
  type: 'line',
  source: 'power-lines',
  'source-layer': 'power_line',
  minzoom,
  filter: ['all', inService, ['>=', voltage, minVoltage], ['<', voltage, maxVoltage]],
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': '#7b8794',
    'line-opacity': 0.55,
    'line-width': ['interpolate', ['linear'], ['zoom'], 4, width * 0.4, 8, width, 13, width * 2.5],
  },
});

export const POWER_LINE_LAYERS: LayerSpecification[] = [
  powerLineLayer('power-lines-low', 0, 63, 10, 0.4),
  powerLineLayer('power-lines-medium', 63, 220, 7, 0.6),
  powerLineLayer('power-lines-high', 220, 380, 4, 0.9),
  powerLineLayer('power-lines-very-high', 380, 100_000, 2, 1.2),
];

export const FIRST_POWER_LINE_LAYER_ID = POWER_LINE_LAYERS[0].id;

// ─── Style complet ───────────────────────────────────────────────────────────

export const mapStyle: StyleSpecification = {
  version: 8,
  glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
  sources: {
    protomaps: {
      type: 'vector',
      url: `https://api.protomaps.com/tiles/v4.json?key=${PROTOMAPS_API_KEY}`,
      attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
    },
    terrain: {
      type: 'raster-dem',
      tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
      tileSize: 512,
      encoding: 'terrarium',
      maxzoom: MAP_MAX_ZOOM,
      attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>'
    },
    'power-lines': {
      type: 'vector',
      tiles: ['https://openinframap.org/map/power/{z}/{x}/{y}.pbf'],
      minzoom: 2,
      maxzoom: 17,
      attribution: '<a href="https://openinframap.org/copyright">Open Infrastructure Map</a>'
    },
    // Rempli côté client (PowerMap) avec la position et le nom des centrales
    [PLANTS_SOURCE_ID]: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    }
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': WATER } },
    { id: 'earth', type: 'fill', source: 'protomaps', 'source-layer': 'earth', paint: { 'fill-color': LAND } },
    {
      id: 'landcover-forest', type: 'fill', source: 'protomaps', 'source-layer': 'landcover',
      filter: ['in', ['get', 'kind'], ['literal', ['forest', 'wood']]],
      paint: { 'fill-color': '#e8eee3', 'fill-opacity': 0.7 }
    },
    {
      id: 'water', type: 'fill', source: 'protomaps', 'source-layer': 'water',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': WATER }
    },
    {
      id: 'rivers', type: 'line', source: 'protomaps', 'source-layer': 'water', minzoom: 7,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': '#cdd8e0', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.4, 12, 1.5] }
    },
    {
      id: 'hillshade', type: 'hillshade', source: 'terrain',
      paint: {
        'hillshade-shadow-color': '#718096',
        'hillshade-highlight-color': '#ffffff',
        'hillshade-accent-color': '#cbd5e0',
        'hillshade-exaggeration': 0.25
      }
    },
    {
      id: 'roads-highway', type: 'line', source: 'protomaps', 'source-layer': 'roads', minzoom: 6,
      filter: ['==', ['get', 'kind'], 'highway'],
      paint: { 'line-color': '#e2e2de', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 12, 2.5] }
    },
    {
      id: 'roads-major', type: 'line', source: 'protomaps', 'source-layer': 'roads', minzoom: 9,
      filter: ['==', ['get', 'kind'], 'major_road'],
      paint: { 'line-color': '#e8e8e4', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 14, 2] }
    },
    {
      id: 'coastline', type: 'line', source: 'protomaps', 'source-layer': 'earth',
      paint: { 'line-color': '#9aa8b4', 'line-width': 0.6 }
    },
    {
      id: 'boundaries-region', type: 'line', source: 'protomaps', 'source-layer': 'boundaries', minzoom: 5,
      filter: ['==', ['get', 'kind'], 'region'],
      paint: { 'line-color': '#b8bec6', 'line-width': 0.6, 'line-dasharray': [3, 2] }
    },
    {
      id: 'boundaries-country', type: 'line', source: 'protomaps', 'source-layer': 'boundaries',
      filter: ['==', ['get', 'kind'], 'country'],
      paint: { 'line-color': '#6b7480', 'line-width': 1 }
    },
    ...POWER_LINE_LAYERS,
    // Noms des centrales : petites installations à partir du zoom 8, grandes dès la vue France
    ...([
      [PLANT_LABELS_LAYER_ID, false, 8],
      [PLANT_LABELS_MAJOR_LAYER_ID, true, 4.5],
    ] as const).map(([id, major, minzoom]): LayerSpecification => ({
      id, type: 'symbol', source: PLANTS_SOURCE_ID, minzoom,
      filter: ['==', ['get', 'major'], major],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Medium'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 10, 14],
        // Les grosses installations gardent leur nom quand les étiquettes se chevauchent
        'symbol-sort-key': ['get', 'rank'],
        'text-padding': 4
      },
      paint: {
        'text-color': '#1a202c',
        'text-halo-color': 'rgba(255, 255, 255, 0.9)',
        'text-halo-width': 1.6,
        'text-opacity': ['case', ['boolean', ['get', 'dimmed'], false], 0.35, 1]
      }
    }))
  ]
};
