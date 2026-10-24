// Clé publique (envoyée au navigateur) : restreindre ses domaines autorisés sur protomaps.com
export const PROTOMAPS_API_KEY = "d0a95613fda80905";

export const MAP_MAX_ZOOM = 14;
// Zoom du détail : emprise des centrales et installations OpenStreetMap à la place des cercles
export const DETAIL_MIN_ZOOM = 10;

// Zones des couches de vent : GFS sur l'Europe, AROME HD sur la France et ses voisins
export const EUROPE_WIND_BOUNDS = { minLon: -25, maxLon: 45, minLat: 34, maxLat: 72 };
export const FRANCE_WIND_BOUNDS = { minLon: -10, maxLon: 15, minLat: 40, maxLat: 52 };

// Emprises [ouest, sud, est, nord]
// Vue initiale : France métropolitaine entière
export const FRANCE_BOUNDS: [number, number, number, number] = [-5.2, 42.2, 8.4, 51.2];

// Limite de navigation : l'Europe, avec de la marge
export const MAX_BOUNDS: [number, number, number, number] = [-35, 28, 55, 75];

// Particules blanches
export const PARTICLE_COLOR: [number, number, number, number] = [255, 255, 255, 220];

// Opacité du fond coloré (vitesse du vent) sous les particules
export const WIND_RASTER_OPACITY = 0.5;

// Palette du fond raster : vitesse du vent à 10 m (m/s) → couleur.
// Vents faibles en teintes claires (la carte reste lumineuse), vents forts saturés.
export const WIND_PALETTE: [number, [number, number, number]][] = [
  [0, [214, 232, 246]],
  [3, [168, 218, 238]],
  [6, [150, 222, 176]],
  [9, [196, 232, 122]],
  [12, [246, 226, 102]],
  [15, [250, 178, 82]],
  [20, [240, 102, 80]],
  [25, [214, 60, 120]],
  [30, [160, 60, 180]],
  [40, [100, 40, 140]],
];
