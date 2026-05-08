import React from 'react';
import MapIconButton from './MapIconButton';
import {
  WindIcon, SolarIcon, GasIcon, NuclearIcon,
  BiomassIcon, BatteryIcon, HydroIcon, PumpedStorageIcon,
} from '@/components/icons';
import { useMapStore, ProductionType } from '@/store/useMapStore';

// La liste reste ici car c'est une constante de présentation,
// pas un état — elle n'a rien à faire dans le store.
export const PRODUCTION_TYPES: { key: ProductionType; label: string; icon: React.ReactNode }[] = [
  { key: 'wind',          label: 'Éolien',             icon: <WindIcon size={18} /> },
  { key: 'solar',         label: 'Solaire',             icon: <SolarIcon size={18} /> },
  { key: 'gas',           label: 'Gaz',                 icon: <GasIcon size={18} /> },
  { key: 'nuclear',       label: 'Nucléaire',           icon: <NuclearIcon size={18} /> },
  { key: 'biomass',       label: 'Biomasse',            icon: <BiomassIcon size={18} /> },
  { key: 'battery',       label: 'Batterie',            icon: <BatteryIcon size={18} /> },
  { key: 'hydro',         label: 'Hydraulique',         icon: <HydroIcon size={18} /> },
  { key: 'pumpedStorage', label: 'Pompage-turbinage',   icon: <PumpedStorageIcon size={18} /> },
];

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

export default function ProductionTypesPanel() {
  const productionTypes = useMapStore((s) => s.productionTypes);
  const toggleProductionType = useMapStore((s) => s.toggleProductionType);

  return (
      <div style={PANEL_STYLE}>
        {PRODUCTION_TYPES.map(({ key, label, icon }, idx) => (
            <React.Fragment key={key}>
              {idx > 0 && <div style={DIVIDER_STYLE} />}
              <MapIconButton
                  icon={icon}
                  active={productionTypes[key]}
                  title={label}
                  onClick={() => toggleProductionType(key)}
              />
            </React.Fragment>
        ))}
      </div>
  );
}