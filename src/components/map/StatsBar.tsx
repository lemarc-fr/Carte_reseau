'use client';

import { useMapStore } from '@/store/useMapStore';
import { useCurrentSlot } from '@/hooks/useCurrentSlot';
import { formatGW, formatMW, formatPercent, nationalOutput } from '@/lib/generationUtils';
import { ASSET_TYPE_ORDER, ASSET_TYPES } from '@/config/assetTypes';
import type { AssetType } from '@/types/energy';
import styles from './Map.module.css';

const FOSSIL: AssetType[] = ['gas', 'coal', 'oil'];

function Stat({ label, title, value, color }: { label: string; title: string; value: string; color?: string }) {
  return (
    <span className={styles.stat}>
      <span className={styles.statLabel} title={title}>
        {label} :
      </span>
      <span className={styles.statValue} style={color ? { color } : undefined}>
        {value}
      </span>
    </span>
  );
}

// Synthèse nationale (RTE, par filière) des filières affichées sur la carte
export default function StatsBar() {
  const productionTypes = useMapStore((s) => s.productionTypes);
  const { generation, index } = useCurrentSlot();

  const types = ASSET_TYPE_ORDER.filter((type) => productionTypes[ASSET_TYPES[type].storeKey]);
  const value = (type: AssetType) => nationalOutput(generation, type, index);
  const sum = (list: AssetType[]) => {
    const known = list.map(value).filter((v): v is number => v !== null);
    return known.length ? known.reduce((a, b) => a + b, 0) : null;
  };

  const producing = types.filter((type) => !ASSET_TYPES[type].storage);
  const storage = types.filter((type) => ASSET_TYPES[type].storage);
  const production = sum(producing);
  const lowCarbon = sum(producing.filter((type) => !FOSSIL.includes(type)));
  const storageNet = sum(storage);
  // Solde des échanges physiques (éCO2mix), positif = import
  const exchange = generation && index >= 0 ? (generation.aggregates['FR:EXCHANGE']?.[index] ?? null) : null;

  return (
    <div className={styles.statsBar}>
      <Stat
        label="Production"
        title="Production nationale des filières affichées sur le créneau horaire (RTE), hors stockage"
        value={`${formatMW(production)} MW`}
      />
      {production !== null && production > 0 && lowCarbon !== null && (
        <Stat
          label="Bas carbone"
          title="Part du nucléaire, de l'hydraulique, de l'éolien, du solaire et des bioénergies dans cette production"
          value={formatPercent(lowCarbon / production)}
          color="#2f855a"
        />
      )}
      {storageNet !== null && (
        <Stat
          label="Stockage"
          title="STEP et batteries : déstockage (+) ou recharge (−)"
          value={`${storageNet > 0 ? '+' : ''}${formatGW(storageNet)} GW`}
          color={ASSET_TYPES.pumped_storage.badgeColor}
        />
      )}
      {exchange !== null && (
        <Stat
          label={exchange > 0 ? 'Import' : 'Export'}
          title="Solde des échanges physiques de la France avec ses voisins (éCO2mix) ; cliquer un arc de la carte pour le détail par frontière"
          value={`${formatGW(Math.abs(exchange))} GW`}
          color={exchange > 0 ? '#c05621' : '#2f855a'}
        />
      )}
    </div>
  );
}
