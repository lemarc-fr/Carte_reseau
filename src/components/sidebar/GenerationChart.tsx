'use client';

import { useMemo } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { useCurrentSlot } from '@/hooks/useCurrentSlot';
import { formatGW, stackedRows } from '@/lib/generationUtils';
import StackedChart, { type ChartSeries } from '@/components/charts/StackedChart';
import styles from './Sidebar.module.css';

// Une série par filière (seul le nucléaire est ingéré pour l'instant)
const SERIES: ChartSeries[] = [{ key: 'nuclear', label: 'Nucléaire', fill: '#b9eef5', stroke: '#5fc9da' }];

export default function GenerationChart() {
  const plants = useMapStore((s) => s.plants);
  const generationStatus = useMapStore((s) => s.generationStatus);
  const setSelectedTime = useMapStore((s) => s.setSelectedTime);
  const { generation, slotStart } = useCurrentSlot();

  const capacity = useMemo(() => plants.reduce((sum, p) => sum + p.capacity_mw, 0), [plants]);
  const rows = useMemo(() => {
    if (!generation) return [];
    const eics = plants.flatMap((p) => p.reactors.map((r) => r.eic_code));
    return stackedRows(generation, [{ key: 'nuclear', eics }]);
  }, [generation, plants]);

  return (
    <section className={styles.chartSection}>
      <div className={styles.chartLabel}>↑ Production (GW)</div>
      <div className={styles.chartBox}>
        {generation && rows.length > 0 ? (
          <StackedChart
            rows={rows}
            series={SERIES}
            from={generation.from}
            to={generation.to}
            cursor={slotStart}
            capacity={capacity || undefined}
            unit="GW"
            height={130}
            onSelectTime={setSelectedTime}
          />
        ) : (
          <div className={styles.chartPlaceholder}>
            {generationStatus === 'error' ? 'Production indisponible' : generation ? 'Aucune donnée sur cette période' : 'Chargement…'}
          </div>
        )}
      </div>
      <div className={styles.legend}>
        {SERIES.map((s) => (
          <span key={s.key} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: s.fill, borderColor: s.stroke }} />
            {s.label}
          </span>
        ))}
        <span className={styles.legendItem}>
          <span className={styles.swatchLine} />
          Capacité installée ({formatGW(capacity)} GW)
        </span>
        <span className={styles.legendItem}>
          <span className={styles.swatchCursor} />
          Instant affiché
        </span>
      </div>
    </section>
  );
}
