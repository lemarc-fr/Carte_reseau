// Contrat d'un pays et de ses sources de production, pour que l'ingestion
// (ingest.ts) reste indépendante des fournisseurs (RTE, éCO2mix, ENTSO-E...).

export interface Source {
  name: string;
  /** Télécharge et enregistre les jours [fromDay, toDay[ (au plus `maxDays` jours). Renvoie le nombre de lignes écrites. */
  ingest: (fromDay: string, toDay: string) => Promise<number>;
  /** Jours locaux déjà présents en base depuis `fromDay`. */
  daysWithData: (fromDay: string) => Promise<Set<string>>;
  /** Longueur maximale d'une fenêtre pour cette source, en jours. */
  maxDays: number;
  /**
   * Jours en arrière que la synchronisation récente vérifie (défaut : les 7 jours de
   * relevés horaires) ; davantage pour une source publiée avec retard.
   */
  lookbackDays?: number;
  /** Profondeur d'historique de la source en jours (défaut : illimitée) : le rattrapage ne remonte pas plus loin. */
  historyDays?: number;
}

export interface Country {
  code: string; // ISO 3166-1 alpha-2, préfixe des séries agrégées ("FR:NUCLEAR", "FR-84:WIND")
  name: string;
  timeZone: string; // fenêtres journalières des API
  sources: Source[];
  /** Identifiants nécessaires présents (clés d'API...) ; sinon le pays n'est pas synchronisé. */
  enabled: () => boolean;
}
