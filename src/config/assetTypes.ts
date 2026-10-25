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
  // Séries nationales "<pays>:<CODE>" additionnées pour le graphique et la barre du haut
  nationalSeries: string[];
  // Taux de charge "<pays>-<région>:<FILIÈRE>" (région « * » : pays entier) pour estimer
  // les sites sans groupe publié
  regionalSeries: string | null;
  // Production négative possible (stockage qui se recharge)
  storage: boolean;
  // Valeurs `source` d'OpenStreetMap (tuiles Open Infrastructure Map) de cette filière
  osmSources: string[];
}

// Ordre d'empilement des graphiques et d'affichage des filtres
export const ASSET_TYPE_ORDER: AssetType[] = [
  'nuclear',
  'hydro',
  'pumped_storage',
  'wind',
  'solar',
  'gas',
  'coal',
  'oil',
  'bioenergy',
  'battery',
];

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
    nationalSeries: ['NUCLEAR'],
    regionalSeries: 'NUCLEAR', // taux national ENTSO-E ; RTE publie chaque réacteur
    storage: false,
    osmSources: ['nuclear'],
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
    nationalSeries: ['HYDRO_RUN_OF_RIVER_AND_POUNDAGE', 'HYDRO_WATER_RESERVOIR', 'MARINE'],
    regionalSeries: 'HYDRO',
    storage: false,
    osmSources: ['hydro', 'tidal', 'wave'],
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
    nationalSeries: ['HYDRO_PUMPED_STORAGE'],
    regionalSeries: null, // une STEP pompe ou turbine selon le marché : pas d'estimation possible
    storage: true,
    osmSources: [], // non distinguées de l'hydraulique dans OpenStreetMap
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
    nationalSeries: ['WIND_ONSHORE', 'WIND_OFFSHORE'],
    regionalSeries: 'WIND',
    storage: false,
    osmSources: ['wind'],
  },
  solar: {
    label: 'Solaire',
    storeKey: 'solar',
    fill: [255, 165, 0],
    stroke: [204, 132, 0],
    chartFill: '#fed9a6',
    chartStroke: '#e9a964',
    badgeBackground: '#feebc8',
    badgeColor: '#7b341e',
    nationalSeries: ['SOLAR'],
    regionalSeries: 'SOLAR',
    storage: false,
    osmSources: ['solar'],
  },
  gas: {
    label: 'Gaz',
    storeKey: 'gas',
    fill: [255, 99, 71],
    stroke: [200, 60, 40],
    chartFill: '#fbb4ae',
    chartStroke: '#e8867d',
    badgeBackground: '#fed7d7',
    badgeColor: '#822727',
    nationalSeries: ['FOSSIL_GAS'],
    regionalSeries: 'THERMAL',
    storage: false,
    osmSources: ['gas'],
  },
  coal: {
    label: 'Charbon',
    storeKey: 'coal',
    fill: [90, 90, 90],
    stroke: [45, 45, 45],
    chartFill: '#cccccc',
    chartStroke: '#999999',
    badgeBackground: '#e2e8f0',
    badgeColor: '#1a202c',
    nationalSeries: ['FOSSIL_HARD_COAL', 'FOSSIL_BROWN_COAL_LIGNITE', 'FOSSIL_COAL_DERIVED_GAS', 'FOSSIL_PEAT'],
    regionalSeries: 'THERMAL',
    storage: false,
    osmSources: ['coal'],
  },
  oil: {
    label: 'Fioul',
    storeKey: 'oil',
    fill: [160, 82, 45],
    stroke: [110, 55, 30],
    chartFill: '#e5d8bd',
    chartStroke: '#bba67e',
    badgeBackground: '#f3e8d8',
    badgeColor: '#5f370e',
    nationalSeries: ['FOSSIL_OIL', 'FOSSIL_OIL_SHALE'],
    regionalSeries: 'THERMAL',
    storage: false,
    osmSources: ['oil', 'diesel'],
  },
  bioenergy: {
    label: 'Bioénergies',
    storeKey: 'biomass',
    fill: [34, 139, 34],
    stroke: [25, 100, 25],
    chartFill: '#ccebc5',
    chartStroke: '#93c98a',
    badgeBackground: '#c6f6d5',
    badgeColor: '#22543d',
    nationalSeries: ['BIOMASS', 'WASTE'],
    regionalSeries: 'BIOENERGY',
    storage: false,
    osmSources: ['biomass', 'biogas', 'biofuel', 'waste'],
  },
  battery: {
    label: 'Batteries',
    storeKey: 'battery',
    fill: [100, 200, 255],
    stroke: [50, 150, 200],
    chartFill: '#cfe8fb',
    chartStroke: '#7eb6dd',
    badgeBackground: '#bee3f8',
    badgeColor: '#2a4365',
    nationalSeries: ['BATTERY'],
    regionalSeries: 'BATTERY',
    storage: true,
    osmSources: ['battery'],
  },
};

// Filière des taux de charge régionaux, pour les explications d'estimation
export const REGIONAL_LABELS: Record<string, string> = {
  NUCLEAR: 'du nucléaire',
  WIND: "de l'éolien",
  HYDRO: "de l'hydraulique",
  SOLAR: 'du solaire',
  THERMAL: 'du thermique',
  BIOENERGY: 'des bioénergies',
  BATTERY: 'des batteries',
};

// Pays dont la production nationale est affichée (graphique, barre du haut)
export const DISPLAYED_COUNTRIES = ['FR'];

// Libellés des technologies (colonne plants.technology)
export const TECHNOLOGY_LABELS: Record<string, string> = {
  onshore: 'Éolien terrestre',
  offshore: 'Éolien en mer',
  Eclusée: 'Éclusée',
  CCGT: 'Cycle combiné',
  OCGT: 'Turbine à combustion',
  'Steam Turbine': 'Turbine à vapeur',
  'Combustion Engine': 'Moteur',
  Lignite: 'Lignite',
  Biogaz: 'Biogaz',
  Déchets: 'Déchets',
};

// Noms des pays (sites et sources hors de France)
export const COUNTRY_NAMES: Record<string, string> = {
  FR: 'France', AT: 'Autriche', BE: 'Belgique', BG: 'Bulgarie', CH: 'Suisse', CZ: 'Tchéquie',
  DE: 'Allemagne', DK: 'Danemark', EE: 'Estonie', ES: 'Espagne', FI: 'Finlande', GR: 'Grèce',
  HR: 'Croatie', HU: 'Hongrie', IE: 'Irlande', IT: 'Italie', LT: 'Lituanie', LU: 'Luxembourg',
  LV: 'Lettonie', NL: 'Pays-Bas', NO: 'Norvège', PL: 'Pologne', PT: 'Portugal', RO: 'Roumanie',
  RS: 'Serbie', SE: 'Suède', SI: 'Slovénie', SK: 'Slovaquie', GB: 'Royaume-Uni', UA: 'Ukraine',
  BA: 'Bosnie-Herzégovine', MK: 'Macédoine du Nord', AL: 'Albanie', ME: 'Monténégro', MD: 'Moldavie',
  XK: 'Kosovo',
};
