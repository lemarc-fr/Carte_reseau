'use client';

import React, { useEffect, useState } from 'react';
import { Map, NavigationControl, useControl } from 'react-map-gl/maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { DeckProps } from '@deck.gl/core';
import { ScatterplotLayer } from '@deck.gl/layers';
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
}

function toPlantPoint(record: NuclearRecord): NuclearPlantPoint | null {
  const elements = record.detail_page_data?.osm_details?.elements;
  if (!elements?.length) return null;

  for (const element of elements) {
    const bounds = element.bounds;
    if (
      typeof bounds?.minlat === 'number' &&
      typeof bounds?.maxlat === 'number' &&
      typeof bounds?.minlon === 'number' &&
      typeof bounds?.maxlon === 'number'
    ) {
      return {
        position: [
          (bounds.minlon + bounds.maxlon) / 2,
          (bounds.minlat + bounds.maxlat) / 2,
        ],
        name: record.name ?? 'Centrale nucléaire',
        output: record.output,
      };
    }

    const geometry = element.geometry;
    if (geometry?.length) {
      const points = geometry.filter(
        (point): point is Required<NuclearGeometryPoint> =>
          typeof point.lat === 'number' && typeof point.lon === 'number'
      );

      if (points.length > 0) {
        const total = points.reduce(
          (acc, point) => {
            acc.lat += point.lat;
            acc.lon += point.lon;
            return acc;
          },
          { lat: 0, lon: 0 }
        );

        return {
          position: [total.lon / points.length, total.lat / points.length],
          name: record.name ?? 'Centrale nucléaire',
          output: record.output,
        };
      }
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
  const nuclearVisible = useMapStore((s) => s.productionTypes.nuclear);

  const [nuclearPlants, setNuclearPlants] = useState<NuclearPlantPoint[]>([]);

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

  if (nuclearVisible && nuclearPlants.length > 0) {
    layers.push(
      new ScatterplotLayer<NuclearPlantPoint>({
        id: 'nuclear-plants',
        data: nuclearPlants,
        getPosition: (plant) => plant.position,
        getRadius: 10000,
        radiusUnits: 'meters',
        radiusMinPixels: 4,
        radiusMaxPixels: 16,
        getFillColor: [255, 135, 0, 190],
        getLineColor: [255, 255, 255, 220],
        lineWidthMinPixels: 1,
        stroked: true,
        pickable: true,
      })
    );
  }

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