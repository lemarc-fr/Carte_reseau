'use client';

import dynamic from 'next/dynamic';

const MapEurope = dynamic(() => import('./WindMap'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f5f5',
      color: '#666',
      fontSize: 14,
    }}>
      Chargement de la carte…
    </div>
  ),
});

export default MapEurope;