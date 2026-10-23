'use client';

import { useMemo } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { useCurrentSlot } from '@/hooks/useCurrentSlot';
import {
  buildRows,
  formatDate,
  formatMW,
  formatOutput,
  formatPercent,
  formatUpdated,
  plantSnapshot,
  regionalLoadFactor,
  unitOutput,
} from '@/lib/generationUtils';
import { ASSET_TYPES, TECHNOLOGY_LABELS } from '@/config/assetTypes';
import StackedChart, { PASTEL, PASTEL_STROKE, type ChartSeries } from '@/components/charts/StackedChart';
import { unitLabel } from './unitLabel';
import TypeBadge from './TypeBadge';
import type { PlantInfo } from '@/types/energy';
import styles from './Sidebar.module.css';

export default function PlantDetail({ plant }: { plant: PlantInfo }) {
  const selectPlant = useMapStore((s) => s.selectPlant);
  const setSelectedTime = useMapStore((s) => s.setSelectedTime);
  const { generation, index, slotStart } = useCurrentSlot();
  const snapshot = plantSnapshot(plant, generation, index);
  const style = ASSET_TYPES[plant.type];

  // Une série par groupe RTE, ou une seule série estimée (capacité × taux de charge régional)
  const series = useMemo<ChartSeries[]>(
    () =>
      plant.units.length
        ? plant.units.map((unit, i) => ({
            key: unit.eic_code,
            label: unitLabel(unit.name),
            fill: PASTEL[i % PASTEL.length],
            stroke: PASTEL_STROKE[i % PASTEL_STROKE.length],
          }))
        : [{ key: 'estimate', label: 'Production estimée', fill: style.chartFill, stroke: style.chartStroke }],
    [plant, style]
  );

  const rows = useMemo(() => {
    if (!generation) return [];
    if (plant.units.length) {
      return buildRows(
        generation,
        plant.units.map((unit) => ({ key: unit.eic_code, value: (i: number) => unitOutput(generation, unit, i) }))
      );
    }
    return buildRows(generation, [
      {
        key: 'estimate',
        value: (i: number) => {
          const factor = regionalLoadFactor(generation, plant, i);
          return factor === null ? null : plant.capacity_mw * factor;
        },
      },
    ]);
  }, [generation, plant]);

  const hasData = rows.some((row) => series.some((s) => row[s.key] !== null));
  const location = [plant.commune, plant.departement, plant.region].filter(Boolean).join(', ');
  const technology = plant.technology ? (TECHNOLOGY_LABELS[plant.technology] ?? plant.technology) : null;
  const pumping = snapshot.output !== null && snapshot.output < 0;
  const unitWord = plant.type === 'nuclear' ? 'réacteur' : 'groupe';

  return (
    <section>
      <button type="button" className={styles.buttonBlock} onClick={() => selectPlant(null)}>
        Retour à la liste
      </button>

      <div className={styles.detailHeader}>
        <h2 className={styles.detailTitle}>{plant.name}</h2>
        <span
          className={styles.outputBadge}
          title={snapshot.estimated ? 'Production estimée sur le créneau affiché' : 'Production sur le créneau affiché'}
        >
          <span className={snapshot.output ? styles.outputDotOn : styles.outputDot} />
          {pumping ? `Pompage ${formatMW(-snapshot.output!)}` : formatOutput(snapshot.output, snapshot.estimated)} MW
        </span>
      </div>
      <p className={styles.muted}>
        {plant.full_name}
        {generation?.updatedAt != null && !snapshot.estimated && (
          <> · Données mises à jour {formatUpdated(generation.updatedAt)}</>
        )}
      </p>

      {snapshot.estimated && (
        <p className={styles.note}>
          RTE ne publie pas la production de ce site. Elle est estimée à partir de sa puissance installée et du taux de
          charge {plant.type === 'wind' ? "de l'éolien" : "de l'hydraulique"}
          {plant.region ? ` en ${plant.region}` : ''} (éCO2mix).
          {!plant.region_code || plant.region_code === '94' ? ' Cette région n’est pas couverte par éCO2mix.' : ''}
        </p>
      )}

      {plant.units.length > 1 && (
        <div className={styles.legend}>
          {series.map((s) => (
            <span key={s.key} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: s.fill, borderColor: s.stroke }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      <div className={styles.chartSection}>
        <div className={styles.chartLabel}>
          ↑ {snapshot.estimated ? 'Production estimée' : 'Production'} (MW)
          {plant.type === 'pumped_storage' && ' · négatif : pompage'}
        </div>
        <div className={styles.chartBox}>
          {generation && hasData ? (
            <StackedChart
              rows={rows}
              series={series}
              from={generation.from}
              to={generation.to}
              cursor={slotStart}
              capacity={plant.capacity_mw}
              capacityLabel={`Capacité : ${formatMW(plant.capacity_mw)} MW`}
              unit="MW"
              height={180}
              onSelectTime={setSelectedTime}
            />
          ) : (
            <div className={styles.chartPlaceholder}>{generation ? 'Aucune donnée sur cette période' : 'Chargement…'}</div>
          )}
        </div>
      </div>

      <dl className={styles.facts}>
        <dt>Filière</dt>
        <dd>
          <TypeBadge plant={plant} />
          {technology && technology !== style.label && plant.technology !== 'offshore' && ` ${technology}`}
        </dd>
        {plant.operator && (
          <>
            <dt>Exploitant</dt>
            <dd>{plant.operator}</dd>
          </>
        )}
        <dt>Localisation</dt>
        <dd>{location || '–'}</dd>
        <dt>Mise en service</dt>
        <dd>
          {formatDate(plant.commissioning_date)}
          {plant.type === 'wind' && plant.installations && plant.installations > 1 ? ' (la plus ancienne)' : ''}
        </dd>
        {plant.installations !== null && (
          <>
            <dt>Installations</dt>
            <dd>{plant.installations} au registre national</dd>
          </>
        )}
        <dt>Facteur de charge</dt>
        <dd>
          {snapshot.output === null || pumping ? '–' : `${snapshot.estimated ? '≈ ' : ''}${formatPercent(snapshot.output / plant.capacity_mw)}`}
        </dd>
        {snapshot.units > 0 && (
          <>
            <dt>En marche</dt>
            <dd>
              {snapshot.output === null
                ? '–'
                : `${snapshot.running} ${unitWord}${snapshot.running > 1 ? 's' : ''} sur ${snapshot.units}`}
            </dd>
          </>
        )}
        <dt>Sources</dt>
        <dd>
          {[
            plant.wikidata_id && (
              <a key="wd" href={`https://www.wikidata.org/wiki/${plant.wikidata_id}`} target="_blank" rel="noreferrer">
                Wikidata
              </a>
            ),
            plant.osm_id && (
              <a key="osm" href={`https://www.openstreetmap.org/${plant.osm_id}`} target="_blank" rel="noreferrer">
                OpenStreetMap
              </a>
            ),
            <a
              key="odre"
              href="https://odre.opendatasoft.com/explore/dataset/registre-national-installation-production-stockage-electricite-agrege/"
              target="_blank"
              rel="noreferrer"
            >
              Registre ODRE
            </a>,
          ]
            .filter(Boolean)
            .flatMap((link, i) => (i ? [' · ', link] : [link]))}
        </dd>
      </dl>

      {plant.units.length > 0 && (
        <>
          <h3 className={styles.sectionTitle}>{plant.type === 'nuclear' ? 'Réacteurs' : 'Groupes publiés par RTE'}</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{plant.type === 'nuclear' ? 'Réacteur' : 'Groupe'}</th>
                <th title="Année de mise en service">Depuis</th>
                <th className={styles.numeric}>Prod. (MW)</th>
                <th className={styles.numeric}>Cap. (MW)</th>
              </tr>
            </thead>
            <tbody>
              {plant.units.map((unit, i) => {
                const output = unitOutput(generation, unit, index);
                return (
                  <tr key={unit.eic_code}>
                    <td className={styles.nowrap} title={`Code EIC ${unit.eic_code}`}>
                      <span
                        className={output ? styles.statusDotOn : styles.statusDot}
                        title={output === null ? 'Pas de donnée' : output > 0 ? 'En marche' : output < 0 ? 'Pompage' : "À l'arrêt"}
                      />
                      <span className={styles.unitSwatch} style={{ background: PASTEL[i % PASTEL.length] }} />
                      {unitLabel(unit.name)}
                    </td>
                    <td>{unit.commissioning_date ? new Date(unit.commissioning_date).getFullYear() : '–'}</td>
                    <td className={styles.numeric}>{formatMW(output)}</td>
                    <td className={styles.numeric}>{formatMW(unit.capacity_mw)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
