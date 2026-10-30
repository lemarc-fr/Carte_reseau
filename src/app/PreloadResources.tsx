'use client';

import ReactDOM from 'react-dom';
import { PROTOMAPS_API_KEY } from '@/config/mapConfig';
import { LIVE_GENERATION_URL } from '@/hooks/useEnergyData';

// Données de la carte demandées dès le HTML, pendant le chargement du JavaScript
// (mêmes URL et même mode que les fetch des hooks, sinon le navigateur les recharge).

export function PreloadResources() {
  for (const url of ['/api/plants', LIVE_GENERATION_URL, '/api/wind/meta']) {
    ReactDOM.preload(url, { as: 'fetch', crossOrigin: 'anonymous' });
  }
  ReactDOM.preload(`https://api.protomaps.com/tiles/v4.json?key=${PROTOMAPS_API_KEY}`, {
    as: 'fetch',
    crossOrigin: 'anonymous',
  });
  // Tuiles du fond de carte, du relief, des lignes électriques et polices
  for (const origin of [
    'https://api.protomaps.com',
    'https://tiles.mapterhorn.com',
    'https://openinframap.org',
    'https://protomaps.github.io',
  ]) {
    ReactDOM.preconnect(origin, { crossOrigin: 'anonymous' });
  }
  return null;
}
