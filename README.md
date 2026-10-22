# Carte Réseau

Application Next.js pour visualiser des actifs de production électrique en France, avec enrichissement multi-sources.

Interface inspirée de la [GB Renewables Map](https://renewables-map.robinhawkes.com/) de Robin Hawkes :
carte des centrales (anneau = capacité, disque = production), graphique de production sur 7 jours,
choix de l'instant affiché, liste triable et fiche détaillée par centrale. Pour l'instant : le nucléaire
(18 centrales, 57 réacteurs), production horaire par réacteur publiée par RTE.

## Lancer le projet

Fichier `.env` (non versionné) :

```bash
DATABASE_URL="postgresql://user:motdepasse@127.0.0.1:5432/nuclear_production"
RTE_CLIENT_ID="…"       # application data.rte-france.com abonnée à l'API Actual Generation
RTE_CLIENT_SECRET="…"
```

```bash
npm ci
npm run db:migrate   # applique src/prisma/migrations
npm run db:seed      # 18 centrales + 57 réacteurs depuis dataset/Finie/NUCLEAR.json
npm run backfill     # 7 derniers jours de production RTE (optionnel : `npm run backfill -- 30`)
npm run dev
```

Une fois lancé, le serveur interroge RTE toutes les 15 minutes (`src/lib/power/ingest.ts`, démarré par
`src/instrumentation.ts`). Les relevés horaires de plus de 7 jours sont agrégés en moyennes journalières.

### API

- `GET /api/plants` : centrales, réacteurs, position et emprise du site
- `GET /api/generation?from=ISO&to=ISO` : production horaire par réacteur (7 jours par défaut, 31 max)

### Déploiement (Raspberry Pi)

- `systemd/carte_reseau.service` : service Next.js sur 127.0.0.1:3000 (lit `.env`)
- `systemd/nginx.conf.part` : bloc `server` en 443 ssl, inclus depuis la configuration nginx principale
  (les certificats y sont déclarés globalement)

## Sources de données disponibles

### 1) Dataset ODRE (registre national)
- Fichier: `dataset/registre-national-installation-production-stockage-electricite-agrege.json`
- Contenu: `FeatureCollection` avec un grand nombre de champs métier (filière, puissance, commune, gestionnaire, etc.)
- Limite principale: `geometry` est souvent `null`

### 2) Métadonnées ODRE
- Fichier: `dataset/registre-national-installation-production-stockage-electricite-agrege.geojson`
- Contenu: métadonnées du dataset (description des champs), pas la géométrie des installations

### 3) Dataset enrichi OpenInfraMap / OSM / Wikidata
- Fichier: `dataset/open_data/france_power_plants_enriched.json`
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

1. Ingestion ODRE (`dataset/...agrege.json`)
2. Ingestion enrichi (`dataset/open_data/france_power_plants_enriched.json`)
3. Matching + fusion selon les règles ci-dessus
4. Validation (doublons, géométrie invalide, puissance aberrante)
5. Export d’un GeoJSON final prêt pour l’API/front
