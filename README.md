# Carte Réseau

Carte en temps réel de la production d'électricité, site par site, inspirée de la
[GB Renewables Map](https://renewables-map.robinhawkes.com/) de Robin Hawkes : anneau = puissance
installée, disque = production, graphique de production par filière sur 7 jours, choix de l'instant
affiché, liste triable et fiche détaillée par site. En ligne : https://carte_reseau.lemarc.fr

Pays couverts : la France, site par site (RTE, éCO2mix), la Grande-Bretagne par ses centrales d'au moins
100 MW et leurs unités BMU (Elexon), et le reste de l'Europe par ses centrales d'au moins 100 MW
(34 pays, production ENTSO-E). Voir plus bas.

| Filière | Sites | Production affichée |
|---|---|---|
| Nucléaire | 18 centrales, 57 réacteurs | par réacteur (RTE) |
| Hydraulique, STEP, énergies marines | 155 centrales | par groupe pour les grandes centrales (RTE), estimée sinon |
| Éolien | ~1 400 sites (communes), 7 parcs en mer | par groupe en mer (RTE), estimée sinon |
| Solaire | ~4 300 communes de plus de 1 MW | estimée |
| Gaz, charbon, fioul | ~600 sites | par groupe pour les centrales de plus de 100 MW (RTE), estimée sinon |
| Bioénergies, batteries | ~970 sites | idem |

Estimation = puissance installée × taux de charge régional de la filière (éCO2mix). Le graphique et la
barre du haut utilisent la production nationale par filière publiée par RTE. Au zoom 10 et au-delà,
la carte montre l'emprise des centrales et chaque installation (éolienne, panneau, poste électrique)
d'OpenStreetMap via les tuiles Open Infrastructure Map, partout dans le monde.

Vent à 10 m : AROME HD (Météo-France) sur la France, ARPEGE 0,1° (Météo-France) sur l'Europe, pour la
même échéance (la plus proche de maintenant). La clé Météo-France doit être abonnée aux API AROME et
ARPEGE ; sans ARPEGE, GFS 0,25° (NOAA, via THREDDS/UCAR, pas de 3 h) le remplace.

Contrôles de la carte (en haut à droite) : vent, anneaux de capacité, taille normalisée, sites dotés
d'un groupe de 100 MW ou plus seulement, lignes électriques, noms des centrales, puis une icône par
filière.

## Lancer le projet

Copier `.env.example` en `.env` et le remplir : base PostgreSQL, identifiants RTE, clé Météo-France,
jeton ENTSO-E (facultatif) et **`BACK_FILL_START`**, la date (YYYY-MM-DD) depuis laquelle
l'historique de production est conservé.

```bash
npm ci
npm run db:migrate   # applique src/prisma/migrations
npm run db:seed      # sites et groupes depuis dataset/fr/final/
npm run dev
npm test             # tests unitaires (vitest, sans réseau ni base)
```

Au démarrage, le serveur récupère les derniers jours puis complète l'historique depuis
`BACK_FILL_START`, source par source ; il se resynchronise ensuite toutes les 15 minutes
(`src/lib/power/ingest.ts`, lancé par `src/instrumentation.ts`). Les relevés horaires de plus de
7 jours sont résumés en moyennes journalières. `npm run backfill` relance le rattrapage à la main,
`npm run backfill -- 30` retélécharge les 30 derniers jours.

## Organisation

```
src/app/api/            plants (sites), generation (séries), wind (vent)
src/lib/power/          ingestion générique : pays, sources, écriture en base, rattrapage
src/lib/power/fr/       France : RTE (groupes, filières), éCO2mix régional, rattachement des groupes
src/lib/wind/           vent : AROME (France), ARPEGE ou GFS (Europe), encodage des textures
src/components/         carte (MapLibre + deck.gl), barre latérale, graphiques
src/config/             filières (couleurs, séries), style de carte, réglages
dataset/                jeux de données et leur préparation (voir dataset/README.md)
systemd/                service et configuration nginx du déploiement
```

### Grande-Bretagne : Elexon BMRS

`src/lib/power/gb/` interroge l'API Insights d'Elexon (sans clé) :

- filières : FUELHH (unités du réseau de transport) et AGWS (éolien et solaire, réseau de
  distribution compris) -> `GB:<TYPE>`, `GB:TOTAL`, taux de charge `GB-*:<FILIÈRE>` (FUELHH rapporté à
  la puissance des BMU de la filière) ;
- production de chaque BMU des centrales de `dataset/gb/final/PLANTS.json` : programme déclaré (PN)
  pour les derniers jours, remplacé par la production mesurée (B1610) dès sa publication, environ
  7 jours après. Les jours complets en B1610 sont notés dans `ingested_days` ; la synchronisation
  regarde 14 jours en arrière pour cette source (`lookbackDays`) et ne rapatrie pas de PN au-delà de
  10 jours (`historyDays`).

### Europe : ENTSO-E

`src/lib/power/entsoe/` synchronise chaque pays de `countries.ts` (codes EIC de ses zones) avec
l'API de la plateforme de transparence ENTSO-E, si `ENTSOE_API_KEY` est renseigné
(`ENTSOE_COUNTRIES` pour n'en garder que certains) :

- production par filière (A75) -> séries `<pays>:<TYPE>` et `<pays>:TOTAL` ;
- taux de charge nationaux (production / puissance installée de l'année, A68) -> `<pays>-*:<FILIÈRE>`,
  pour estimer les centrales sans groupe publié ;
- production par groupe de 100 MW ou plus (A73) -> rattachée aux centrales par code EIC.

Sans jeton, les centrales européennes s'affichent avec leur puissance, sans production.

### Ajouter un pays

1. `dataset/<pays>/final/PLANTS.json` : sites au format de `dataset/fr/final/WIND.json` (identifiant,
   filière, position, puissance, région, groupes publiés), lus par `src/prisma/seed.ts`.
2. Un objet `Country` (`src/lib/power/types.ts`) dont les sources écrivent la production des groupes
   et les séries `<pays>:<FILIÈRE>` et `<pays>-<région>:<FILIÈRE>` : une ligne dans
   `src/lib/power/entsoe/countries.ts` pour un pays d'ENTSO-E, un dossier comme `src/lib/power/fr/`
   pour une autre source.
3. L'enregistrer dans `src/lib/power/countries.ts`.

### API

- `GET /api/plants` : sites, groupes, position, emprise (gardé en mémoire, ETag)
- `GET /api/generation?from=ISO&to=ISO` : production horaire par groupe, production nationale par filière
  et taux de charge régionaux (7 jours par défaut, 31 max)
- `GET /api/wind/meta`, `GET /api/wind/image?layer=europe|france` : couches de vent

## Déploiement (Raspberry Pi)

- `systemd/carte_reseau.service` : service Next.js sur 127.0.0.1:3000 (lit `.env`), installé par lien
  symbolique dans /etc/systemd/system
- `systemd/nginx.conf.part` : bloc `server` en 443 ssl, inclus avec ceux des autres sites par
  `include /home/Marc/Web/*/systemd/nginx.conf.part;` (certificats déclarés globalement)
- `.github/workflows/deploy.yml` : à chaque push sur `master`, SSH sur le Pi puis `git pull`, `npm ci`,
  `prisma generate`, `npm test`, `npm run db:migrate`, `npm run db:seed`, `npm run build` et redémarrage
  du service
