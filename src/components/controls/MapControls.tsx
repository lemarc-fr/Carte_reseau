'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useControl } from 'react-map-gl/maplibre';
import {
  BatteryIcon,
  BiomassIcon,
  CapacityRingIcon,
  CoalIcon,
  ExchangesIcon,
  GasIcon,
  GridBoundariesIcon,
  HydroIcon,
  LabelsIcon,
  LargeUnitsIcon,
  NormaliseIcon,
  NuclearIcon,
  OilIcon,
  PumpedStorageIcon,
  SolarIcon,
  WindIcon,
  WindParticlesIcon,
} from '@/components/icons';
import { ASSET_TYPE_ORDER, ASSET_TYPES } from '@/config/assetTypes';
import { formatShortDateTime, formatSlot, LARGE_UNIT_MW } from '@/lib/generationUtils';
import { useMapStore, type ProductionType } from '@/store/useMapStore';
import styles from './MapControls.module.css';

// Options de la carte : un seul bouton parmi les contrôles MapLibre ouvre un panneau
// d'options libellées (affichage, couches, filières), comme sur la GB Renewables Map.

const TYPE_ICONS: Record<ProductionType, React.ReactNode> = {
  nuclear: <NuclearIcon size={16} />,
  hydro: <HydroIcon size={16} />,
  pumpedStorage: <PumpedStorageIcon size={16} />,
  wind: <WindIcon size={16} />,
  solar: <SolarIcon size={16} />,
  gas: <GasIcon size={16} />,
  coal: <CoalIcon size={16} />,
  oil: <OilIcon size={16} />,
  biomass: <BiomassIcon size={16} />,
  battery: <BatteryIcon size={16} />,
};

// Conteneur d'un contrôle MapLibre, rempli par un portail React
class ContainerControl {
  readonly container: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
  }

  onAdd(): HTMLElement {
    return this.container;
  }

  onRemove(): void {
    this.container.remove();
  }
}

function SlidersIcon() {
  return (
    <svg className={styles.buttonIcon} width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M3 5h8m4 0h2M3 10h2m4 0h8M3 15h9m4 0h1" />
      <circle cx="13" cy="5" r="2" fill="#fff" />
      <circle cx="7" cy="10" r="2" fill="#fff" />
      <circle cx="14" cy="15" r="2" fill="#fff" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={open ? 'M5 12.5l5-5 5 5' : 'M5 7.5l5 5 5-5'} />
    </svg>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section>
      <button type="button" className={styles.sectionHeader} aria-expanded={open} onClick={() => setOpen(!open)}>
        {title}
        <Chevron open={open} />
      </button>
      {open && <div className={styles.rows}>{children}</div>}
    </section>
  );
}

interface OptionProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
  swatch?: { fill: readonly number[]; stroke: readonly number[] }; // couleur de la filière sur la carte
}

function Option({ icon, label, active, onClick, title, swatch }: OptionProps) {
  return (
    <button
      type="button"
      className={active ? styles.optionActive : styles.option}
      aria-pressed={active}
      title={title}
      onClick={onClick}
    >
      <span className={styles.optionIcon}>{icon}</span>
      <span className={styles.optionLabel}>{label}</span>
      {swatch && (
        <span
          className={styles.swatch}
          style={
            active
              ? { background: `rgba(${swatch.fill.join(', ')}, 0.55)`, borderColor: `rgb(${swatch.stroke.join(', ')})` }
              : undefined
          }
        />
      )}
    </button>
  );
}

