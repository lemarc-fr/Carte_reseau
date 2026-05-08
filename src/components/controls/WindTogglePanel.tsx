import React from 'react';
import MapIconButton from './MapIconButton';
import { WindParticlesIcon } from '@/components/icons';

const PANEL_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.9)',
  borderRadius: 4,
  boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
  overflow: 'hidden',
  marginBottom: 10,
};

interface WindTogglePanelProps {
  active: boolean;
  onToggle: () => void;
}

export default function WindTogglePanel({ active, onToggle }: WindTogglePanelProps) {
  return (
    <div style={PANEL_STYLE}>
      <MapIconButton
        icon={<WindParticlesIcon width={18} height={18} stroke="currentColor" />}
        active={active}
        title={active ? 'Masquer les couches de vent' : 'Afficher les couches de vent'}
        onClick={onToggle}
      />
    </div>
  );
}
