https://www.openstreetmap.org/way/235386452
view-source:https://openinframap.org/stats/area/France/plants


## Spécifications — Registre des centrales électriques françaises

### Objectif

Un endpoint `/api/plants/france` qui retourne un GeoJSON exhaustif de toutes les installations de production électrique françaises, enrichi de métadonnées officielles.

---

### Structure cible de chaque feature

```typescript
interface PlantFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [longitude: number, latitude: number];
  };
  properties: {
    // ─── Identifiants ───────────────────────────────
    osm_id: number;
    osm_type: 'node' | 'way' | 'relation';
    wikidata_id: string | null;        // ex. "Q123456"
    eic_code: string | null;           // ex. "17WFRANCE000001X" — identifiant réseau européen
    odre_id: string | null;            // identifiant dans le registre RTE/ODRE

    // ─── Dénomination ───────────────────────────────
    name: string | null;
    operator: string | null;

    // ─── Type & énergie ─────────────────────────────
    assetType: AssetType;              // voir enum ci-dessous
    fuelTypes: string[];               // ex. ["WIND"], ["NUCLEAR"], ["HYDRO", "PUMPED"]

    // ─── Capacité ───────────────────────────────────
    capacity_mw: number | null;        // puissance installée en MW
    capacity_source: 'osm' | 'odre' | 'wikidata'; // quelle source fait foi

    // ─── Statut ─────────────────────────────────────
    status: 'operating' | 'construction' | 'disused' | 'unknown';
    start_date: string | null;         // ex. "2012"

    // ─── Données temps réel (phase 2) ───────────────
    hasRealtimeData: boolean;          // true si EIC code connu
  };
}

type AssetType =
  | 'wind'
  | 'solar'
  | 'nuclear'
  | 'hydro'
  | 'gas'
  | 'coal'
  | 'oil'
  | 'biomass'
  | 'storage'
  | 'other';
```

---

### Sources de données à croiser

| Priorité | Source | Ce qu'elle apporte | Lien |
|---|---|---|---|
| 1 | **Overpass API (OSM)** | Géométrie, nom, type, capacité approximative | `overpass-api.de` |
| 2 | **ODRE / RTE** | Capacité officielle, EIC code, statut, commune | `odre.opendatasoft.com` |
| 3 | **Wikidata SPARQL** | Nom normalisé, opérateur, date de mise en service | `query.wikidata.org` |

**Règle de priorité sur la capacité :** ODRE > Wikidata > OSM

---

### Couverture attendue

| Type | Nombre estimé en France |
|---|---|
| Éolien terrestre | ~4 000 parcs |
| Solaire | ~6 000+ installations > 1 MW |
| Hydraulique | ~2 500 installations |
| Nucléaire | 18 sites / 56 réacteurs |
| Gaz / CCGT | ~150 |
| Biomasse / cogénération | ~300 |
| Stockage (STEP) | ~6 sites majeurs |

---

### Requête Overpass cible

```
[out:json][timeout:120];
(
  node["power"="plant"](42,-5,52,10);
  way["power"="plant"](42,-5,52,10);
  relation["power"="plant"](42,-5,52,10);
  node["power"="generator"]["plant:source"](42,-5,52,10);
);
out center tags;
```

Le tag `power=generator` capture les installations individuelles (éolienne unitaire, panneau solaire) que `power=plant` ne couvre pas toujours.

---

### Endpoint API

```
GET /api/plants/france
```

**Réponse :** GeoJSON `FeatureCollection`
**Cache :** 24h (données quasi-statiques)
**Format :** `Content-Type: application/geo+json`

**Query params optionnels :**
- `?type=wind,solar` — filtrer par assetType
- `?minCapacity=10` — seuil en MW
- `?status=operating` — filtrer par statut

---

### Ce que tu n'as pas encore

- **EIC codes France** → à récupérer via le [registre ODRE](https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/registre-national-installation-production-stockage-electricite-agrege/records) — c'est le fichier CSV/JSON téléchargeable, ~15 000 lignes
- **Logique de matching OSM ↔ ODRE** → par wikidata_id en priorité, sinon par distance géographique (< 500m) + type identique
- **Petites installations solaires** → OSM est incomplet sous 100 kW, ODRE est la seule source fiable