export default function MapControls() {
  const [open, setOpen] = useState(false);
  const control = useControl<ContainerControl>(() => new ContainerControl(), { position: 'top-right' });

  const windVisible = useMapStore((s) => s.windVisible);
  const toggleWind = useMapStore((s) => s.toggleWind);
  const windStatus = useMapStore((s) => s.windStatus);
  const windLayers = useMapStore((s) => s.windLayers);
  const capacityRingVisible = useMapStore((s) => s.capacityRingVisible);
  const toggleCapacityRing = useMapStore((s) => s.toggleCapacityRing);
  const normalizeRing = useMapStore((s) => s.normalizeRing);
  const toggleNormalizeRing = useMapStore((s) => s.toggleNormalizeRing);
  const powerLinesVisible = useMapStore((s) => s.powerLinesVisible);
  const togglePowerLines = useMapStore((s) => s.togglePowerLines);
  const labelsVisible = useMapStore((s) => s.labelsVisible);
  const toggleLabels = useMapStore((s) => s.toggleLabels);
  const exchangesVisible = useMapStore((s) => s.exchangesVisible);
  const toggleExchanges = useMapStore((s) => s.toggleExchanges);
  const largeUnitsOnly = useMapStore((s) => s.largeUnitsOnly);
  const toggleLargeUnitsOnly = useMapStore((s) => s.toggleLargeUnitsOnly);
  const productionTypes = useMapStore((s) => s.productionTypes);
  const toggleProductionType = useMapStore((s) => s.toggleProductionType);
  const setAllProductionTypes = useMapStore((s) => s.setAllProductionTypes);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const allTypesVisible = Object.values(productionTypes).every(Boolean);
  const windAt = windLayers.find((l) => l.id === 'france') ?? windLayers[0];

  return (
    <>
      {createPortal(
        <button
          type="button"
          title="Options de la carte"
          aria-label="Options de la carte"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <SlidersIcon />
        </button>,
        control.container
      )}

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Options de la carte">
          <div className={styles.header}>
            Options de la carte
            <button type="button" className={styles.close} aria-label="Fermer" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>

          <div className={styles.body}>
            <Section title="Affichage">
              <Option
                icon={<CapacityRingIcon size={15} />}
                label="Anneau de capacité"
                title="Cercle proportionnel à la puissance installée du site"
                active={capacityRingVisible}
                onClick={toggleCapacityRing}
              />
              <Option
                icon={<NormaliseIcon size={15} />}
                label="Normaliser les tailles"
                title="Anneaux de même taille : le disque montre le taux de charge"
                active={normalizeRing}
                onClick={toggleNormalizeRing}
              />
              <Option
                icon={<LabelsIcon size={18} />}
                label="Noms des centrales"
                active={labelsVisible}
                onClick={toggleLabels}
              />
              <Option
                icon={<LargeUnitsIcon size={20} />}
                label={`${LARGE_UNIT_MW} MW et plus seulement`}
                title={`Uniquement les centrales et groupes de ${LARGE_UNIT_MW} MW ou plus`}
                active={largeUnitsOnly}
                onClick={toggleLargeUnitsOnly}
              />
            </Section>

            <Section title="Couches">
              <Option
                icon={<WindParticlesIcon width={17} height={17} stroke="currentColor" />}
                label="Vent"
                active={windVisible}
                onClick={toggleWind}
              />
              {windVisible && windStatus === 'ok' && windAt && (
                <p className={styles.note}>
                  {windLayers.map((l) => l.model).join(' et ')} · vent à 10 m · prévision pour{' '}
                  {formatSlot(windAt.validTime)}
                  {windAt.runTime !== null && <> · run du {formatShortDateTime(windAt.runTime)}</>}
                </p>
              )}
              {windVisible && windStatus === 'error' && <p className={styles.note}>Données de vent indisponibles</p>}
              <Option
                icon={<GridBoundariesIcon size={15} />}
                label="Lignes électriques"
                active={powerLinesVisible}
                onClick={togglePowerLines}
              />
              <Option
                icon={<ExchangesIcon size={17} />}
                label="Échanges aux frontières"
                title="Échanges commerciaux de la France avec ses voisins"
                active={exchangesVisible}
                onClick={toggleExchanges}
              />
            </Section>

            <Section title="Filières">
              <button
                type="button"
                className={styles.link}
                onClick={() => setAllProductionTypes(!allTypesVisible)}
              >
                {allTypesVisible ? 'Tout masquer' : 'Tout afficher'}
              </button>
              {ASSET_TYPE_ORDER.map((type) => {
                const { storeKey, label, fill, stroke } = ASSET_TYPES[type];
                return (
                  <Option
                    key={type}
                    icon={TYPE_ICONS[storeKey]}
                    label={label}
                    active={productionTypes[storeKey]}
                    onClick={() => toggleProductionType(storeKey)}
                    swatch={{ fill, stroke }}
                  />
                );
              })}
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
