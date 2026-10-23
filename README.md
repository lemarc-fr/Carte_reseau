# Carte Réseau

Application Next.js pour visualiser des actifs de production électrique en France, avec enrichissement multi-sources.

Interface inspirée de la [GB Renewables Map](https://renewables-map.robinhawkes.com/) de Robin Hawkes :
carte des centrales (anneau = capacité, disque = production), graphique de production sur 7 jours,
choix de l'instant affiché, liste triable et fiche détaillée par centrale.

| Filière | Sites | Production affichée |
|---|---|---|
| Nucléaire | 18 centrales, 57 réacteurs | par réacteur (RTE) |
| Hydraulique et STEP | 153 centrales | par groupe pour 16 grandes centrales (RTE), estimée pour les autres |
| Éolien | 1 447 sites (parcs regroupés par commune, 5 parcs en mer) | par groupe pour les parcs en mer (RTE), estimée pour les autres |

Estimation = puissance installée × taux de charge régional de la filière (éCO2mix). Le graphique et la
barre du haut utilisent la production nationale par filière publiée par RTE.

## Lancer le projet

Copier `.env.example` en `.env` et le remplir : base PostgreSQL, identifiants RTE, clé Météo-France
et **`BACK_FILL_START`**, la date (YYYY-MM-DD) depuis laquelle l'historique de production est conservé.

```bash
npm ci
npm run db:migrate   # applique src/prisma/migrations
npm run db:seed      # centrales et parcs depuis dataset/Finie/ (NUCLEAR, HYDRO, WIND .json)
npm run dev
```

Au démarrage, le serveur récupère les derniers jours puis complète l'historique depuis
`BACK_FILL_START` (appels RTE de 7 jours, une seconde d'écart) ; il interroge ensuite RTE toutes les
15 minutes (`src/lib/power/ingest.ts`, lancé par `src/instrumentation.ts`). Les relevés horaires de
plus de 7 jours sont agrégés en moyennes journalières. `npm run backfill` relance le rattrapage à la
main, `npm run backfill -- 30` retélécharge les 30 derniers jours.

Le vent (AROME 10 m, Météo-France) est rechargé toutes les heures ; la carte indique le run et
l'échéance affichés.

Jeux de données : `dataset/Finie/WIND.json` est produit par `dataset/rafactor data/eolien.py` (registre
ODRE, communes géocodées par geo.api.gouv.fr, parcs en mer positionnés dans `patches_wind.json`). Les
groupes hydrauliques RTE sont rattachés à leur centrale par leur nom (`src/lib/power/unitPlants.ts`).

### API

- `GET /api/plants` : centrales, réacteurs, position et emprise du site
- `GET /api/generation?from=ISO&to=ISO` : production horaire par groupe, production nationale par filière
  et taux de charge régionaux (7 jours par défaut, 31 max)
- `GET /api/units` : groupes publiés par RTE

### Déploiement (Raspberry Pi)

- `systemd/carte_reseau.service` : service Next.js sur 127.0.0.1:3000 (lit `.env`), installé par lien
  symbolique dans /etc/systemd/system
- `systemd/nginx.conf.part` : bloc `server` en 443 ssl, inclus avec ceux des autres sites par
  `include /home/Marc/Web/*/systemd/nginx.conf.part;` (certificats déclarés globalement)
- `.github/workflows/deploy.yml` : à chaque push sur `master`, SSH sur le Pi puis `git pull`, `npm ci`,
  `npm run db:migrate`, `npm run db:seed`, `npm run build` et redémarrage du service

## Sources de données disponibles

### 1) Dataset ODRE (registre national)
- Fichier: `dataset/rafactor data/registre-national-installation-production-stockage-electricite-agrege.json`
- Contenu: `FeatureCollection` avec un grand nombre de champs métier (filière, puissance, commune, gestionnaire, etc.)
- Limite principale: `geometry` est souvent `null`

### 2) Dataset enrichi OpenInfraMap / OSM / Wikidata
- Fichier: `dataset/rafactor data/france_power_plants_enriched_3.json` (découpé par filière dans
  `ordre_per_filiere/`, résultat final du nucléaire : `dataset/Finie/NUCLEAR.json`)
- Contenu: noms d’installations, `wikidata_id`, tags OSM, coordonnées Wikidata, détails OSM
- Utilité: source de géométrie + normalisation d’identifiants externes

---

## Stratégie: exposer uniquement les bonnes données

Objectif: publier un jeu de données **minimal, stable, et exploitable par la carte**.

### Contrat cible (champs exposés)
Exposer uniquement:
- `id` (identifiant interne stable)
- `name` (nom affiché)
- `assetType` (catégorie normalisée: wind, solar, nuclear, hydro, gas, coal, oil, biomass, storage, other)
- `fuelTypes` (liste normalisée)
- `capacityMw` (nombre, en MW)
- `status` (`operating`, `construction`, `disused`, `unknown`)
- `commissioningDate` (ISO 8601: `YYYY-MM-DD` ou `null`)
- `operator` (exploitant)
- `eicCode` (si disponible)
- `sourceIds` (`odre`, `wikidata`, `osm`)
- `geometry` (Point ou Polygon/MultiPolygon simplifié)

Ne pas exposer en front:
- champs administratifs volumineux (IRIS/EPCI détaillés),
- structures OSM brutes complètes (`nodes`, `ways`, `relations`),
- champs redondants ou techniques non utilisés par la carte.

### Règles de qualité avant exposition
- Convertir les puissances kW -> MW
- Normaliser les dates en ISO
- Mapper `filiere` / `plant:source` / `combustible` vers un `assetType` commun
- Dédupliquer les enregistrements agrégés (`nominstallation` de type agrégation)
- Conserver un seul enregistrement canonique par installation

---

## Stratégie de merge JSON enrichi + ODRE

### Étape 1 — Préparer des index
- Index ODRE par `codeeicresourceobject` (quand présent)
- Index enrichi par:
  - `detail_page_data.entsoe_eic`
  - `wikidata_id`
  - OSM `wikidata` tag

### Étape 2 — Matching par priorité
1. **EIC exact** (`codeeicresourceobject` ↔ `entsoe_eic`)  
2. **Wikidata exact** (`wikidata_id` ODRE/OSM)  
3. **Nom + proximité géographique** (si coordonnées disponibles)  
4. **Nom + filière** (fallback faible confiance, à marquer)

### Étape 3 — Règles de fusion champ par champ
- `geometry`: OSM > Wikidata > `null`
- `capacityMw`: ODRE (`maxpuis`, alias historique `puismax`, ou `puismaxinstallee`) > Wikidata (`power_mw`) > OSM (`plant:output:electricity`)
- `operator`: ODRE > OSM > OpenInfraMap
- `commissioningDate`: Wikidata > ODRE > OSM
- `assetType` / `fuelTypes`: ODRE + OSM avec table de mapping unique

### Étape 4 — Score de confiance
Ajouter un score simple par feature:
- `high`: match EIC ou Wikidata
- `medium`: nom + distance
- `low`: nom seul

### Étape 5 — Sortie finale
Produire un `FeatureCollection` final pour la carte:
- géométrie nette,
- propriétés limitées au contrat cible,
- méta de traçabilité (`sourceIds`, `matchConfidence`, `lastUpdated`).

---

## Workflow recommandé

1. Ingestion ODRE (`dataset/rafactor data/...agrege.json`)
2. Ingestion enrichi (`dataset/rafactor data/france_power_plants_enriched_3.json`)
3. Matching + fusion selon les règles ci-dessus
4. Validation (doublons, géométrie invalide, puissance aberrante)
5. Export d’un GeoJSON final prêt pour l’API/front
