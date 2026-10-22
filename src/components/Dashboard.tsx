'use client';

import dynamic from 'next/dynamic';
import { useEnergyData } from '@/hooks/useEnergyData';
import { useWindData } from '@/hooks/useWindData';
import Sidebar from './sidebar/Sidebar';
import StatsBar from './map/StatsBar';
import styles from './Dashboard.module.css';

// MapLibre / deck.gl ont besoin de window : rendu client uniquement
const PowerMap = dynamic(() => import('./map/PowerMap'), {
  ssr: false,
  loading: () => <div className={styles.mapLoading}>Chargement de la carte…</div>,
});

export default function Dashboard() {
  useEnergyData();
  useWindData();

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <Sidebar />
      </aside>
      <main className={styles.mapArea}>
        <div id="map-card" className={styles.mapCard}>
          <StatsBar />
          <div className={styles.mapWrap}>
            <PowerMap />
          </div>
        </div>
      </main>
    </div>
  );
}
