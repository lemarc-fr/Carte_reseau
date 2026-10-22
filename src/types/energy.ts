// Contrats JSON partagés entre les routes API et le client (pas d'import Prisma ici :
// ce fichier est aussi embarqué dans le bundle navigateur).

export type AssetType = 'nuclear';

export interface ReactorInfo {
  eic_code: string;
  name: string;
  capacity_mw: number | null;
  commissioning_date: string | null; // YYYY-MM-DD
}

export interface PlantInfo {
  id: string;
  name: string;
  full_name: string;
  type: AssetType;
  operator: string | null;
  latitude: number;
  longitude: number;
  capacity_mw: number;
  commissioning_date: string | null; // YYYY-MM-DD
  commune: string | null;
  departement: string | null;
  region: string | null;
  wikidata_id: string | null;
  osm_id: string | null;
  contour: [number, number][] | null;
  reactors: ReactorInfo[];
}

export type ReadingGranularity = 'HOUR' | 'DAY';

/**
 * Production par réacteur sur une fenêtre, en matrice alignée sur `times` :
 * series[eic][i] = puissance moyenne (MW) du créneau commençant à times[i],
 * ou null si RTE n'a rien publié pour ce réacteur à ce créneau.
 */
export interface GenerationSeries {
  from: number; // epoch ms
  to: number; // epoch ms
  times: number[]; // début de chaque créneau, epoch ms, croissant
  granularity: ReadingGranularity[]; // 1 h (HOUR) ou 24 h (DAY, données > 7 jours)
  series: Record<string, (number | null)[]>;
  earliest: number | null; // plus ancien relevé (toute la base, cf. BACK_FILL_START)
  latest: number | null; // dernier créneau horaire disponible (toute la base)
  updatedAt: number | null; // dernière publication RTE (toute la base)
}
