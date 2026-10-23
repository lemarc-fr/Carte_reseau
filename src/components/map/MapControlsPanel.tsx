'use client';

import React, { useEffect, useState } from 'react';
import { useMapStore, type ProductionType } from '@/store/useMapStore';
import {
  BatteryIcon,
  BiomassIcon,
  CapacityRingIcon,
  CoalIcon,
  GasIcon,
  GridBoundariesIcon,
  HydroIcon,
  NormaliseIcon,
  NuclearIcon,
  OilIcon,
  PumpedStorageIcon,
  SolarIcon,
  WindIcon,
  WindParticlesIcon,
} from '@/components/icons';
import { DETAIL_MIN_ZOOM, WIND_PALETTE } from '@/config/mapConfig';
import { ASSET_TYPE_ORDER, ASSET_TYPES } from '@/config/assetTypes';
import { formatShortDateTime } from '@/lib/generationUtils';
import styles from './Map.module.css';

const ICONS: Record<ProductionType, React.ReactNode> = {
  nuclear: <NuclearIcon size={15} />,
  hydro: <HydroIcon size={15} />,
  pumpedStorage: <PumpedStorageIcon size={15} />,
  wind: <WindIcon size={15} />,
  solar: <SolarIcon size={15} />,
  gas: <GasIcon size={15} />,
  coal: <CoalIcon size={15} />,
  oil: <OilIcon size={15} />,
  biomass: <BiomassIcon size={15} />,
  battery: <BatteryIcon size={15} />,
};

const WIND_MAX = WIND_PALETTE[WIND_PALETTE.length - 1][0];
const WIND_GRADIENT = `linear-gradient(to right, ${WIND_PALETTE.map(
  ([speed, [r, g, b]]) => `rgb(${r}, ${g}, ${b}) ${((speed / WIND_MAX) * 100).toFixed(1)}%`
).join(', ')})`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={styles.panelSection}>
      <button type="button" className={styles.sectionToggle} aria-expanded={open} onClick={() => setOpen(!open)}>
        {title}
        <span className={open ? styles.chevron : styles.chevronClosed} aria-hidden>
          ▲
        </span>
      </button>
      {open && children}
    </div>
  );
}

interface ItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  layer?: boolean;
  note?: string;
  disabled?: boolean;
  onClick?: () => void;
}

function Item({ icon, label, active = false, layer = false, note, disabled, onClick }: ItemProps) {
  const className = active ? (layer ? styles.layerActive : styles.itemActive) : styles.item;
  return (
    <button type="button" className={className} aria-pressed={active} disabled={disabled} onClick={onClick}>
      <span className={styles.itemIcon}>{icon}</span>
      {label}
      {note && <span className={styles.itemNote}>{note}</span>}
    </button>
  );
}

export default function MapControlsPanel() {
  const open = useMapStore((s) => s.controlsOpen);
  const setOpen = useMapStore((s) => s.setControlsOpen);
  const capacityRingVisible = useMapStore((s) => s.capacityRingVisible);
  const toggleCapacityRing = useMapStore((s) => s.toggleCapacityRing);
  const normalizeRing = useMapStore((s) => s.normalizeRing);
  const toggleNormalizeRing = useMapStore((s) => s.toggleNormalizeRing);
  const labelsVisible = useMapStore((s) => s.labelsVisible);
  const toggleLabels = useMapStore((s) => s.toggleLabels);
  const productionTypes = useMapStore((s) => s.productionTypes);
  const toggleProductionType = useMapStore((s) => s.toggleProductionType);
  const windVisible = useMapStore((s) => s.windVisible);
  const windStatus = useMapStore((s) => s.windStatus);
  const windLayers = useMapStore((s) => s.windLayers);
  const toggleWind = useMapStore((s) => s.toggleWind);
  const powerLinesVisible = useMapStore((s) => s.powerLinesVisible);
  const togglePowerLines = useMapStore((s) => s.togglePowerLines);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className={styles.panel} role="dialog" aria-label="Contrôles de la carte">
      <div className={styles.panelHeader}>
        Contrôles de la carte
        <button type="button" className={styles.panelClose} aria-label="Fermer" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>

      <Section title="Options d'affichage">
        <Item icon={<CapacityRingIcon size={15} />} label="Anneau de capacité" active={capacityRingVisible} onClick={toggleCapacityRing} />
        <Item icon={<NormaliseIcon size={15} />} label="Normaliser" active={normalizeRing} onClick={toggleNormalizeRing} />
        <Item icon={<span style={{ fontWeight: 700, fontSize: 13 }}>Aa</span>} label="Noms des centrales" active={labelsVisible} onClick={toggleLabels} />
      </Section>

      <Section title="Filières">
        {ASSET_TYPE_ORDER.map((type) => {
          const { storeKey, label } = ASSET_TYPES[type];
          return (
            <Item
              key={type}
              icon={ICONS[storeKey]}
              label={label}
              active={productionTypes[storeKey]}
              onClick={() => toggleProductionType(storeKey)}
            />
          );
        })}
        <div className={styles.layerInfo}>
          À partir du zoom {DETAIL_MIN_ZOOM} : emprise des sites et installations (éoliennes, panneaux…) d&apos;OpenStreetMap
        </div>
      </Section>

      <Section title="Couches">
        <Item icon={<WindParticlesIcon width={16} height={16} stroke="currentColor" />} label="Vent" layer active={windVisible} onClick={toggleWind} />
        {windVisible && (
          <div className={styles.layerInfo}>
            À 10 m du sol
            {windStatus === 'loading' && ' · chargement…'}
            {windStatus === 'error' && ' · indisponible'}
            {windLayers.map((layer) => (
              <div key={layer.id}>
                {layer.id === 'france' ? 'France' : 'Europe'} : {layer.model}, prévision pour le{' '}
                {formatShortDateTime(layer.validTime)}
                {layer.runTime !== null && ` (run du ${formatShortDateTime(layer.runTime)})`}
              </div>
            ))}
            <div className={styles.scale} style={{ background: WIND_GRADIENT }} />
            <div className={styles.scaleLabels}>
              <span>0</span>
              <span>{Math.round(WIND_MAX)} m/s</span>
            </div>
          </div>
        )}
        <Item icon={<GridBoundariesIcon size={15} />} label="Lignes électriques" layer active={powerLinesVisible} onClick={togglePowerLines} />
        {powerLinesVisible && <div className={styles.layerInfo}>Open Infrastructure Map (OpenStreetMap)</div>}
      </Section>
    </div>
  );
}
