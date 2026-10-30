import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests d'intégration : API réelles (Météo-France, NOAA) et application lancée pour la
// capture de /test/wind. Réseau et .env requis : hors de `npm test` et du déploiement.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
    setupFiles: ['dotenv/config'],
    testTimeout: 240_000,
    hookTimeout: 240_000,
    fileParallelism: false,
  },
});
