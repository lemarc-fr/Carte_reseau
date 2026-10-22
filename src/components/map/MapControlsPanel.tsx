'use client';

import React, { useEffect, useState } from 'react';
import { useMapStore, type ProductionType } from '@/store/useMapStore';
import {
  BatteryIcon,
  BiomassIcon,
  CapacityRingIcon,
  GasIcon,
  GridBoundariesIcon,
  HydroIcon,
  NormaliseIcon,
  NuclearIcon,
  PumpedStorageIcon,
  SolarIcon,
  WindIcon,
  WindParticlesIcon,
} from '@/components/icons';
import { WIND_PALETTE } from '@/config/mapConfig';
import styles from './Map.module.css';

// Filières à venir : affichées mais désactivées tant que leurs données ne sont pas ingérées
const UPCOMING_TYPES: { key: ProductionType; label: string; icon: React.ReactNode }[] = [
  { key: 'wind', label: 'Éolien', icon: <WindIcon size={16} /> },
  { key: 'solar', label: 'Solaire', icon: <SolarIcon size={16} /> },
  { key: 'gas', label: 'Gaz', icon: <GasIcon size={16} /> },
  { key: 'hydro', label: 'Hydraulique', icon: <HydroIcon size={16} /> },
  { key: 'pumpedStorage', label: 'Pompage-turbinage', icon: <PumpedStorageIcon size={16} /> },
  { key: 'biomass', label: 'Biomasse', icon: <BiomassIcon size={16} /> },
  { key: 'battery', label: 'Batterie', icon: <BatteryIcon size={16} /> },
];

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
  const nuclearVisible = useMapStore((s) => s.productionTypes.nuclear);
  const toggleProductionType = useMapStore((s) => s.toggleProductionType);
  const windVisible = useMapStore((s) => s.windVisible);
  const windStatus = useMapStore((s) => s.windStatus);
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
        <Item icon={<NuclearIcon size={15} />} label="Nucléaire" active={nuclearVisible} onClick={() => toggleProductionType('nuclear')} />
        {UPCOMING_TYPES.map(({ key, label, icon }) => (
          <Item key={key} icon={icon} label={label} note="bientôt" disabled />
        ))}
      </Section>

      <Section title="Couches">
        <Item icon={<WindParticlesIcon width={16} height={16} stroke="currentColor" />} label="Vent" layer active={windVisible} onClick={toggleWind} />
        {windVisible && (
          <div className={styles.layerInfo}>
            AROME · Météo-France · 10 m
            {windStatus === 'loading' && ' · chargement…'}
            {windStatus === 'error' && ' · indisponible'}
            <div className={styles.scale} style={{ background: WIND_GRADIENT }} />
            <div className={styles.scaleLabels}>
              <span>0</span>
              <span>{Math.round(WIND_MAX)} m/s</span>
            </div>
          </div>
        )}
        <Item icon={<GridBoundariesIcon size={15} />} label="Lignes électriques" layer active={powerLinesVisible} onClick={togglePowerLines} />
        {powerLinesVisible && <div className={styles.layerInfo}>Open Infrastructure Map · haute tension</div>}
      </Section>
    </div>
  );
}
