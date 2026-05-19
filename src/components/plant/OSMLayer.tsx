import { useEffect, useMemo, useState } from 'react';
import { Layer, Source } from 'react-map-gl/maplibre';
import type { FeatureCollection, Point } from 'geojson';
import { useMapStore } from '@/store/useMapStore';

const PLANT_LAYERS = [
    { id: 'wind', color: '#60DFCD', source: 'wind' },
    { id: 'solar', color: '#FFD166', source: 'solar' },
    { id: 'gas', color: '#FF6B6B', source: 'gas' },
    { id: 'hydro', color: '#4FC3F7', source: 'hydro' },
] as const;

type NuclPlant = {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    power_mw: number;
};

type NuclFeatureProperties = {
    id: string;
    name: string;
    power_mw: number;
};

const EMPTY_NUCL_FEATURE_COLLECTION: FeatureCollection<Point, NuclFeatureProperties> = {
    type: 'FeatureCollection',
    features: [],
};
const POWER_MW_TO_RADIUS_SCALE = 0.002;
const BASE_NUCLEAR_CIRCLE_RADIUS = 5;
const NORMALIZED_NUCLEAR_CIRCLE_RADIUS = 8;

export default function OSMLayer() {
    const nuclearVisible = useMapStore((s) => s.productionTypes.nuclear);
    const normalizeRing = useMapStore((s) => s.normalizeRing);
    const [nuclearPlants, setNuclearPlants] =
        useState<FeatureCollection<Point, NuclFeatureProperties>>(EMPTY_NUCL_FEATURE_COLLECTION);

    useEffect(() => {
        let cancelled = false;

        async function loadNuclearPlants() {
            const candidateUrls = ['/dataset/NUCL.json', '/publi/dataset/NUCL.json'];
            let plants: NuclPlant[] | null = null;

            for (const url of candidateUrls) {
                try {
                    const response = await fetch(url);
                    if (!response.ok) continue;

                    const data = await response.json();
                    if (Array.isArray(data)) {
                        plants = data as NuclPlant[];
                        break;
                    }
                } catch {
                    // ignore and try the next URL
                }
            }

            if (cancelled || !plants) {
                if (!cancelled) setNuclearPlants(EMPTY_NUCL_FEATURE_COLLECTION);
                return;
            }

            const features = plants
                .filter(
                    (plant) =>
                        Number.isFinite(plant.latitude) &&
                        Number.isFinite(plant.longitude) &&
                        Number.isFinite(plant.power_mw) &&
                        plant.power_mw > 0
                )
                .map((plant) => ({
                    type: 'Feature' as const,
                    geometry: {
                        type: 'Point' as const,
                        coordinates: [plant.longitude, plant.latitude] as [number, number],
                    },
                    properties: {
                        id: plant.id,
                        name: plant.name,
                        power_mw: plant.power_mw,
                    },
                }));

            if (!cancelled) {
                setNuclearPlants({
                    type: 'FeatureCollection',
                    features,
                });
            }
        }

        void loadNuclearPlants();
        return () => {
            cancelled = true;
        };
    }, []);

    const nuclearCircleRadius = useMemo(
        () =>
            normalizeRing
                ? NORMALIZED_NUCLEAR_CIRCLE_RADIUS
                : ['+', BASE_NUCLEAR_CIRCLE_RADIUS, ['*', POWER_MW_TO_RADIUS_SCALE, ['coalesce', ['get', 'power_mw'], 0]]] as const,
        [normalizeRing]
    );

    return (
        <>
            <Source
                id="power-plants"
                type="vector"
                tiles={['https://openinframap.org/map/power/{z}/{x}/{y}.pbf']}
                minzoom={5}
                maxzoom={5}
            >
                {/* Layer debug — à retirer une fois validé */}
                <Layer
                    id="power-plant-debug"
                    type="circle"
                    source-layer="power_plant_point"
                    minzoom={0}
                    paint={{
                        'circle-color': '#ff0000',
                        'circle-radius': 6,
                        'circle-opacity': 1,
                    }}
                />

                {PLANT_LAYERS.map(({ id, color, source }) => (
                    <Layer
                        key={id}
                        id={`power-plant-${id}`}
                        type="circle"
                        source-layer="power_plant"
                        minzoom={0}
                        filter={['==', ['get', 'source'], source]}
                        paint={{
                            'circle-color': color,
                            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2, 8, 4, 12, 7],
                            'circle-stroke-color': '#ffffff',
                            'circle-stroke-width': 0.8,
                            'circle-opacity': 0.85,
                        }}
                    />
                ))}
            </Source>
            <Source id="nuclear-plants" type="geojson" data={nuclearPlants}>
                <Layer
                    id="nuclear-plants-layer"
                    type="circle"
                    layout={{ visibility: nuclearVisible ? 'visible' : 'none' }}
                    paint={{
                        'circle-color': '#808080',
                        'circle-opacity': 0.5,
                        'circle-stroke-color': '#444444',
                        'circle-stroke-width': 1.2,
                        'circle-radius': nuclearCircleRadius,
                    }}
                />
            </Source>
        </>
    );
}
