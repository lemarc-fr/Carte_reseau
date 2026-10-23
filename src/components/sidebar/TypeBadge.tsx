import { ASSET_TYPES } from '@/config/assetTypes';
import type { PlantInfo } from '@/types/energy';
import styles from './Sidebar.module.css';

/** Badge coloré de la filière (« ÉOLIEN EN MER » pour les parcs en mer). */
export default function TypeBadge({ plant }: { plant: PlantInfo }) {
  const style = ASSET_TYPES[plant.type];
  return (
    <span className={styles.badge} style={{ background: style.badgeBackground, color: style.badgeColor }}>
      {plant.technology === 'offshore' ? 'Éolien en mer' : style.label}
    </span>
  );
}
