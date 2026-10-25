// Filières ENTSO-E (psrType) -> types de production, mêmes noms que ceux de RTE
// (« FR:NUCLEAR », groupes « FOSSIL_GAS »…), et familles des taux de charge.

export const PSR_TYPES: Record<string, string> = {
  B01: 'BIOMASS',
  B02: 'FOSSIL_BROWN_COAL_LIGNITE',
  B03: 'FOSSIL_COAL_DERIVED_GAS',
  B04: 'FOSSIL_GAS',
  B05: 'FOSSIL_HARD_COAL',
  B06: 'FOSSIL_OIL',
  B07: 'FOSSIL_OIL_SHALE',
  B08: 'FOSSIL_PEAT',
  B09: 'GEOTHERMAL',
  B10: 'HYDRO_PUMPED_STORAGE',
  B11: 'HYDRO_RUN_OF_RIVER_AND_POUNDAGE',
  B12: 'HYDRO_WATER_RESERVOIR',
  B13: 'MARINE',
  B14: 'NUCLEAR',
  B15: 'OTHER_RENEWABLE',
  B16: 'SOLAR',
  B17: 'WASTE',
  B18: 'WIND_OFFSHORE',
  B19: 'WIND_ONSHORE',
  B20: 'OTHER',
  B25: 'BATTERY', // « Energy storage »
};

// Famille de taux de charge ("<pays>-*:<FILIÈRE>", cf. assetTypes.regionalSeries)
// -> types de production qui la composent
export const LOAD_FACTOR_KINDS: Record<string, string[]> = {
  NUCLEAR: ['NUCLEAR'],
  WIND: ['WIND_ONSHORE', 'WIND_OFFSHORE'],
  SOLAR: ['SOLAR'],
  HYDRO: ['HYDRO_RUN_OF_RIVER_AND_POUNDAGE', 'HYDRO_WATER_RESERVOIR', 'MARINE'],
  THERMAL: [
    'FOSSIL_GAS',
    'FOSSIL_HARD_COAL',
    'FOSSIL_BROWN_COAL_LIGNITE',
    'FOSSIL_COAL_DERIVED_GAS',
    'FOSSIL_OIL',
    'FOSSIL_OIL_SHALE',
    'FOSSIL_PEAT',
  ],
  BIOENERGY: ['BIOMASS', 'WASTE'],
  BATTERY: ['BATTERY'],
};

// Stockage : production nette = production - consommation (pompage, recharge)
export const STORAGE_TYPES = new Set(['HYDRO_PUMPED_STORAGE', 'BATTERY']);
