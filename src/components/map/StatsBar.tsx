'use client';

import { useMapStore } from '@/store/useMapStore';
import { useCurrentSlot } from '@/hooks/useCurrentSlot';
import { fleetSnapshot, formatMW, formatPercent } from '@/lib/generationUtils';
import styles from './Map.module.css';

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

export default function StatsBar() {
  const plants = useMapStore((s) => s.plants);
  const { generation, index } = useCurrentSlot();
  const fleet = fleetSnapshot(plants, generation, index);
  const hasData = fleet.output !== null;

  return (
    <div className={styles.statsBar}>
      <Stat
        label="Production"
        title="Production totale des réacteurs nucléaires sur le créneau horaire affiché"
        value={`${formatMW(fleet.output)} MW`}
      />
      <Stat
        label="Facteur de charge"
        title="Production rapportée à la capacité installée du parc"
        value={hasData && fleet.capacity ? formatPercent(fleet.output! / fleet.capacity) : '–'}
        color="#086f83"
      />
      <Stat
        label="En marche"
        title="Réacteurs qui produisent sur le créneau affiché"
        value={hasData ? `${fleet.running} / ${fleet.reactors}` : '–'}
        color="#2f855a"
      />
    </div>
  );
}
