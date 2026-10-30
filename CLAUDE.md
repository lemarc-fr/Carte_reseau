# Carte Réseau — consignes pour Claude

Carte de la production électrique (France site par site, GB par BMU, Europe ≥ 100 MW).
Next 16 (App Router, Turbopack), React 19, Prisma 7 + PostgreSQL, MapLibre 5 + deck.gl 9.
Répondre en français, code et commentaires en français, style du code environnant.

## Git
- Sauf contre-indication, pull, commit and push tout le temps.
## Économie
- Lire ciblé : `grep -n` puis `Read` avec offset/limit. Ne jamais lire en entier `dataset/**/raw/*`,
  `dataset/*/final/*.json`, `package-lock.json`, `.next/` : les inspecter par `python3 -c`/`jq`.
- Sorties de commandes filtrées : `npm test 2>&1 | grep -E "Tests|FAIL|×"`, `| tail`, `| grep -v notice`.
- Pas de capture d'écran (Chromium swiftshader : lent et coûteux) sauf changement visuel demandé ;
  désactiver `/api/wind` (`page.route`) si le vent n'est pas en jeu.
- Pas de sous-agent pour une recherche que `grep` fait. Réponse finale courte.
- Docs Next (`node_modules/next/dist/docs/`) : seulement avant d'utiliser une API Next
  (route, config, rendu), pas pour du code métier.

## Carte du code
- `src/lib/power/` ingestion : `types.ts` (Country, Source), `ingest.ts` (sync 15 min, rattrapage
  BACK_FILL_START), `store.ts` (écritures SQL), `fr/` RTE + éCO2mix, `gb/` Elexon (FUELHH/AGWS,
  PN puis B1610), `entsoe/` (désactivé sans ENTSOE_API_KEY), `countries.ts`.
- `src/lib/wind/` : `meteofrance.ts` (AROME HD, ARPEGE), `gfs.ts` (secours), `cache.ts`, `texture.ts`.
- `src/lib/energy.ts` (API plants/generation), `generationUtils.ts` (estimations, filtre 100 MW).
- `src/components/map/PowerMap.tsx`, `controls/` (panneaux d'icônes), `sidebar/`.
- `src/config/` : `assetTypes.ts` (filières, séries, pays), `mapStyle.ts`, `mapConfig.ts`.
- Séries agrégées : `<CC>:<TYPE>` (MW), `<CC>-<région>:<FILIÈRE>` (taux de charge, région `*` = pays).
- Données : `dataset/<cc>/final/` lu par `src/prisma/seed.ts` ; scripts Python dans
  `dataset/{fr,gb,eu}/scripts/` (voir `dataset/README.md`).

## Commandes
- Vérifier : `npx tsc --noEmit -p .`, `npx eslint .`, `npm test` (vitest, sans réseau ni base).
- Tests réels (réseau, .env) : `TEST_BASE_URL=http://localhost:3100 npm run test:integration`
  (téléchargement et traitement du vent, capture de `/test/wind` dans `test-output/wind.png`).
- `npm run build` exécute `prisma generate` ; après install ou changement de schéma :
  `npx prisma generate` (npm 12 bloque les scripts d'installation).
- Serveur de test : `npm run build` puis `BACK_FILL_START= npx next start -p 3100`.

## Base et déploiement
- `.env` local -> base `carte_reseau_dev`. Jamais de migration ni de seed à la main sur
  `nuclear_production` (prod). Migrations additives (l'ancien serveur tourne pendant le déploiement).
- Push sur `master` = déploiement automatique (`.github/workflows/deploy.yml` : npm ci, prisma
  generate, npm test, migrate, seed, build, restart). Ne pas déployer à la main.
- Avant de pousser : `git fetch` (l'utilisateur pousse parfois des instantanés « a »).
- Secrets uniquement dans `.env` (non versionné).

## Pièges connus
- MapLibre doit rester en 5.x : deck.gl 9.4 (interleaved) lit `map.transform`, absent de la v6.
- eslint 10 et TypeScript 7 non pris en charge par eslint-config-next / typescript-eslint.
- `aggregateDays` utilise `LIKE` : `_` y est un joker.
- THREDDS peut renommer `time`/`reftime` en `time1`/`reftime1`.
- AROME n'est pas rectangulaire (coins sans donnée) : masquer la couche Europe par ses données.
- Elexon : B1610 arrive ~7 jours après ; AGWS refuse > 7 jours par requête.
