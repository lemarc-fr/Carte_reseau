'use client';

import { useMemo } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { useCurrentSlot } from '@/hooks/useCurrentSlot';
import { buildRows, nationalOutput } from '@/lib/generationUtils';
import { ASSET_TYPE_ORDER, ASSET_TYPES } from '@/config/assetTypes';
import StackedChart, { type ChartSeries } from '@/components/charts/StackedChart';
import type { AssetType } from '@/types/energy';
import styles from './Sidebar.module.css';

// Production nationale par filière (RTE), une aire par filière affichée sur la carte
export default function GenerationChart() {
  const productionTypes = useMapStore((s) => s.productionTypes);
  const generationStatus = useMapStore((s) => s.generationStatus);
  const setSelectedTime = useMapStore((s) => s.setSelectedTime);
  const { generation, slotStart } = useCurrentSlot();

  const types = ASSET_TYPE_ORDER.filter((type) => productionTypes[ASSET_TYPES[type].storeKey]);
  const series: ChartSeries[] = types.map((type) => ({
    key: type,
    label: ASSET_TYPES[type].label,
    fill: ASSET_TYPES[type].chartFill,
    stroke: ASSET_TYPES[type].chartStroke,
  }));

  const typesKey = types.join(',');
  const rows = useMemo(() => {
    if (!generation) return [];
    return buildRows(
      generation,
      (typesKey.split(',').filter(Boolean) as AssetType[]).map((type) => ({
        key: type,
        value: (i: number) => nationalOutput(generation, type, i),
      }))
    );
  }, [generation, typesKey]);

  return (
    <section className={styles.chartSection}>
      <div className={styles.chartLabel}>↑ Production en France (GW)</div>
      <div className={styles.chartBox}>
        {generation && rows.length > 0 && series.length > 0 ? (
          <StackedChart
            rows={rows}
            series={series}
            from={generation.from}
            to={generation.to}
            cursor={slotStart}
            unit="GW"
            height={140}
            onSelectTime={setSelectedTime}
          />
        ) : (
          <div className={styles.chartPlaceholder}>
            {generationStatus === 'error'
              ? 'Production indisponible'
              : !series.length
                ? 'Aucune filière affichée'
                : generation
                  ? 'Aucune donnée sur cette période'
                  : 'Chargement…'}
          </div>
        )}
      </div>
      <div className={styles.legend}>
        {series.map((s) => (
          <span key={s.key} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: s.fill, borderColor: s.stroke }} />
            {s.label}
          </span>
        ))}
        <span className={styles.legendItem}>
          <span className={styles.swatchCursor} />
          Instant affiché
        </span>
      </div>
    </section>
  );
}
