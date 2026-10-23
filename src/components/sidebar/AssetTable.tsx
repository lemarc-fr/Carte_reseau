'use client';

import { useMemo, useState } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { useCurrentSlot } from '@/hooks/useCurrentSlot';
import { formatMW, formatOutput, plantSnapshot, type Snapshot } from '@/lib/generationUtils';
import { ASSET_TYPES } from '@/config/assetTypes';
import type { PlantInfo } from '@/types/energy';
import TypeBadge from './TypeBadge';
import styles from './Sidebar.module.css';

type SortKey = 'name' | 'type' | 'output' | 'capacity';

const COLUMNS: { key: SortKey; label: string; numeric?: boolean; hideNarrow?: boolean }[] = [
  { key: 'name', label: 'Actif' },
  { key: 'type', label: 'Type', hideNarrow: true },
  { key: 'output', label: 'Prod. (MW)', numeric: true },
  { key: 'capacity', label: 'Cap. (MW)', numeric: true },
];

const PAGE_SIZE = 100;

function detail(plant: PlantInfo, snapshot: Snapshot): string {
  if (snapshot.output === null) return 'Pas de donnée';
  if (snapshot.estimated) {
    return plant.installations && plant.installations > 1
      ? `${plant.installations} installations · estimation`
      : 'Estimation régionale';
  }
  if (snapshot.output < 0) return 'Pompage';
  return `${snapshot.running}/${snapshot.units} en marche`;
}

export default function AssetTable() {
  const plants = useMapStore((s) => s.plants);
  const plantsStatus = useMapStore((s) => s.plantsStatus);
  const productionTypes = useMapStore((s) => s.productionTypes);
  const hoveredPlantId = useMapStore((s) => s.hoveredPlantId);
  const selectPlant = useMapStore((s) => s.selectPlant);
  const setHoveredPlantId = useMapStore((s) => s.setHoveredPlantId);
  const { generation, index } = useCurrentSlot();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'output', desc: true });
  const [visibleRows, setVisibleRows] = useState(PAGE_SIZE);

  const rows = useMemo(() => {
    const withSnapshots = plants
      .filter((plant) => productionTypes[ASSET_TYPES[plant.type].storeKey])
      .map((plant) => ({ plant, snapshot: plantSnapshot(plant, generation, index) }));
    const value = ({ plant, snapshot }: (typeof withSnapshots)[number]): string | number => {
      switch (sort.key) {
        case 'name':
          return plant.name;
        case 'type':
          return ASSET_TYPES[plant.type].label;
        case 'output':
          return snapshot.output ?? Number.NEGATIVE_INFINITY;
        case 'capacity':
          return plant.capacity_mw;
      }
    };
    return withSnapshots.sort((a, b) => {
      const [va, vb] = [value(a), value(b)];
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr');
      return sort.desc ? -cmp : cmp;
    });
  }, [plants, productionTypes, generation, index, sort]);

  if (plantsStatus === 'error') {
    return <p className={styles.timeHint}>Impossible de charger la liste des centrales.</p>;
  }

  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={[styles.sortable, col.numeric && styles.numeric, col.hideNarrow && styles.hideNarrow].filter(Boolean).join(' ')}
                aria-sort={sort.key === col.key ? (sort.desc ? 'descending' : 'ascending') : undefined}
                onClick={() =>
                  setSort((s) => ({ key: col.key, desc: s.key === col.key ? !s.desc : col.numeric === true }))
                }
              >
                {col.label}
                {sort.key === col.key && <span className={styles.sortArrow}>{sort.desc ? '▼' : '▲'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, visibleRows).map(({ plant, snapshot }) => (
            <tr
              key={plant.id}
              className={hoveredPlantId === plant.id ? styles.rowHover : styles.row}
              onClick={() => selectPlant(plant.id)}
              onMouseEnter={() => setHoveredPlantId(plant.id)}
              onMouseLeave={() => setHoveredPlantId(null)}
            >
              <td>
                {plant.name}
                <div className={styles.rowSub}>{detail(plant, snapshot)}</div>
              </td>
              <td className={styles.hideNarrow}>
                <TypeBadge plant={plant} />
              </td>
              <td className={styles.numeric}>{formatOutput(snapshot.output, snapshot.estimated)}</td>
              <td className={styles.numeric}>{formatMW(plant.capacity_mw)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > visibleRows && (
        <button type="button" className={styles.buttonBlock} onClick={() => setVisibleRows((n) => n + PAGE_SIZE)}>
          Afficher plus ({rows.length - visibleRows} restants)
        </button>
      )}
    </>
  );
}
