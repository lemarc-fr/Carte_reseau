'use client';

import { useCallback, useState } from 'react';
import { useMapStore } from '@/store/useMapStore';
import GenerationChart from './GenerationChart';
import TimeControl from './TimeControl';
import AssetSearch from './AssetSearch';
import AssetTable from './AssetTable';
import PlantDetail from './PlantDetail';
import AboutModal from './AboutModal';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const plants = useMapStore((s) => s.plants);
  const selectedPlantId = useMapStore((s) => s.selectedPlantId);
  const selectedPlant = plants.find((p) => p.id === selectedPlantId) ?? null;
  const [aboutOpen, setAboutOpen] = useState(false);
  const closeAbout = useCallback(() => setAboutOpen(false), []);

  return (
    <>
      <header>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Carte Réseau France</h1>
          <button type="button" className={styles.button} onClick={() => setAboutOpen(true)}>
            À propos &amp; FAQ
          </button>
        </div>
        <p className={styles.subtitle}>
          Le parc nucléaire en temps réel, d&apos;après{' '}
          <a href="https://data.rte-france.com" target="_blank" rel="noreferrer">
            les données RTE
          </a>
        </p>
      </header>

      <GenerationChart />
      <TimeControl />
      <AssetSearch />
      {selectedPlant ? <PlantDetail plant={selectedPlant} /> : <AssetTable />}

      {aboutOpen && <AboutModal onClose={closeAbout} />}
    </>
  );
}
