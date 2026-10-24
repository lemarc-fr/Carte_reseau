import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { GenerationSeries, PlantInfo } from '@/types/energy';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductionType =
    | 'nuclear'
    | 'hydro'
    | 'pumpedStorage'
    | 'wind'
    | 'solar'
    | 'gas'
    | 'coal'
    | 'oil'
    | 'biomass'
    | 'battery';

export type ProductionTypesState = Record<ProductionType, boolean>;

export type DataStatus = 'loading' | 'ok' | 'error';

export interface WindLayerData {
    id: string; // "europe" (GFS) ou "france" (AROME HD)
    model: string;
    bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number };
    imageUnscale: [number, number];
    runTime: number | null; // run du modèle (epoch ms)
    validTime: number; // échéance affichée (epoch ms)
    image: ImageData;
}

// ─── État initial ─────────────────────────────────────────────────────────────

const ALL_PRODUCTION_TYPES: ProductionTypesState = {
    nuclear: true,
    hydro: true,
    pumpedStorage: true,
    wind: true,
    solar: true,
    gas: true,
    coal: true,
    oil: true,
    biomass: true,
    battery: true,
};

// ─── Interface du store ───────────────────────────────────────────────────────

interface MapState {
    // Données
    plants: PlantInfo[];
    plantsStatus: DataStatus;
    setPlants: (plants: PlantInfo[]) => void;
    setPlantsStatus: (status: DataStatus) => void;

    generation: GenerationSeries | null;
    generationStatus: DataStatus;
    setGeneration: (generation: GenerationSeries) => void;
    setGenerationStatus: (status: DataStatus) => void;

    // Instant affiché (epoch ms) ; null = temps réel (dernier créneau publié)
    selectedTime: number | null;
    setSelectedTime: (time: number | null) => void;

    // Centrale sélectionnée (vue détaillée) et survolée (carte / tableau)
    selectedPlantId: string | null;
    selectPlant: (id: string | null) => void;
    hoveredPlantId: string | null;
    setHoveredPlantId: (id: string | null) => void;

    // Vent
    windVisible: boolean;
    toggleWind: () => void;
    windStatus: DataStatus;
    setWindStatus: (status: DataStatus) => void;
    windLayers: WindLayerData[];
    setWindLayers: (layers: WindLayerData[]) => void;

    // Affichage
    capacityRingVisible: boolean;
    toggleCapacityRing: () => void;

    normalizeRing: boolean;
    toggleNormalizeRing: () => void;

    powerLinesVisible: boolean;
    togglePowerLines: () => void;

    labelsVisible: boolean;
    toggleLabels: () => void;

    // Uniquement les sites dotés d'un groupe d'au moins LARGE_UNIT_MW
    largeUnitsOnly: boolean;
    toggleLargeUnitsOnly: () => void;

    // Filières affichées
    productionTypes: ProductionTypesState;
    toggleProductionType: (key: ProductionType) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useMapStore = create<MapState>()(
    devtools(
        (set) => ({
            plants: [],
            plantsStatus: 'loading',
            generation: null,
            generationStatus: 'loading',
            selectedTime: null,
            selectedPlantId: null,
            hoveredPlantId: null,
            windVisible: true,
            windStatus: 'loading',
            windLayers: [],
            capacityRingVisible: true,
            normalizeRing: false,
            powerLinesVisible: true,
            labelsVisible: true,
            largeUnitsOnly: false,
            productionTypes: ALL_PRODUCTION_TYPES,

            setPlants: (plants) => set({ plants, plantsStatus: 'ok' }, false, 'setPlants'),
            setPlantsStatus: (status) => set({ plantsStatus: status }, false, 'setPlantsStatus'),
            setGeneration: (generation) => set({ generation, generationStatus: 'ok' }, false, 'setGeneration'),
            setGenerationStatus: (status) => set({ generationStatus: status }, false, 'setGenerationStatus'),

            // Pas de date future : useEnergyData chargerait sans fin une fenêtre qui ne la contient pas
            setSelectedTime: (time) =>
                set({ selectedTime: time === null ? null : Math.min(time, Date.now()) }, false, 'setSelectedTime'),

            selectPlant: (id) => set({ selectedPlantId: id }, false, 'selectPlant'),
            setHoveredPlantId: (id) => set({ hoveredPlantId: id }, false, 'setHoveredPlantId'),

            toggleWind: () => set((s) => ({ windVisible: !s.windVisible }), false, 'toggleWind'),
            setWindStatus: (status) => set({ windStatus: status }, false, 'setWindStatus'),
            setWindLayers: (layers) => set({ windLayers: layers, windStatus: 'ok' }, false, 'setWindLayers'),

            toggleCapacityRing: () =>
                set((s) => ({ capacityRingVisible: !s.capacityRingVisible }), false, 'toggleCapacityRing'),
            toggleNormalizeRing: () => set((s) => ({ normalizeRing: !s.normalizeRing }), false, 'toggleNormalizeRing'),
            togglePowerLines: () => set((s) => ({ powerLinesVisible: !s.powerLinesVisible }), false, 'togglePowerLines'),
            toggleLabels: () => set((s) => ({ labelsVisible: !s.labelsVisible }), false, 'toggleLabels'),
            toggleLargeUnitsOnly: () =>
                set((s) => ({ largeUnitsOnly: !s.largeUnitsOnly }), false, 'toggleLargeUnitsOnly'),

            toggleProductionType: (key) =>
                set(
                    (s) => ({ productionTypes: { ...s.productionTypes, [key]: !s.productionTypes[key] } }),
                    false,
                    `toggleProductionType/${key}`
                ),
        }),
        { name: 'MapStore' } // nom affiché dans Redux DevTools
    )
);
