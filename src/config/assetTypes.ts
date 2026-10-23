import type { AssetType } from '@/types/energy';
import type { ProductionType } from '@/store/useMapStore';

type RGB = [number, number, number];

export interface AssetTypeStyle {
  label: string; // libellé (badge, légende)
  storeKey: ProductionType; // filtre « Filières » du store
  fill: RGB; // disque de production sur la carte (couleurs de la carte de référence)
  stroke: RGB;
  chartFill: string; // aire du graphique empilé
  chartStroke: string;
  badgeBackground: string;
  badgeColor: string;
  // Séries nationales RTE (aggregate_readings "FR:<TYPE>") additionnées pour le graphique
  nationalSeries: string[];
  // Taux de charge régional éCO2mix pour estimer les centrales sans groupe publié
  regionalSeries: 'WIND' | 'HYDRO' | null;
}

export const ASSET_TYPE_ORDER: AssetType[] = ['nuclear', 'hydro', 'pumped_storage', 'wind'];

export const ASSET_TYPES: Record<AssetType, AssetTypeStyle> = {
  nuclear: {
    label: 'Nucléaire',
    storeKey: 'nuclear',
    fill: [0, 255, 255],
    stroke: [0, 200, 200],
    chartFill: '#b9eef5',
    chartStroke: '#5fc9da',
    badgeBackground: '#c4f1f9',
    badgeColor: '#086f83',
    nationalSeries: ['FR:NUCLEAR'],
    regionalSeries: null,
  },
  hydro: {
    label: 'Hydraulique',
    storeKey: 'hydro',
    fill: [64, 224, 208],
    stroke: [32, 178, 170],
    chartFill: '#b3cde3',
    chartStroke: '#7ea6c8',
    badgeBackground: '#b2f5ea',
    badgeColor: '#234e52',
    nationalSeries: ['FR:HYDRO_RUN_OF_RIVER_AND_POUNDAGE', 'FR:HYDRO_WATER_RESERVOIR'],
    regionalSeries: 'HYDRO',
  },
  pumped_storage: {
    label: 'STEP',
    storeKey: 'pumpedStorage',
    fill: [138, 43, 226],
    stroke: [106, 27, 181],
    chartFill: '#decbe4',
    chartStroke: '#b496bd',
    badgeBackground: '#e9d8fd',
    badgeColor: '#44337a',
    nationalSeries: ['FR:HYDRO_PUMPED_STORAGE'],
    regionalSeries: null, // une STEP pompe ou turbine selon le marché : pas d'estimation possible
  },
  wind: {
    label: 'Éolien',
    storeKey: 'wind',
    fill: [252, 186, 3],
    stroke: [191, 141, 0],
    chartFill: '#ffe9a8',
    chartStroke: '#e3c45f',
    badgeBackground: '#fefcbf',
    badgeColor: '#744210',
    nationalSeries: ['FR:WIND_ONSHORE', 'FR:WIND_OFFSHORE'],
    regionalSeries: 'WIND',
  },
};

// Libellés des technologies (colonne plants.technology)
export const TECHNOLOGY_LABELS: Record<string, string> = {
  onshore: 'Éolien terrestre',
  offshore: 'Éolien en mer',
  Lac: 'Lac',
  "Fil de l'eau": "Fil de l'eau",
  Eclusée: 'Éclusée',
  'Pompage-turbinage': 'Pompage-turbinage',
};

// Groupes RTE dont la valeur négative est un vrai pompage (et non la consommation
// des auxiliaires d'un groupe à l'arrêt, ramenée à 0)
export const SIGNED_UNIT_TYPES = new Set(['HYDRO_PUMPED_STORAGE']);
