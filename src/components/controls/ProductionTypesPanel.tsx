import React from 'react';
import MapIconButton, { DIVIDER_STYLE } from './MapIconButton';
import {
  BatteryIcon,
  BiomassIcon,
  CoalIcon,
  GasIcon,
  HydroIcon,
  NuclearIcon,
  OilIcon,
  PumpedStorageIcon,
  SolarIcon,
  WindIcon,
} from '@/components/icons';
import { ASSET_TYPE_ORDER, ASSET_TYPES } from '@/config/assetTypes';
import { useMapStore, type ProductionType } from '@/store/useMapStore';

const ICONS: Record<ProductionType, React.ReactNode> = {
  nuclear: <NuclearIcon size={18} />,
  hydro: <HydroIcon size={18} />,
  pumpedStorage: <PumpedStorageIcon size={18} />,
  wind: <WindIcon size={18} />,
  solar: <SolarIcon size={18} />,
  gas: <GasIcon size={18} />,
  coal: <CoalIcon size={18} />,
  oil: <OilIcon size={18} />,
  biomass: <BiomassIcon size={18} />,
  battery: <BatteryIcon size={18} />,
};

// Filières affichées sur la carte
export default function ProductionTypesPanel() {
  const productionTypes = useMapStore((s) => s.productionTypes);
  const toggleProductionType = useMapStore((s) => s.toggleProductionType);

  return (
    <div>
      {ASSET_TYPE_ORDER.map((type, idx) => {
        const { storeKey, label } = ASSET_TYPES[type];
        const active = productionTypes[storeKey];
        return (
          <React.Fragment key={type}>
            {idx > 0 && <div style={DIVIDER_STYLE} />}
            <MapIconButton
              icon={ICONS[storeKey]}
              active={active}
              title={`${label} : ${active ? 'masquer' : 'afficher'}`}
              onClick={() => toggleProductionType(storeKey)}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}
