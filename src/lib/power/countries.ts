import type { Country } from './types';
import { france } from './fr';

// Pays synchronisés. Pour en ajouter un : un dossier comme ./fr (sources de production
// au format Source, jeux de données dans dataset/<pays>/final/), puis l'enregistrer ici.
// Piste pour le reste de l'Europe : l'API ENTSO-E Transparency (production par groupe
// > 100 MW et par filière, jeton gratuit sur demande).
export const COUNTRIES: Country[] = [france];
