import React from 'react';
import MapIconButton from './MapIconButton';
import { WindParticlesIcon } from '@/components/icons';
import { useMapStore } from '@/store/useMapStore';

const PANEL_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.9)',
  borderRadius: 4,
  boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
  overflow: 'hidden',
  marginBottom: 10,
};

export default function WindTogglePanel() {
  // Sélecteurs granulaires — seule une re-render si windVisible change
  const windVisible = useMapStore((s) => s.windVisible);
  const toggleWind = useMapStore((s) => s.toggleWind);

  return (
      <div style={PANEL_STYLE}>
        <MapIconButton
            icon={<WindParticlesIcon width={18} height={18} stroke="currentColor" />}
            active={windVisible}
            title={windVisible ? 'Masquer les couches de vent' : 'Afficher les couches de vent'}
            onClick={toggleWind}
        />
      </div>
  );
}