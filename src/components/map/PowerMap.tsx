'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AttributionControl,
  FullscreenControl,
  Map,
  NavigationControl,
  useControl,
  type MapRef,
} from 'react-map-gl/maplibre';
import type { GeoJSONSource } from 'maplibre-gl';
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox';
import type { PickingInfo } from '@deck.gl/core';
import { PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { ClipExtension } from '@deck.gl/extensions';
import { ParticleLayer, RasterLayer } from 'weatherlayers-gl';
import {
  BOUNDS,
  FRANCE_BOUNDS,
  MAP_MAX_ZOOM,
  MAX_BOUNDS,
  PARTICLE_COLOR,
  WIND_PALETTE,
  WIND_RASTER_OPACITY,
} from '@/config/mapConfig';
import {
  FIRST_POWER_LINE_LAYER_ID,
  mapStyle,
  PLANT_LABELS_LAYER_ID,
  PLANTS_SOURCE_ID,
  POWER_LINE_LAYERS,
} from '@/config/mapStyle';
import { useMapStore } from '@/store/useMapStore';
import { useCurrentSlot } from '@/hooks/useCurrentSlot';
import { formatMW, formatPercent, formatShortDateTime, formatSlot, plantSnapshot } from '@/lib/generationUtils';
import { ReactControl } from '../controls/ReactControl';
import MapControlsPanel from './MapControlsPanel';
import styles from './Map.module.css';

// ─── Représentation des centrales ─────────────────────────────────────────────
// Surface proportionnelle à la puissance : rayon (m) = √MW × constante.
// Anneau = capacité installée, disque = production du créneau affiché.

const METERS_PER_SQRT_MW = 1000;
const NORMALIZED_CAPACITY_MW = 3600; // taille commune en mode « Normaliser »
const CONTOUR_MIN_ZOOM = 10; // au-delà, les cercles masquent tout : on dessine l'emprise du site
const DIMMED = 0.3; // opacité des autres centrales quand une centrale est sélectionnée
const SELECTION_CONTEXT = 2.5; // marge autour de l'anneau quand on cadre une centrale

// Couleurs « nuclear » de la carte de référence
const FILL: [number, number, number] = [0, 255, 255];
const STROKE: [number, number, number] = [0, 200, 200];
const FILL_NO_DATA: [number, number, number] = [50, 100, 100];

type RGBA = [number, number, number, number];

const PREMULTIPLIED_ALPHA_BLENDING = {
  blend: true,
  blendColorSrcFactor: 'one',
  blendColorDstFactor: 'one-minus-src-alpha',
  blendAlphaSrcFactor: 'one',
  blendAlphaDstFactor: 'one-minus-src-alpha',
} as const;

// Prop lue par @deck.gl/mapbox (rendu interleaved), absente des types des calques
type Interleaved = { beforeId?: string };

interface PlantDatum {
  id: string;
  name: string;
  position: [number, number];
  contour: [number, number][] | null;
  capacity: number;
  output: number | null;
  running: number;
  reactors: number;
}

function ringRadius(capacity: number, normalize: boolean): number {
  return Math.sqrt(normalize ? NORMALIZED_CAPACITY_MW : capacity) * METERS_PER_SQRT_MW;
}

function discRadius(d: PlantDatum, normalize: boolean): number {
  if (!d.output) return 0;
  return ringRadius(d.capacity, normalize) * Math.sqrt(d.output / d.capacity);
}

// ─── Contrôles ────────────────────────────────────────────────────────────────

function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(
      () => new MapboxOverlay({ interleaved: true, ...props })
  );
  overlay.setProps(props);
  return null;
}

function ControlsToggle() {
  const open = useMapStore((s) => s.controlsOpen);
  const toggle = useMapStore((s) => s.toggleControls);
  return (
    <button
      type="button"
      className={styles.controlButton}
      title="Contrôles de la carte"
      aria-label="Contrôles de la carte"
      aria-pressed={open}
      onClick={toggle}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
        <circle cx="16" cy="6" r="2" />
        <circle cx="10" cy="12" r="2" />
        <circle cx="18" cy="18" r="2" />
      </svg>
    </button>
  );
}

