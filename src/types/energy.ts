// Contrats JSON partagés entre les routes API et le client (pas d'import Prisma ici :
// ce fichier est aussi embarqué dans le bundle navigateur).

// Mêmes catégories que la carte de référence ; production_type en base -> type affiché
export type AssetType = 'nuclear' | 'hydro' | 'pumped_storage' | 'wind';

export interface UnitInfo {
  eic_code: string;
  name: string;
  production_type: string; // type RTE, ex. NUCLEAR, HYDRO_PUMPED_STORAGE, WIND_OFFSHORE
  capacity_mw: number | null;
  commissioning_date: string | null; // YYYY-MM-DD
}

export interface PlantInfo {
  id: string;
  name: string;
  full_name: string;
  type: AssetType;
  technology: string | null; // ex. "Lac", "Fil de l'eau", "onshore", "offshore"
  operator: string | null;
  latitude: number;
  longitude: number;
  capacity_mw: number;
  commissioning_date: string | null; // YYYY-MM-DD
  commune: string | null;
  departement: string | null;
  region: string | null;
  region_code: string | null;
  installations: number | null; // installations du registre ODRE regroupées (éolien)
  wikidata_id: string | null;
  osm_id: string | null;
  contour: [number, number][] | null;
  units: UnitInfo[]; // groupes publiés par RTE (vide : production estimée)
}

export type ReadingGranularity = 'HOUR' | 'DAY';

/**
 * Production sur une fenêtre, en matrices alignées sur `times` :
 * series[eic][i]      puissance moyenne (MW) du groupe sur le créneau commençant à times[i]
 * aggregates[clé][i]  série agrégée : "FR:<TYPE>" (MW, production nationale par filière)
 *                     ou "REGION:<code>:<WIND|HYDRO>" (taux de charge régional, 0-1)
 * null : rien de publié pour ce créneau.
 */
export interface GenerationSeries {
  from: number; // epoch ms
  to: number; // epoch ms
  times: number[]; // début de chaque créneau, epoch ms, croissant
  granularity: ReadingGranularity[]; // 1 h (HOUR) ou 24 h (DAY, données > 7 jours)
  series: Record<string, (number | null)[]>;
  aggregates: Record<string, (number | null)[]>;
  earliest: number | null; // plus ancien relevé (toute la base, cf. BACK_FILL_START)
  latest: number | null; // dernier créneau horaire disponible (toute la base)
  updatedAt: number | null; // dernière publication RTE (toute la base)
}
