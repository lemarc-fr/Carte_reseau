// Frontières électriques de la France dont éCO2mix publie les échanges commerciaux
// ("FR~<id>:COMM", MW, positif = import en France). Arcs tracés d'un point côté France à
// un point côté voisin ; prix "<pays>:PRICE" du voisin pour comparer avec la France.

export interface Interconnection {
  id: string; // frontière dans la série, ex. "GB", "DE_BE"
  label: string; // nom affiché du voisin
  france: [number, number]; // extrémité côté France (lon, lat)
  neighbour: [number, number]; // extrémité côté voisin
  priceCountries: string[]; // séries de prix du voisin (moyenne si plusieurs)
}

export const INTERCONNECTIONS: Interconnection[] = [
  { id: 'GB', label: 'Grande-Bretagne', france: [1.9, 50.5], neighbour: [-0.6, 52.0], priceCountries: [] },
  { id: 'DE_BE', label: 'Allemagne et Belgique', france: [5.2, 49.4], neighbour: [7.2, 50.6], priceCountries: ['DE', 'BE'] },
  { id: 'CH', label: 'Suisse', france: [6.3, 46.9], neighbour: [8.0, 46.9], priceCountries: ['CH'] },
  { id: 'IT', label: 'Italie', france: [6.6, 45.2], neighbour: [8.6, 44.9], priceCountries: ['IT'] },
  { id: 'ES', label: 'Espagne', france: [0.5, 43.1], neighbour: [-1.4, 41.6], priceCountries: ['ES'] },
];

export const exchangeSeries = (link: Interconnection) => `FR~${link.id}:COMM`;