function MapControlsButton() {
  useControl<ReactControl>(() => new ReactControl(<ControlsToggle />), { position: 'top-right' });
  return null;
}

// ─── Carte ────────────────────────────────────────────────────────────────────

export default function PowerMap() {
  const mapRef = useRef<MapRef>(null);
  const plants = useMapStore((s) => s.plants);
  const selectedPlantId = useMapStore((s) => s.selectedPlantId);
  const hoveredPlantId = useMapStore((s) => s.hoveredPlantId);
  const selectPlant = useMapStore((s) => s.selectPlant);
  const setHoveredPlantId = useMapStore((s) => s.setHoveredPlantId);
  const windData = useMapStore((s) => s.windData);
  const windVisible = useMapStore((s) => s.windVisible);
  const windStatus = useMapStore((s) => s.windStatus);
  const capacityRingVisible = useMapStore((s) => s.capacityRingVisible);
  const normalizeRing = useMapStore((s) => s.normalizeRing);
  const powerLinesVisible = useMapStore((s) => s.powerLinesVisible);
  const labelsVisible = useMapStore((s) => s.labelsVisible);
  const nuclearVisible = useMapStore((s) => s.productionTypes.nuclear);
  const { generation, index } = useCurrentSlot();

  const [styleReady, setStyleReady] = useState(false);
  const [showContours, setShowContours] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; id: string } | null>(null);

  const data = useMemo<PlantDatum[]>(
    () =>
      plants.map((plant) => {
        const snapshot = plantSnapshot(plant, generation, index);
        return {
          id: plant.id,
          name: plant.name,
          position: [plant.longitude, plant.latitude],
          contour: plant.contour,
          capacity: plant.capacity_mw,
          output: snapshot.output,
          running: snapshot.running,
          reactors: snapshot.reactors,
        };
      }),
    [plants, generation, index]
  );

  // ─── Calques MapLibre : noms des centrales et lignes électriques ───────────

  useEffect(() => {
    const map = mapRef.current?.getMap();
    const source = styleReady ? map?.getSource<GeoJSONSource>(PLANTS_SOURCE_ID) : undefined;
    if (!source) return;
    const byCapacity = [...plants].sort((a, b) => b.capacity_mw - a.capacity_mw).map((p) => p.id);
    source.setData({
      type: 'FeatureCollection',
      features: plants.map((plant) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [plant.longitude, plant.latitude] },
        properties: {
          name: plant.name,
          rank: plant.id === selectedPlantId ? -1 : byCapacity.indexOf(plant.id),
          dimmed: selectedPlantId !== null && plant.id !== selectedPlantId,
        },
      })),
    });
  }, [styleReady, plants, selectedPlantId]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!styleReady || !map) return;
    map.setLayoutProperty(PLANT_LABELS_LAYER_ID, 'visibility', labelsVisible && nuclearVisible ? 'visible' : 'none');
    for (const layer of POWER_LINE_LAYERS) {
      map.setLayoutProperty(layer.id, 'visibility', powerLinesVisible ? 'visible' : 'none');
    }
  }, [styleReady, labelsVisible, nuclearVisible, powerLinesVisible]);

  // Cadre la centrale sélectionnée avec son anneau de capacité et un peu de contexte
  useEffect(() => {
    const map = mapRef.current;
    const plant = plants.find((p) => p.id === selectedPlantId);
    if (!map || !plant) return;
    const dLat = (ringRadius(plant.capacity_mw, normalizeRing) * SELECTION_CONTEXT) / 111_320;
    const dLon = dLat / Math.cos((plant.latitude * Math.PI) / 180);
    map.fitBounds(
      [
        [plant.longitude - dLon, plant.latitude - dLat],
        [plant.longitude + dLon, plant.latitude + dLat],
      ],
      { padding: 40, maxZoom: 8, duration: 1200 }
    );
    // Uniquement au changement de sélection, pas à chaque rafraîchissement des données
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlantId]);

  // ─── Calques deck.gl ───────────────────────────────────────────────────────

  const layers = useMemo(() => {
    const alpha = (value: number, id: string) =>
      selectedPlantId && id !== selectedPlantId ? Math.round(value * DIMMED) : value;
    const highlighted = (id: string) => id === selectedPlantId || id === hoveredPlantId;
    const result = [];

    if (windVisible && windData) {
      result.push(
        new RasterLayer({
          id: 'wind-raster',
          beforeId: FIRST_POWER_LINE_LAYER_ID,
          image: windData.image,
          // R/G = composantes U/V encodées sur [-max, +max], comme pour les particules
          imageUnscale: windData.imageUnscale,
          bounds: [BOUNDS.minLon, BOUNDS.minLat, BOUNDS.maxLon, BOUNDS.maxLat],
          palette: WIND_PALETTE,
          opacity: WIND_RASTER_OPACITY,
          // Le shader WeatherLayers sort une couleur prémultipliée par l'alpha : sans ces
          // facteurs, deck.gl la multiplie une seconde fois et le fond devient gris.
          parameters: PREMULTIPLIED_ALPHA_BLENDING,
          extensions: [new ClipExtension()],
          clipBounds: [BOUNDS.minLon, BOUNDS.minLat, BOUNDS.maxLon, BOUNDS.maxLat],
        }),
        new ParticleLayer({
          id: 'wind-particles',
          beforeId: FIRST_POWER_LINE_LAYER_ID,
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

    if (!nuclearVisible || data.length === 0) return result;

    if (showContours) {
      result.push(
        new PolygonLayer<PlantDatum, Interleaved>({
          id: 'plant-contours',
          beforeId: PLANT_LABELS_LAYER_ID,
          data: data.filter((d) => d.contour),
          getPolygon: (d) => d.contour!,
          getFillColor: (d): RGBA =>
            d.output === null
              ? [...FILL_NO_DATA, alpha(80, d.id)]
              : [...FILL, alpha(60 + Math.round(140 * Math.min(1, d.output / d.capacity)), d.id)],
          getLineColor: (d): RGBA => (highlighted(d.id) ? [26, 32, 44, 255] : [...STROKE, alpha(255, d.id)]),
          getLineWidth: (d) => (highlighted(d.id) ? 2.5 : 1.5),
          lineWidthUnits: 'pixels',
          pickable: true,
          updateTriggers: {
            getFillColor: [selectedPlantId],
            getLineColor: [selectedPlantId, hoveredPlantId],
            getLineWidth: [selectedPlantId, hoveredPlantId],
          },
        })
      );
      return result;
    }

    if (capacityRingVisible) {
      result.push(
        new ScatterplotLayer<PlantDatum, Interleaved>({
          id: 'capacity-rings',
          beforeId: PLANT_LABELS_LAYER_ID,
          data,
          getPosition: (d) => d.position,
          getRadius: (d) => ringRadius(d.capacity, normalizeRing),
          radiusUnits: 'meters',
          filled: true,
          stroked: true,
          getFillColor: (d): RGBA =>
            d.output === null ? [...FILL_NO_DATA, alpha(70, d.id)] : [255, 255, 255, alpha(70, d.id)],
          getLineColor: (d): RGBA => (highlighted(d.id) ? [26, 32, 44, 255] : [74, 85, 104, alpha(160, d.id)]),
          getLineWidth: (d) => (highlighted(d.id) ? 2 : 1),
          lineWidthUnits: 'pixels',
          pickable: true,
          updateTriggers: {
            getRadius: [normalizeRing],
            getFillColor: [selectedPlantId],
            getLineColor: [selectedPlantId, hoveredPlantId],
            getLineWidth: [selectedPlantId, hoveredPlantId],
          },
        })
      );
    }

    result.push(
      new ScatterplotLayer<PlantDatum, Interleaved>({
        id: 'generation-discs',
        beforeId: PLANT_LABELS_LAYER_ID,
        data: data.filter((d) => d.output),
        getPosition: (d) => d.position,
        getRadius: (d) => discRadius(d, normalizeRing),
        radiusUnits: 'meters',
        radiusMinPixels: 2,
        filled: true,
        stroked: true,
        getFillColor: (d): RGBA => [...FILL, alpha(110, d.id)],
        getLineColor: (d): RGBA => [...STROKE, alpha(255, d.id)],
        getLineWidth: 1,
        lineWidthUnits: 'pixels',
        pickable: true,
        updateTriggers: {
          getRadius: [normalizeRing],
          getFillColor: [selectedPlantId],
          getLineColor: [selectedPlantId],
        },
      })
    );

    return result;
  }, [
    data,
    windVisible,
    windData,
    nuclearVisible,
    capacityRingVisible,
    normalizeRing,
    showContours,
    selectedPlantId,
    hoveredPlantId,
  ]);

  // ─── Interactions ──────────────────────────────────────────────────────────

  const lastHovered = useRef<string | null>(null);
  const onHover = useCallback(
    (info: PickingInfo<PlantDatum>) => {
      const id = info.object?.id ?? null;
      if (id !== lastHovered.current) {
        lastHovered.current = id;
        setHoveredPlantId(id);
        const canvas = mapRef.current?.getCanvas();
        if (canvas) canvas.style.cursor = id ? 'pointer' : '';
      }
      setTooltip(id ? { x: info.x, y: info.y, id } : null);
    },
    [setHoveredPlantId]
  );

  const onClick = useCallback(
    (info: PickingInfo<PlantDatum>) => {
      if (info.object) selectPlant(info.object.id);
    },
    [selectPlant]
  );

  const tooltipDatum = tooltip ? data.find((d) => d.id === tooltip.id) : undefined;

  return (
    <div className={styles.map}>
      <Map
        ref={mapRef}
        initialViewState={{ bounds: FRANCE_BOUNDS, fitBoundsOptions: { padding: 20 } }}
        minZoom={3}
        maxZoom={MAP_MAX_ZOOM}
        maxBounds={MAX_BOUNDS}
        mapStyle={mapStyle}
        attributionControl={false}
        onStyleData={() => setStyleReady(true)}
        onMove={(e) => {
          const contours = e.viewState.zoom >= CONTOUR_MIN_ZOOM;
          setShowContours((current) => (current === contours ? current : contours));
        }}
        onError={(e) => console.error('[carte]', e.error?.message ?? e.error)}
      >
        <FullscreenControl position="top-right" containerId="map-card" />
        <NavigationControl position="top-right" />
        <MapControlsButton />
        <AttributionControl
          position="bottom-right"
          compact={false}
          customAttribution={['<a href="https://data.rte-france.com">RTE</a>', 'Météo-France AROME']}
        />
        <DeckGLOverlay layers={layers} onHover={onHover} onClick={onClick} />
      </Map>

      <MapControlsPanel />

      {tooltip && tooltipDatum && (
        <div className={styles.tooltip} style={{ left: tooltip.x, top: tooltip.y }}>
          <div className={styles.tooltipTitle}>{tooltipDatum.name}</div>
          <div className={styles.tooltipRow}>
            <span>Production</span>
            <span>{formatMW(tooltipDatum.output)} MW</span>
          </div>
          <div className={styles.tooltipRow}>
            <span>Capacité</span>
            <span>{formatMW(tooltipDatum.capacity)} MW</span>
          </div>
          {tooltipDatum.output !== null && (
            <>
              <div className={styles.tooltipRow}>
                <span>Facteur de charge</span>
                <span>{formatPercent(tooltipDatum.output / tooltipDatum.capacity)}</span>
              </div>
              <div className={styles.tooltipRow}>
                <span>Réacteurs en marche</span>
                <span>
                  {tooltipDatum.running} / {tooltipDatum.reactors}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {windVisible && (
        <div className={styles.status}>
          {windStatus === 'loading' && '⟳ Chargement des vents…'}
          {windStatus === 'error' && '⚠ Données vent indisponibles'}
          {windStatus === 'ok' && windData && (
            <>
              Vent à 10 m · AROME Météo-France
              {windData.validTime !== null && <> · prévision pour {formatSlot(windData.validTime)}</>}
              {windData.runTime !== null && <> · run du {formatShortDateTime(windData.runTime)}</>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
