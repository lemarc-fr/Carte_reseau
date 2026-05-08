# Plan d'intégration des centrales électriques

## 1. Source de données — OpenInfraMap

Les tuiles vectorielles sont servies en `.pbf` à l'URL `https://openinframap.org/map/power/{z}/{x}/{y}.pbf`. La source-layer pertinente est `power_plant`. Chaque feature contient des propriétés comme `name`, `type` (solar, wind, gas…), `output:electricity` (puissance en MW), et un identifiant OSM unique (`id`).

---

## 2. Store Zustand — nouveaux états

- **`selectedPlant`** : objet `{ id, name, type, power, lngLat } | null` — centrale cliquée, alimente la popup.
- **`plantIds`** : `Record<string, string>` — mapping `osmId → type`, persisté pour les futures données de production en temps réel.

---

## 3. Chargement des tuiles dans MapLibre

Ajouter dans `mapStyle.ts` une source vectorielle `power-plants` pointant vers l'URL OpenInfraMap, puis une layer `circle` par type de production (wind, solar, gas…), chacune avec un filtre sur `type` et une couleur distincte.

---

## 4. Filtrage dynamique selon `productionTypes`

Dans `WindMap.tsx`, réagir au state `productionTypes` du store pour activer/désactiver programmatiquement la visibilité (`setLayoutProperty('layer-id', 'visibility', ...)`) de chaque layer via le ref de la carte.

---

## 5. Taille des cercles — `normalizeRing`

- **`normalizeRing = false`** : rayon proportionnel à `output:electricity` (scale linéaire, ex. 1 MW → 1 px, plafonné).
- **`normalizeRing = true`** : rayon identique pour toutes les centrales (taille fixe), utile pour voir la répartition sans biais de puissance.

Implémenter via `setPaintProperty` sur l'expression `circle-radius` selon le state du store.

---

## 6. Popup au clic — composant React

Au clic sur un cercle, pousser `selectedPlant` dans le store. Un composant `PlantPopup.tsx` positionné en absolu sur la carte lit ce state et affiche une bulle CSS (rectangle + triangle CSS `::after`) avec : nom, type, puissance max, identifiant OSM.

---

## 7. Préparation production temps réel

Stocker dans `plantIds` les identifiants OSM de toutes les centrales visibles (via `queryRenderedFeatures`). Ces IDs serviront plus tard à faire le lien avec une API de production en temps réel (ENTSO-E, ELEXON…).

---

## Ordre d'implémentation recommandé

1. Source + layers dans `mapStyle.ts`
2. Nouveaux états dans le store
3. Filtrage par `productionTypes`
4. Taille dynamique via `normalizeRing`
5. Popup `PlantPopup.tsx`
6. Collecte des `plantIds`