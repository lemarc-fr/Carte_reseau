import React from 'react';
import MapIconButton from './MapIconButton';
import { WindParticlesIcon, CapacityRingIcon } from '@/components/icons';
import { useMapStore } from '@/store/useMapStore';

const DIVIDER_STYLE: React.CSSProperties = {
    height: 1,
    background: 'rgba(0,0,0,0.1)',
    margin: '0 4px',
};

const PANEL_STYLE: React.CSSProperties = {
    background: 'rgba(255,255,255,0.9)',
    borderRadius: 4,
    boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
    overflow: 'hidden',
};

export default function WindTogglePanel() {
  const windVisible = useMapStore((s) => s.windVisible);
  const toggleWind = useMapStore((s) => s.toggleWind);

  const normalizeRing = useMapStore((s) => s.normalizeRing);
  const toogleNormalizeWind = useMapStore((s) => s.toggleNormalizeRing)
  return (
      <div style={PANEL_STYLE}>
        <MapIconButton
            icon={<WindParticlesIcon width={18} height={18} stroke="currentColor" />}
            active={windVisible}
            title={windVisible ? 'Masquer les couches de vent' : 'Afficher les couches de vent'}
            onClick={toggleWind}
        />
        <div style={DIVIDER_STYLE} />
        <MapIconButton
            icon={<CapacityRingIcon width={18} height={18} stroke="currentColor" />}
            active={normalizeRing}
            title={normalizeRing ? 'Normaliser les anneaux de capacités de production' : 'Mettre à l\'echelle les anneaux de capacités '}
            onClick={toogleNormalizeWind}
        />
      </div>
  );
}