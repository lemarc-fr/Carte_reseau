import React from 'react';
import MapIconButton, { DIVIDER_STYLE } from './MapIconButton';
import {
  CapacityRingIcon,
  GridBoundariesIcon,
  LabelsIcon,
  LargeUnitsIcon,
  NormaliseIcon,
  WindParticlesIcon,
} from '@/components/icons';
import { LARGE_UNIT_MW } from '@/lib/generationUtils';
import { useMapStore } from '@/store/useMapStore';

// Couches et options d'affichage (vent, anneaux, lignes, noms, filtre des gros groupes)
export default function DisplayPanel() {
  const windVisible = useMapStore((s) => s.windVisible);
  const toggleWind = useMapStore((s) => s.toggleWind);
  const capacityRingVisible = useMapStore((s) => s.capacityRingVisible);
  const toggleCapacityRing = useMapStore((s) => s.toggleCapacityRing);
  const normalizeRing = useMapStore((s) => s.normalizeRing);
  const toggleNormalizeRing = useMapStore((s) => s.toggleNormalizeRing);
  const powerLinesVisible = useMapStore((s) => s.powerLinesVisible);
  const togglePowerLines = useMapStore((s) => s.togglePowerLines);
  const labelsVisible = useMapStore((s) => s.labelsVisible);
  const toggleLabels = useMapStore((s) => s.toggleLabels);
  const largeUnitsOnly = useMapStore((s) => s.largeUnitsOnly);
  const toggleLargeUnitsOnly = useMapStore((s) => s.toggleLargeUnitsOnly);

  const buttons = [
    {
      icon: <WindParticlesIcon width={18} height={18} stroke="currentColor" />,
      active: windVisible,
      title: windVisible ? 'Masquer le vent' : 'Afficher le vent',
      onClick: toggleWind,
    },
    {
      icon: <CapacityRingIcon size={16} />,
      active: capacityRingVisible,
      title: capacityRingVisible ? 'Masquer les anneaux de capacité' : 'Afficher les anneaux de capacité',
      onClick: toggleCapacityRing,
    },
    {
      icon: <NormaliseIcon size={16} />,
      active: normalizeRing,
      title: normalizeRing ? 'Anneaux proportionnels à la capacité' : 'Anneaux de même taille (normaliser)',
      onClick: toggleNormalizeRing,
    },
    {
      icon: <LargeUnitsIcon size={22} />,
      active: largeUnitsOnly,
      title: largeUnitsOnly
        ? 'Afficher tous les sites'
        : `Uniquement les centrales et groupes de ${LARGE_UNIT_MW} MW ou plus`,
      onClick: toggleLargeUnitsOnly,
    },
    {
      icon: <GridBoundariesIcon size={16} />,
      active: powerLinesVisible,
      title: powerLinesVisible ? 'Masquer les lignes électriques' : 'Afficher les lignes électriques',
      onClick: togglePowerLines,
    },
    {
      icon: <LabelsIcon size={20} />,
      active: labelsVisible,
      title: labelsVisible ? 'Masquer les noms des centrales' : 'Afficher les noms des centrales',
      onClick: toggleLabels,
    },
  ];

  return (
    <div>
      {buttons.map((button, idx) => (
        <React.Fragment key={button.title}>
          {idx > 0 && <div style={DIVIDER_STYLE} />}
          <MapIconButton {...button} />
        </React.Fragment>
      ))}
    </div>
  );
}
