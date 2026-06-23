'use client';

import React, { useEffect, useState } from 'react';
import { Map, NavigationControl, useControl } from 'react-map-gl/maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { DeckProps } from '@deck.gl/core';
import { PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';
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

interface NuclearElementBounds {
  minlat?: number;
  minlon?: number;
  maxlat?: number;
  maxlon?: number;
}

interface NuclearGeometryPoint {
  lat?: number;
  lon?: number;
}

interface NuclearElement {
  bounds?: NuclearElementBounds;
  geometry?: NuclearGeometryPoint[];
  members?: NuclearElementMember[];
}

interface NuclearElementMember {
  role?: string;
  geometry?: NuclearGeometryPoint[];
}

interface NuclearRecord {
  name?: string;
  output?: string;
  detail_page_data?: {
    osm_details?: {
      elements?: NuclearElement[];
    };
  };
}

interface NuclearPlantPoint {
  position: [number, number];
  name: string;
  output?: string;
  capacityMw: number;
  contour: [number, number][];
}

const DEFAULT_CAPACITY_MW = 1000;
const NORMALIZED_RADIUS_PIXELS = 18;
const MIN_RADIUS_PIXELS = 10;
const MAX_RADIUS_PIXELS = 34;
const DISK_FILL_ALPHA = 96;
const CONTOUR_FILL_ALPHA = 96;
const CONTOUR_ZOOM_EPSILON = 0.05;

function toCapacityMw(output?: string): number {
  if (!output) return DEFAULT_CAPACITY_MW;

  const compact = output.replace(/\s+/g, '').replace(/,/g, '');
  const valueMatch = compact.match(/(\d+(?:\.\d+)?)/);
  if (!valueMatch) return DEFAULT_CAPACITY_MW;

  const value = Number.parseFloat(valueMatch[1]);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_CAPACITY_MW;

  return /gw/i.test(compact) ? value * 1000 : value;
}

function closeContour(contour: [number, number][]): [number, number][] | null {
  if (contour.length < 3) return null;

  const [firstLon, firstLat] = contour[0];
  const [lastLon, lastLat] = contour[contour.length - 1];

  if (firstLon === lastLon && firstLat === lastLat) {
    return contour;
  }

  return [...contour, contour[0]];
}

function toContourFromGeometry(geometry?: NuclearGeometryPoint[]): [number, number][] | null {
  if (!geometry?.length) return null;

  const contour = geometry
    .filter(
      (point): point is Required<NuclearGeometryPoint> =>
        typeof point.lat === 'number' && typeof point.lon === 'number'
    )
    .map((point) => [point.lon, point.lat] as [number, number]);

  return closeContour(contour);
}

function toContourFromBounds(bounds?: NuclearElementBounds): [number, number][] | null {
  if (
    typeof bounds?.minlat !== 'number' ||
    typeof bounds?.minlon !== 'number' ||
    typeof bounds?.maxlat !== 'number' ||
    typeof bounds?.maxlon !== 'number'
  ) {
    return null;
  }

  return [
    [bounds.minlon, bounds.minlat],
    [bounds.maxlon, bounds.minlat],
    [bounds.maxlon, bounds.maxlat],
    [bounds.minlon, bounds.maxlat],
    [bounds.minlon, bounds.minlat],
  ];
}

function getLargestContour(contours: [number, number][][]): [number, number][] | null {
  const validContours = contours.filter((contour) => contour.length >= 4);
  if (!validContours.length) return null;

  return validContours.reduce((largest, current) =>
    current.length > largest.length ? current : largest
  );
}

function toElementContour(element: NuclearElement): [number, number][] | null {
  const directContour = toContourFromGeometry(element.geometry);
  if (directContour) return directContour;

  if (element.members?.length) {
    const outerContours = element.members
      .filter((member) => !member.role || member.role === 'outer')
      .map((member) => toContourFromGeometry(member.geometry))
      .filter((contour): contour is [number, number][] => contour !== null);

    const contourFromOuter = getLargestContour(outerContours);
    if (contourFromOuter) return contourFromOuter;

    const memberContours = element.members
      .map((member) => toContourFromGeometry(member.geometry))
      .filter((contour): contour is [number, number][] => contour !== null);

    const contourFromMembers = getLargestContour(memberContours);
    if (contourFromMembers) return contourFromMembers;
  }

  return toContourFromBounds(element.bounds);
}

function getCenterFromContour(contour: [number, number][]): [number, number] | null {
  if (!contour.length) return null;

  const total = contour.reduce(
    (acc, point) => {
      acc.lat += point[1];
      acc.lon += point[0];
      return acc;
    },
    { lat: 0, lon: 0 }
  );

  return [total.lon / contour.length, total.lat / contour.length];
}

function getRadiusPixels(
  capacityMw: number,
  minCapacityMw: number,
  maxCapacityMw: number,
  normalizeRing: boolean
): number {
  if (normalizeRing || minCapacityMw >= maxCapacityMw) {
    return NORMALIZED_RADIUS_PIXELS;
  }

  const clampedCapacity = Math.min(maxCapacityMw, Math.max(minCapacityMw, capacityMw));
  const ratio = (clampedCapacity - minCapacityMw) / (maxCapacityMw - minCapacityMw);

  return MIN_RADIUS_PIXELS + ratio * (MAX_RADIUS_PIXELS - MIN_RADIUS_PIXELS);
}

function toPlantPoint(record: NuclearRecord): NuclearPlantPoint | null {
  const elements = record.detail_page_data?.osm_details?.elements;
  if (!elements?.length) return null;

  const capacityMw = toCapacityMw(record.output);

  for (const element of elements) {
    const contour = toElementContour(element);
    if (contour) {
      const center = getCenterFromContour(contour);
      if (!center) continue;

      return {
        position: center,
        name: record.name ?? 'Centrale nucléaire',
        output: record.output,
        capacityMw,
        contour,
      };
    }
  }

  return null;
}

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
  const normalizeRing = useMapStore((s) => s.normalizeRing);
  const nuclearVisible = useMapStore((s) => s.productionTypes.nuclear);

  const [nuclearPlants, setNuclearPlants] = useState<NuclearPlantPoint[]>([]);
  const [zoomLevel, setZoomLevel] = useState(
    typeof INITIAL_VIEW_STATE.zoom === 'number' ? INITIAL_VIEW_STATE.zoom : 0
  );
  const [maxZoomLevel, setMaxZoomLevel] = useState(22);

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

  useEffect(() => {
    let cancelled = false;

    async function loadNuclearPlants() {
      try {
        const response = await fetch('/production/NUCLEAR.json');
        if (!response.ok) throw new Error('Nuclear fetch failed');

        const records = (await response.json()) as NuclearRecord[];
        const points = records
          .map((record) => toPlantPoint(record))
          .filter((point): point is NuclearPlantPoint => point !== null);

        if (!cancelled) {
          setNuclearPlants(points);
        }
      } catch {
        if (!cancelled) {
          setNuclearPlants([]);
        }
      }
    }

    loadNuclearPlants();
    return () => {
      cancelled = true;
    };
  }, []);

  // Layers deck.gl — dépendent uniquement de windData et windVisible
  const layers = [];
  const minCapacityMw =
    nuclearPlants.length > 0
      ? Math.min(...nuclearPlants.map((plant) => plant.capacityMw))
      : DEFAULT_CAPACITY_MW;
  const maxCapacityMw =
    nuclearPlants.length > 0
      ? Math.max(...nuclearPlants.map((plant) => plant.capacityMw))
      : DEFAULT_CAPACITY_MW;
  const showPlantContour = zoomLevel >= maxZoomLevel - CONTOUR_ZOOM_EPSILON;

  if (windVisible && windData) {
    layers.push(
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
      })
    );
  }

  if (nuclearVisible && nuclearPlants.length > 0 && !showPlantContour) {
    layers.push(
      new ScatterplotLayer<NuclearPlantPoint>({
        id: 'nuclear-plants',
        data: nuclearPlants,
        getPosition: (plant) => plant.position,
        getRadius: (plant) => getRadiusPixels(
          plant.capacityMw,
          minCapacityMw,
          maxCapacityMw,
          normalizeRing
        ),
        radiusUnits: 'pixels',
        getFillColor: [255, 135, 0, DISK_FILL_ALPHA],
        getLineColor: [255, 255, 255, 255],
        lineWidthMinPixels: 1,
        getLineWidth: 2,
        stroked: true,
        filled: true,
        pickable: true,
      })
    );
  }

  if (nuclearVisible && showPlantContour) {
    const plantsWithContour = nuclearPlants.filter((plant) => plant.contour.length >= 4);

    if (plantsWithContour.length > 0) {
      layers.push(
        new PolygonLayer<NuclearPlantPoint>({
          id: 'nuclear-plants-contour',
          data: plantsWithContour,
          getPolygon: (plant) => plant.contour,
          getFillColor: [255, 135, 0, CONTOUR_FILL_ALPHA],
          getLineColor: [255, 255, 255, 255],
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
          lineWidthMinPixels: 1,
          filled: true,
          stroked: true,
          pickable: true,
        })
      );
    }
  }

  return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <Map
            initialViewState={INITIAL_VIEW_STATE}
            maxBounds={EUROPE_BOUNDS}
            mapStyle={mapStyle}
            onLoad={(event) => {
              setZoomLevel(event.target.getZoom());
              setMaxZoomLevel(event.target.getMaxZoom());
            }}
            onMove={(event) => {
              setZoomLevel(event.viewState.zoom);
            }}
        >
          <NavigationControl position="top-right" />
          <WindToggleControl />
          <ProductionTypesControl />
          <DeckGLOverlay layers={layers} />
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