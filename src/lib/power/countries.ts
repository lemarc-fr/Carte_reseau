import type { Country } from './types';
import { france } from './fr';
import { ENTSOE_COUNTRIES } from './entsoe/countries';

// Pays synchronisés : la France par RTE et éCO2mix (./fr), le reste de l'Europe par
// ENTSO-E (./entsoe, jeton ENTSOE_API_KEY, sélection ENTSOE_COUNTRIES). Pour un autre
// fournisseur : un objet Country (types.ts) et ses jeux dans dataset/<pays>/final/.
export const COUNTRIES: Country[] = [france, ...ENTSOE_COUNTRIES];
