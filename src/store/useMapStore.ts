import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { GenerationSeries, PlantInfo } from '@/types/energy';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductionType =
    | 'wind'
    | 'solar'
    | 'gas'
    | 'nuclear'
    | 'biomass'
    | 'battery'
    | 'hydro'
    | 'pumpedStorage';

export type ProductionTypesState = Record<ProductionType, boolean>;

export type WindStatus = 'loading' | 'ok' | 'error';
export type DataStatus = 'loading' | 'ok' | 'error';

export interface WindData {
    image: ImageData;
    imageUnscale: [number, number];
    speedMax: number;
    runTime: number | null; // run AROME (epoch ms)
    validTime: number | null; // échéance affichée (epoch ms)
}

// ─── État initial ─────────────────────────────────────────────────────────────

export const DEFAULT_PRODUCTION_TYPES_STATE: ProductionTypesState = {
    wind: true,
    solar: true,
    gas: true,
    nuclear: true,
    biomass: true,
    battery: true,
    hydro: true,
    pumpedStorage: true,
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
    setWindVisible: (visible: boolean) => void;

    windStatus: WindStatus;
    setWindStatus: (status: WindStatus) => void;

    windData: WindData | null;
    setWindData: (data: WindData) => void;

    // Affichage
    controlsOpen: boolean;
    toggleControls: () => void;
    setControlsOpen: (open: boolean) => void;

    capacityRingVisible: boolean;
    toggleCapacityRing: () => void;

    normalizeRing: boolean
    toggleNormalizeRing: () => void;
    setNormalizeRing: (value: boolean) => void;

    powerLinesVisible: boolean;
    togglePowerLines: () => void;

    labelsVisible: boolean;
    toggleLabels: () => void;

    // Types de production
    productionTypes: ProductionTypesState;
    toggleProductionType: (key: ProductionType) => void;
    setProductionType: (key: ProductionType, value: boolean) => void;
    resetProductionTypes: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useMapStore = create<MapState>()(
    devtools(
        (set) => ({
            // État initial
            plants: [],
            plantsStatus: 'loading',
            generation: null,
            generationStatus: 'loading',
            selectedTime: null,
            selectedPlantId: null,
            hoveredPlantId: null,
            windVisible: true,
            windStatus: 'loading',
            windData: null,
            controlsOpen: false,
            capacityRingVisible: true,
            normalizeRing: false,
            powerLinesVisible: true,
            labelsVisible: true,
            productionTypes: DEFAULT_PRODUCTION_TYPES_STATE,

            // Actions données
            setPlants: (plants) =>
                set({ plants, plantsStatus: 'ok' }, false, 'setPlants'),

            setPlantsStatus: (status) =>
                set({ plantsStatus: status }, false, 'setPlantsStatus'),

            setGeneration: (generation) =>
                set({ generation, generationStatus: 'ok' }, false, 'setGeneration'),

            setGenerationStatus: (status) =>
                set({ generationStatus: status }, false, 'setGenerationStatus'),

            // Pas de date future : useEnergyData chargerait sans fin une fenêtre qui ne la contient pas
            setSelectedTime: (time) =>
                set({ selectedTime: time === null ? null : Math.min(time, Date.now()) }, false, 'setSelectedTime'),

            selectPlant: (id) =>
                set({ selectedPlantId: id }, false, 'selectPlant'),

            setHoveredPlantId: (id) =>
                set({ hoveredPlantId: id }, false, 'setHoveredPlantId'),

            // Actions vent
            toggleWind: () =>
                set((state) => ({ windVisible: !state.windVisible }), false, 'toggleWind'),

            setWindVisible: (visible) =>
                set({ windVisible: visible }, false, 'setWindVisible'),

            setWindStatus: (status) =>
                set({ windStatus: status }, false, 'setWindStatus'),

            setWindData: (data) =>
                set({ windData: data, windStatus: 'ok' }, false, 'setWindData'),

            // Actions affichage
            toggleControls: () =>
                set((state) => ({ controlsOpen: !state.controlsOpen }), false, 'toggleControls'),

            setControlsOpen: (open) =>
                set({ controlsOpen: open }, false, 'setControlsOpen'),

            toggleCapacityRing: () =>
                set((state) => ({ capacityRingVisible: !state.capacityRingVisible }), false, 'toggleCapacityRing'),

            togglePowerLines: () =>
                set((state) => ({ powerLinesVisible: !state.powerLinesVisible }), false, 'togglePowerLines'),

            toggleLabels: () =>
                set((state) => ({ labelsVisible: !state.labelsVisible }), false, 'toggleLabels'),

            // Actions production
            toggleProductionType: (key) =>
                set(
                    (state) => ({
                        productionTypes: {
                            ...state.productionTypes,
                            [key]: !state.productionTypes[key],
                        },
                    }),
                    false,
                    `toggleProductionType/${key}`
                ),

            setProductionType: (key, value) =>
                set(
                    (state) => ({
                        productionTypes: { ...state.productionTypes, [key]: value },
                    }),
                    false,
                    `setProductionType/${key}`
                ),

            resetProductionTypes: () =>
                set(
                    { productionTypes: DEFAULT_PRODUCTION_TYPES_STATE },
                    false,
                    'resetProductionTypes'
                ),
            toggleNormalizeRing: () =>
                set(
                    (state) => ({
                        normalizeRing: !state.normalizeRing,
                    }),
                    false,
                    'toggleNormalizeRing'
                ),
            setNormalizeRing: (value) =>
                set(
                    { normalizeRing: value },
                    false,
                    'setNormalizeRing'
                ),
        }),
        { name: 'MapStore' } // nom affiché dans Redux DevTools
    )
);
