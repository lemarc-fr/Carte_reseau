'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AttributionControl,
  FullscreenControl,
  Map,
  NavigationControl,
  useControl,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre';
import type { GeoJSONSource } from 'maplibre-gl';
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox';
import type { PickingInfo } from '@deck.gl/core';
import { PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { DETAIL_MIN_ZOOM, FRANCE_BOUNDS, MAP_MAX_ZOOM, MAX_BOUNDS, WIND_PALETTE } from '@/config/mapConfig';
import {
  FIRST_POWER_LINE_LAYER_ID,
  mapStyle,
  OSM_FILTERED_LAYER_IDS,
  OSM_INTERACTIVE_LAYER_IDS,
  osmSourceFilter,
  PLANT_LABEL_LAYER_IDS,
  PLANT_LABELS_LAYER_ID,
  PLANTS_SOURCE_ID,
  POWER_LINE_LAYERS,
} from '@/config/mapStyle';
import { ASSET_TYPE_ORDER, ASSET_TYPES } from '@/config/assetTypes';
import type { AssetType } from '@/types/energy';
import { useMapStore } from '@/store/useMapStore';
import { useCurrentSlot } from '@/hooks/useCurrentSlot';
import {
  chargingLabel,
  formatMW,
  hasLargeUnit,
  LARGE_UNIT_MW,
  formatOutput,
  formatPercent,
  formatShortDateTime,
  formatSlot,
  plantSnapshot,
} from '@/lib/generationUtils';
import { ReactControl } from '../controls/ReactControl';
import DisplayPanel from '../controls/DisplayPanel';
import ProductionTypesPanel from '../controls/ProductionTypesPanel';
import { windParticleLayers, windRasterLayers } from './windLayers';
import styles from './Map.module.css';

// ─── Représentation des centrales ─────────────────────────────────────────────
// Surface proportionnelle à la puissance : rayon (m) = √MW × constante.
// Anneau = capacité installée, disque = production du créneau affiché.
// Au zoom du détail, les cercles laissent la place à l'emprise des sites et aux
// installations d'OpenStreetMap.

const METERS_PER_SQRT_MW = 1000;
const NORMALIZED_CAPACITY_MW = 400; // taille commune en mode « Normaliser »
const DIMMED = 0.3; // opacité des autres sites quand un site est sélectionné
const SELECTION_CONTEXT = 2.5; // marge autour de l'anneau quand on cadre un site
const MAJOR_PLANT_MW = 500; // nom affiché dès la vue France (sinon à partir du zoom 8)

const FILL_NO_DATA: [number, number, number] = [90, 100, 110];
// Opacité du disque : production publiée, estimée, ou stockage qui se recharge
const DISC_ALPHA = { measured: 110, estimated: 80, charging: 40 };

type RGBA = [number, number, number, number];

// Légende de la couche vent (palette de mapConfig)
const WIND_MAX = WIND_PALETTE[WIND_PALETTE.length - 1][0];
const WIND_GRADIENT = `linear-gradient(to right, ${WIND_PALETTE.map(
  ([speed, [r, g, b]]) => `rgb(${r}, ${g}, ${b}) ${((speed / WIND_MAX) * 100).toFixed(1)}%`
).join(', ')})`;

// Prop lue par @deck.gl/mapbox (rendu interleaved), absente des types des calques
type Interleaved = { beforeId?: string };

interface PlantDatum {
  id: string;
  name: string;
  type: AssetType;
  position: [number, number];
  contour: [number, number][] | null;
  capacity: number;
  output: number | null; // MW, négatif pour un stockage qui se recharge
  estimated: boolean;
  running: number;
  units: number;
}

// Installation OpenStreetMap survolée au zoom du détail
interface OsmFeature {
  x: number;
  y: number;
  name: string | null;
  source: string | null;
  outputMw: number | null;
  kind: 'plant' | 'generator';
}

function ringRadius(capacity: number, normalize: boolean): number {
  return Math.sqrt(normalize ? NORMALIZED_CAPACITY_MW : capacity) * METERS_PER_SQRT_MW;
}

// Un stockage qui se recharge garde un disque proportionnel à la puissance absorbée
function discRadius(d: PlantDatum, normalize: boolean): number {
  if (!d.output) return 0;
  return ringRadius(d.capacity, normalize) * Math.sqrt(Math.abs(d.output) / d.capacity);
}

/** Filière d'une installation OSM (`source`), si elle correspond à l'une des nôtres. */
function osmSourceLabel(source: string | null): string {
  const type = ASSET_TYPE_ORDER.find((t) => source && ASSET_TYPES[t].osmSources.includes(source));
  return type ? ASSET_TYPES[type].label : source ? `Autre (${source})` : 'Filière non renseignée';
}

// ─── Contrôles ────────────────────────────────────────────────────────────────

// interleaved : calques dessinés dans le contexte WebGL de MapLibre, entre ses couches
function DeckGLOverlay({ interleaved = true, ...props }: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({ interleaved, ...props }));
  overlay.setProps(props);
  return null;
}

