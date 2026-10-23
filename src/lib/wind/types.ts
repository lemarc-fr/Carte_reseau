// Champ de vent à 10 m sur une grille régulière en latitude/longitude.

export interface Bounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

export interface WindField {
  width: number;
  height: number;
  // Composantes est (u) et nord (v) en m/s, ligne 0 = nord ; NaN = pas de donnée
  u: Float32Array;
  v: Float32Array;
  bounds: Bounds; // centres des pixels des bords
  runTime: Date | null; // run du modèle
  validTime: Date; // échéance
}
