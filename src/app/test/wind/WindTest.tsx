'use client';

import dynamic from 'next/dynamic';

// MapLibre / deck.gl ont besoin de window : rendu client uniquement
const WindTestMap = dynamic(() => import('./WindTestMap'), { ssr: false });

export default function WindTest() {
  return <WindTestMap />;
}