// Panneaux d'icônes (contenu lu dans le store)
function PanelControl({ children }: { children: React.ReactElement }) {
  useControl<ReactControl>(() => new ReactControl(children), { position: 'top-right' });
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
  const windLayers = useMapStore((s) => s.windLayers);
  const windVisible = useMapStore((s) => s.windVisible);
  const windStatus = useMapStore((s) => s.windStatus);
  const capacityRingVisible = useMapStore((s) => s.capacityRingVisible);
  const normalizeRing = useMapStore((s) => s.normalizeRing);
  const powerLinesVisible = useMapStore((s) => s.powerLinesVisible);
  const labelsVisible = useMapStore((s) => s.labelsVisible);
  const productionTypes = useMapStore((s) => s.productionTypes);
  const largeUnitsOnly = useMapStore((s) => s.largeUnitsOnly);
  const { generation, index } = useCurrentSlot();

  const [styleReady, setStyleReady] = useState(false);
  // Particules lancées une fois la carte affichée : leur animation ne retarde pas le premier rendu
  const [mapLoaded, setMapLoaded] = useState(false);
  const [detail, setDetail] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; id: string } | null>(null);
  const [osmFeature, setOsmFeature] = useState<OsmFeature | null>(null);

  const visibleTypes = useMemo(
    () => ASSET_TYPE_ORDER.filter((type) => productionTypes[ASSET_TYPES[type].storeKey]),
    [productionTypes]
  );

  // Sites des filières affichées, éventuellement limités à ceux dotés d'un gros groupe
  const visiblePlants = useMemo(
    () => plants.filter((plant) => visibleTypes.includes(plant.type) && (!largeUnitsOnly || hasLargeUnit(plant))),
    [plants, visibleTypes, largeUnitsOnly]
  );

  const data = useMemo<PlantDatum[]>(
    () =>
      visiblePlants.map((plant) => {
        const snapshot = plantSnapshot(plant, generation, index);
        return {
          id: plant.id,
          name: plant.name,
          type: plant.type,
          position: [plant.longitude, plant.latitude],
          contour: plant.contour,
          capacity: plant.capacity_mw,
          output: snapshot.output,
          estimated: snapshot.estimated,
          running: snapshot.running,
          units: snapshot.units,
        };
      }),
    [visiblePlants, generation, index]
  );

  // ─── Calques MapLibre : noms, lignes électriques, installations OSM ────────

  useEffect(() => {
    const map = mapRef.current?.getMap();
    const source = styleReady ? map?.getSource<GeoJSONSource>(PLANTS_SOURCE_ID) : undefined;
    if (!source) return;
    const byCapacity = [...visiblePlants].sort((a, b) => b.capacity_mw - a.capacity_mw);
    source.setData({
      type: 'FeatureCollection',
      features: byCapacity.map((plant, rank) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [plant.longitude, plant.latitude] },
        properties: {
          name: plant.name,
          rank: plant.id === selectedPlantId ? -1 : rank,
          major: plant.id === selectedPlantId || plant.type === 'nuclear' || plant.capacity_mw >= MAJOR_PLANT_MW,
          dimmed: selectedPlantId !== null && plant.id !== selectedPlantId,
        },
      })),
    });
  }, [styleReady, visiblePlants, selectedPlantId]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!styleReady || !map) return;
    for (const id of PLANT_LABEL_LAYER_IDS) {
      map.setLayoutProperty(id, 'visibility', labelsVisible ? 'visible' : 'none');
    }
    for (const layer of POWER_LINE_LAYERS) {
      map.setLayoutProperty(layer.id, 'visibility', powerLinesVisible ? 'visible' : 'none');
    }
    const filter = osmSourceFilter(
      visibleTypes.flatMap((type) => ASSET_TYPES[type].osmSources),
      largeUnitsOnly ? LARGE_UNIT_MW : 0
    );
    for (const id of OSM_FILTERED_LAYER_IDS) map.setFilter(id, filter);
  }, [styleReady, labelsVisible, powerLinesVisible, visibleTypes, largeUnitsOnly]);

  // Cadre le site sélectionné avec son anneau de capacité et un peu de contexte
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
    const fill = (d: PlantDatum) => ASSET_TYPES[d.type].fill;
    const stroke = (d: PlantDatum) => ASSET_TYPES[d.type].stroke;
    const charging = (d: PlantDatum) => d.output !== null && d.output < 0;
    const discAlpha = (d: PlantDatum) =>
      charging(d) ? DISC_ALPHA.charging : d.estimated ? DISC_ALPHA.estimated : DISC_ALPHA.measured;

    const result = [];
    if (windVisible) result.push(...windRasterLayers(windLayers, FIRST_POWER_LINE_LAYER_ID));
    if (data.length === 0) return result;

    if (detail) {
      // Emprise des sites connus (nucléaire, hydraulique), colorée selon leur charge
      result.push(
        new PolygonLayer<PlantDatum, Interleaved>({
          id: 'plant-contours',
          beforeId: PLANT_LABELS_LAYER_ID,
          data: data.filter((d) => d.contour),
          getPolygon: (d) => d.contour!,
          getFillColor: (d): RGBA =>
            d.output === null
              ? [...FILL_NO_DATA, alpha(80, d.id)]
              : [...fill(d), alpha(60 + Math.round(140 * Math.min(1, Math.abs(d.output) / d.capacity)), d.id)],
          getLineColor: (d): RGBA => (highlighted(d.id) ? [26, 32, 44, 255] : [...stroke(d), alpha(255, d.id)]),
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
        radiusMinPixels: 1.5,
        filled: true,
        stroked: true,
        getFillColor: (d): RGBA => [...fill(d), alpha(discAlpha(d), d.id)],
        getLineColor: (d): RGBA => [...stroke(d), alpha(255, d.id)],
        getLineWidth: (d) => (charging(d) ? 2 : 1),
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
  }, [data, windVisible, windLayers, capacityRingVisible, normalizeRing, detail, selectedPlantId, hoveredPlantId]);

  const particleLayers = useMemo(
    () => (windVisible && mapLoaded ? windParticleLayers(windLayers) : []),
    [windVisible, mapLoaded, windLayers]
  );

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

  // Infobulle des installations OSM (survol ; toucher sur mobile)
  const onOsmPointer = useCallback((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) {
      setOsmFeature(null);
      return;
    }
    const props = feature.properties as Record<string, string | number | undefined>;
    const output = Number(props.output);
    setOsmFeature({
      x: event.point.x,
      y: event.point.y,
      name: (props.name as string) || null,
      source: (props.source as string) || null,
      outputMw: Number.isFinite(output) && output > 0 ? output : null,
      kind: feature.layer.id === 'osm-generators' ? 'generator' : 'plant',
    });
  }, []);

  const tooltipDatum = tooltip ? data.find((d) => d.id === tooltip.id) : undefined;
  const windAt = windLayers.find((l) => l.id === 'france') ?? windLayers[0];

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
        interactiveLayerIds={OSM_INTERACTIVE_LAYER_IDS}
        onMouseMove={onOsmPointer}
        onClick={onOsmPointer}
        onMouseLeave={() => setOsmFeature(null)}
        onStyleData={() => setStyleReady(true)}
        onLoad={() => setMapLoaded(true)}
        onMove={(e) => {
          const next = e.viewState.zoom >= DETAIL_MIN_ZOOM;
          setDetail((current) => (current === next ? current : next));
        }}
        onError={(e) => console.error('[carte]', e.error?.message ?? e.error)}
      >
        <FullscreenControl position="top-right" containerId="map-card" />
        <NavigationControl position="top-right" />
        <PanelControl>
          <DisplayPanel />
        </PanelControl>
        <PanelControl>
          <ProductionTypesPanel />
        </PanelControl>
        <AttributionControl
          position="bottom-right"
          compact={false}
          customAttribution={[
            '<a href="https://data.rte-france.com">RTE</a>',
            '<a href="https://bmrs.elexon.co.uk">BMRS © Elexon</a>',
            'ENTSO-E',
            'Météo-France AROME, ARPEGE',
            'NOAA GFS',
          ]}
        />
        <DeckGLOverlay layers={layers} onHover={onHover} onClick={onClick} />
        <DeckGLOverlay interleaved={false} layers={particleLayers} />
      </Map>

      {tooltip && tooltipDatum && (
        <div className={styles.tooltip} style={{ left: tooltip.x, top: tooltip.y }}>
          <div className={styles.tooltipTitle}>{tooltipDatum.name}</div>
          <div className={styles.tooltipType} style={{ color: ASSET_TYPES[tooltipDatum.type].badgeColor }}>
            {ASSET_TYPES[tooltipDatum.type].label}
          </div>
          <div className={styles.tooltipRow}>
            <span>
              {tooltipDatum.output !== null && tooltipDatum.output < 0
                ? chargingLabel(tooltipDatum.type)
                : tooltipDatum.estimated
                  ? 'Production estimée'
                  : 'Production'}
            </span>
            <span>
              {tooltipDatum.output !== null && tooltipDatum.output < 0
                ? formatMW(-tooltipDatum.output)
                : formatOutput(tooltipDatum.output, tooltipDatum.estimated)}{' '}
              MW
            </span>
          </div>
          <div className={styles.tooltipRow}>
            <span>Capacité</span>
            <span>{formatMW(tooltipDatum.capacity)} MW</span>
          </div>
          {tooltipDatum.output !== null && tooltipDatum.output >= 0 && (
            <div className={styles.tooltipRow}>
              <span>Facteur de charge</span>
              <span>{formatPercent(tooltipDatum.output / tooltipDatum.capacity)}</span>
            </div>
          )}
          {tooltipDatum.output !== null && tooltipDatum.units > 0 && (
            <div className={styles.tooltipRow}>
              <span>{tooltipDatum.type === 'nuclear' ? 'Réacteurs' : 'Groupes'} en marche</span>
              <span>
                {tooltipDatum.running} / {tooltipDatum.units}
              </span>
            </div>
          )}
        </div>
      )}

      {!tooltip && osmFeature && (
        <div className={styles.tooltip} style={{ left: osmFeature.x, top: osmFeature.y }}>
          <div className={styles.tooltipTitle}>
            {osmFeature.name ?? (osmFeature.kind === 'generator' ? 'Générateur' : 'Installation sans nom')}
          </div>
          <div className={styles.tooltipType}>{osmSourceLabel(osmFeature.source)}</div>
          {osmFeature.outputMw !== null && (
            <div className={styles.tooltipRow}>
              <span>Puissance</span>
              <span>{formatMW(osmFeature.outputMw)} MW</span>
            </div>
          )}
          <div className={styles.tooltipNote}>Données OpenStreetMap</div>
        </div>
      )}

      {windVisible && (
        <div className={styles.status}>
          {windStatus === 'loading' && '⟳ Chargement des vents…'}
          {windStatus === 'error' && '⚠ Données vent indisponibles'}
          {windStatus === 'ok' && windAt && (
            <>
              Vent à 10 m · {windLayers.map((l) => l.model).join(' et ')} · prévision pour {formatSlot(windAt.validTime)}
              {windAt.runTime !== null && <> · run du {formatShortDateTime(windAt.runTime)}</>}
              <div className={styles.scale}>
                <span>0</span>
                <span className={styles.scaleBar} style={{ background: WIND_GRADIENT }} />
                <span>{WIND_MAX} m/s</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
