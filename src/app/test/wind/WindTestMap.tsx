'use client';

import { useEffect, useMemo, useState } from 'react';
import { Map, useControl, type MapRef } from 'react-map-gl/maplibre';
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox';
import { EUROPE_WIND_BOUNDS } from '@/config/mapConfig';
import { FIRST_POWER_LINE_LAYER_ID, mapStyle } from '@/config/mapStyle';
import { useWindData } from '@/hooks/useWindData';
import { windRasterLayers } from '@/components/map/windLayers';
import { useMapStore } from '@/store/useMapStore';

declare global {
  interface Window {
    // Lu par le test d'intégration : couches de vent chargées et carte dessinée
    __windTest?: {
      ready: boolean;
      layers: { id: string; model: string; validTime: number }[];
      box?: [number, number, number, number]; // emprise du vent à l'écran (px) : x0, y0, x1, y1
      error?: string;
    };
  }
}

function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({ interleaved: true, ...props }));
  overlay.setProps(props);
  return null;
}

const { minLon, minLat, maxLon, maxLat } = EUROPE_WIND_BOUNDS;

// ?vent=0 : même carte sans vent, référence du test de capture
const showWind = () => new URLSearchParams(window.location.search).get('vent') !== '0';

export default function WindTestMap() {
  useWindData();
  const windLayers = useMapStore((s) => s.windLayers);
  const windStatus = useMapStore((s) => s.windStatus);
  const [box, setBox] = useState<[number, number, number, number] | null>(null);
  const [wind] = useState(showWind);
  const layers = useMemo(
    () => (wind ? windRasterLayers(windLayers, FIRST_POWER_LINE_LAYER_ID) : []),
    [wind, windLayers]
  );

  useEffect(() => {
    window.__windTest = {
      ready: box !== null && windLayers.length > 0,
      layers: windLayers.map(({ id, model, validTime }) => ({ id, model, validTime })),
      box: box ?? undefined,
      error: windStatus === 'error' ? 'vent indisponible' : undefined,
    };
  }, [box, windLayers, windStatus]);

  // Carte dessinée avec les couches de vent : emprise à l'écran, prête pour la capture
  const onIdle = (map: MapRef) => {
    const europe = windLayers.find((l) => l.id === 'europe');
    if (!europe) return;
    const nw = map.project([europe.bounds.minLon, europe.bounds.maxLat]);
    const se = map.project([europe.bounds.maxLon, europe.bounds.minLat]);
    setBox([Math.round(nw.x), Math.round(nw.y), Math.round(se.x), Math.round(se.y)]);
  };

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Map
        initialViewState={{ bounds: [minLon, minLat, maxLon, maxLat], fitBoundsOptions: { padding: 10 } }}
        mapStyle={mapStyle}
        attributionControl={false}
        interactive={false}
        onIdle={(e) => onIdle(e.target as unknown as MapRef)}
      >
        <DeckGLOverlay layers={layers} />
      </Map>
      <div
        style={{
          position: 'absolute',
          left: 10,
          bottom: 10,
          padding: '4px 10px',
          borderRadius: 4,
          background: 'rgba(26, 32, 44, 0.75)',
          color: '#fff',
          font: '12px system-ui, sans-serif',
        }}
      >
        {windStatus === 'loading' && 'Chargement du vent…'}
        {windStatus === 'error' && 'Vent indisponible'}
        {windLayers.map((l) => (
          <div key={l.id}>
            {l.id} : {l.model}, échéance {new Date(l.validTime).toISOString().slice(0, 16).replace('T', ' ')} UTC
          </div>
        ))}
      </div>
    </div>
  );
}
