import {Layer, Source } from "react-map-gl/maplibre";

const PLANT_LAYERS = [
    { id: 'wind',    color: '#60DFCD', source: 'wind'    },
    { id: 'solar',   color: '#FFD166', source: 'solar'   },
    { id: 'gas',     color: '#FF6B6B', source: 'gas'     },
    { id: 'nuclear', color: '#A78BFA', source: 'nuclear' },
    { id: 'hydro',   color: '#4FC3F7', source: 'hydro'   },
] as const;

export default function OSMLayer() {
    return (
        <Source
            id="power-plants"
            type="vector"
            tiles={['https://openinframap.org/map/power/5}{/{x}/{y}.pbf']}
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
    );
}