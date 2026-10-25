# Jeux de données

Un dossier par pays. Seul `final/` est lu par l'application (`npm run db:seed`) ; `raw/` et
`scripts/` servent à le reconstruire. La France est décrite site par site (`fr/`), les autres pays
européens par leurs centrales d'au moins 100 MW (`<pays>/final/PLANTS.json`, produit par `eu/`).

```
fr/
  raw/        sources brutes (gros fichiers sous Git LFS)
    registre-national-installation-production-stockage-electricite-agrege.json   registre ODRE
    ordre_per_filiere/<FILIÈRE>.json      registre découpé par filière (format_ordre.py)
    france_power_plants.json              centrales OpenInfraMap (open_infra_map.py)
    france_power_plants_enriched_3.json   + détails OSM et Wikidata (wikidata.py)
  scripts/    préparation (Python 3)
  final/      jeux consolidés lus par le seed
```

## Jeux finaux (`fr/final/`)

| Fichier | Contenu | Produit par |
|---|---|---|
| `NUCLEAR.json` | 18 CNPE, réacteurs (codes EIC), emprise OSM | `nuclear.py` (+ `patches_nuclear.json`) |
| `HYDRO.json` | centrales hydrauliques et STEP, emprise OSM | `hydraulique.py` (+ `patches_hydro.json`) |
| `WIND.json`, `SOLAR.json`, `THERMAL.json`, `BIOENERGY.json`, `BATTERY.json`, `MARINE.json` | installations du registre regroupées par commune et par filière | `registre.py` (+ `patches_wind.json`) |

`registre.py` place chaque commune à son centre (API geo.api.gouv.fr), écarte les sites de moins de
1 MW et liste comme groupes les installations d'au moins 100 MW (RTE publie leur production). Les
parcs éoliens en mer sont positionnés et nommés dans `patches_wind.json`.

```bash
cd dataset/fr/scripts
python3 registre.py      # régénère les six jeux issus du registre
```

Les groupes publiés par RTE dont le code EIC n'apparaît pas dans ces jeux (grande hydraulique,
quelques centrales thermiques) sont rattachés à leur site par leur nom dans
`src/lib/power/fr/unitPlants.ts`.

## Europe (`eu/` -> `<pays>/final/PLANTS.json`)

`eu/raw/powerplants.csv` (Git LFS) : base [powerplantmatching](https://github.com/PyPSA/powerplantmatching)
de PyPSA, qui rassemble les registres nationaux, ENTSO-E, JRC, OpenStreetMap et GEM avec positions et
codes EIC. Téléchargée le 24/10/2026, sha256 `ceccce02edd33813216a264fe6c8e3281ce2249435a259c1b1a1b729ce4f3d78`.

`eu/scripts/powerplantmatching.py` garde, hors France, les centrales d'au moins 100 MW en service
(1 812 dans 35 pays) et liste leurs codes EIC comme groupes : ENTSO-E publie la production de chaque
groupe de 100 MW ou plus. Le Royaume-Uni (hors ENTSO-E depuis 2021), l'Ukraine, la Moldavie et le
Kosovo sont affichés sans production.

```bash
cd dataset/eu/scripts
python3 powerplantmatching.py   # régénère dataset/<pays>/final/PLANTS.json
```
