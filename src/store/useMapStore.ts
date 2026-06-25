import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

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

export interface WindData {
    image: ImageData;
    imageUnscale: [number, number];
    speedMax: number;
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
    // Vent
    windVisible: boolean;
    toggleWind: () => void;
    setWindVisible: (visible: boolean) => void;

    windStatus: WindStatus;
    setWindStatus: (status: WindStatus) => void;

    windData: WindData | null;
    setWindData: (data: WindData) => void;

    // Affichage
    normalizeRing: boolean
    toggleNormalizeRing: () => void;
    setNormalizeRing: (value: boolean) => void;

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
            windVisible: true,
            windStatus: 'loading',
            windData: null,
            normalizeRing: false,
            productionTypes: DEFAULT_PRODUCTION_TYPES_STATE,

            // Actions vent
            toggleWind: () =>
                set((state) => ({ windVisible: !state.windVisible }), false, 'toggleWind'),

            setWindVisible: (visible) =>
                set({ windVisible: visible }, false, 'setWindVisible'),

            setWindStatus: (status) =>
                set({ windStatus: status }, false, 'setWindStatus'),

            setWindData: (data) =>
                set({ windData: data, windStatus: 'ok' }, false, 'setWindData'),

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