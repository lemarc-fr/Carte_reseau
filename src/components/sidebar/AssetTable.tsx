'use client';

import { useMemo, useState } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { useCurrentSlot } from '@/hooks/useCurrentSlot';
import { formatMW, plantSnapshot } from '@/lib/generationUtils';
import styles from './Sidebar.module.css';

type SortKey = 'name' | 'type' | 'output' | 'capacity';

const COLUMNS: { key: SortKey; label: string; numeric?: boolean; hideNarrow?: boolean }[] = [
  { key: 'name', label: 'Centrale' },
  { key: 'type', label: 'Type', hideNarrow: true },
  { key: 'output', label: 'Prod. (MW)', numeric: true },
  { key: 'capacity', label: 'Cap. (MW)', numeric: true },
];

export default function AssetTable() {
  const plants = useMapStore((s) => s.plants);
  const plantsStatus = useMapStore((s) => s.plantsStatus);
  const hoveredPlantId = useMapStore((s) => s.hoveredPlantId);
  const selectPlant = useMapStore((s) => s.selectPlant);
  const setHoveredPlantId = useMapStore((s) => s.setHoveredPlantId);
  const { generation, index } = useCurrentSlot();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'output', desc: true });

  const rows = useMemo(() => {
    const withSnapshots = plants.map((plant) => ({ plant, snapshot: plantSnapshot(plant, generation, index) }));
    const value = ({ plant, snapshot }: (typeof withSnapshots)[number]): string | number => {
      switch (sort.key) {
        case 'name':
          return plant.name;
        case 'type':
          return plant.type;
        case 'output':
          return snapshot.output ?? -1;
        case 'capacity':
          return plant.capacity_mw;
      }
    };
    return withSnapshots.sort((a, b) => {
      const [va, vb] = [value(a), value(b)];
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr');
      return sort.desc ? -cmp : cmp;
    });
  }, [plants, generation, index, sort]);

  if (plantsStatus === 'error') {
    return <p className={styles.timeHint}>Impossible de charger la liste des centrales.</p>;
  }

  return (
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
        {rows.map(({ plant, snapshot }) => (
          <tr
            key={plant.id}
            className={hoveredPlantId === plant.id ? styles.rowHover : styles.row}
            onClick={() => selectPlant(plant.id)}
            onMouseEnter={() => setHoveredPlantId(plant.id)}
            onMouseLeave={() => setHoveredPlantId(null)}
          >
            <td>
              {plant.name}
              <div className={styles.rowSub}>
                {snapshot.output === null ? 'Pas de donnée' : `${snapshot.running}/${snapshot.reactors} en marche`}
              </div>
            </td>
            <td className={styles.hideNarrow}>
              <span className={styles.badge}>Nucléaire</span>
            </td>
            <td className={styles.numeric}>{formatMW(snapshot.output)}</td>
            <td className={styles.numeric}>{formatMW(plant.capacity_mw)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
