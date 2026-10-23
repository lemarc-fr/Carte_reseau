'use client';

import { useMapStore } from '@/store/useMapStore';
import { useCurrentSlot } from '@/hooks/useCurrentSlot';
import { formatGW, formatMW, nationalOutput } from '@/lib/generationUtils';
import { ASSET_TYPE_ORDER, ASSET_TYPES } from '@/config/assetTypes';
import styles from './Map.module.css';

// Production nationale (RTE, par filière) des filières affichées sur la carte
export default function StatsBar() {
  const productionTypes = useMapStore((s) => s.productionTypes);
  const { generation, index } = useCurrentSlot();

  const types = ASSET_TYPE_ORDER.filter((type) => productionTypes[ASSET_TYPES[type].storeKey]);
  const values = types.map((type) => ({ type, value: nationalOutput(generation, type, index) }));
  const known = values.filter((v) => v.value !== null);
  const total = known.length ? known.reduce((sum, v) => sum + v.value!, 0) : null;

  return (
    <div className={styles.statsBar}>
      <span className={styles.stat}>
        <span className={styles.statLabel} title="Production nationale des filières affichées sur le créneau horaire (RTE)">
          Production :
        </span>
        <span className={styles.statValue}>{formatMW(total)} MW</span>
      </span>
      {values.map(({ type, value }) => (
        <span key={type} className={styles.stat}>
          <span
            className={styles.statLabel}
            title={type === 'pumped_storage' ? 'Turbinage (+) ou pompage (−) des STEP' : undefined}
          >
            {ASSET_TYPES[type].label} :
          </span>
          <span className={styles.statValue} style={{ color: ASSET_TYPES[type].badgeColor }}>
            {value === null ? '–' : `${value > 0 && type === 'pumped_storage' ? '+' : ''}${formatGW(value)} GW`}
          </span>
        </span>
      ))}
    </div>
  );
}
