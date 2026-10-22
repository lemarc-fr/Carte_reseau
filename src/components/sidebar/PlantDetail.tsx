'use client';

import { useMemo } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { useCurrentSlot } from '@/hooks/useCurrentSlot';
import {
  formatDate,
  formatMW,
  formatPercent,
  formatUpdated,
  plantSnapshot,
  reactorOutput,
  stackedRows,
} from '@/lib/generationUtils';
import StackedChart, { PASTEL, PASTEL_STROKE, type ChartSeries } from '@/components/charts/StackedChart';
import { reactorLabel } from './labels';
import type { PlantInfo } from '@/types/energy';
import styles from './Sidebar.module.css';

export default function PlantDetail({ plant }: { plant: PlantInfo }) {
  const selectPlant = useMapStore((s) => s.selectPlant);
  const setSelectedTime = useMapStore((s) => s.setSelectedTime);
  const { generation, index, slotStart } = useCurrentSlot();
  const snapshot = plantSnapshot(plant, generation, index);

  const series = useMemo<ChartSeries[]>(
    () =>
      plant.reactors.map((reactor, i) => ({
        key: reactor.eic_code,
        label: reactorLabel(reactor.name),
        fill: PASTEL[i % PASTEL.length],
        stroke: PASTEL_STROKE[i % PASTEL_STROKE.length],
      })),
    [plant]
  );

  const rows = useMemo(
    () => (generation ? stackedRows(generation, plant.reactors.map((r) => ({ key: r.eic_code, eics: [r.eic_code] }))) : []),
    [generation, plant]
  );

  const location = [plant.commune, plant.departement, plant.region].filter(Boolean).join(', ');

  return (
    <section>
      <button type="button" className={styles.buttonBlock} onClick={() => selectPlant(null)}>
        Retour à la liste
      </button>

      <div className={styles.detailHeader}>
        <h2 className={styles.detailTitle}>{plant.name}</h2>
        <span className={styles.outputBadge} title="Production sur le créneau affiché">
          <span className={snapshot.output ? styles.outputDotOn : styles.outputDot} />
          {formatMW(snapshot.output)} MW
        </span>
      </div>
      <p className={styles.muted}>
        {plant.full_name}
        {generation?.updatedAt != null && <> · Données mises à jour {formatUpdated(generation.updatedAt)}</>}
      </p>

      <div className={styles.legend}>
        {series.map((s) => (
          <span key={s.key} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: s.fill, borderColor: s.stroke }} />
            {s.label}
          </span>
        ))}
      </div>

      <div className={styles.chartSection}>
        <div className={styles.chartLabel}>↑ Production (MW)</div>
        <div className={styles.chartBox}>
          {generation && rows.length > 0 ? (
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
        <dt>Exploitant</dt>
        <dd>{plant.operator ?? '–'}</dd>
        <dt>Localisation</dt>
        <dd>{location || '–'}</dd>
        <dt>Mise en service</dt>
        <dd>{formatDate(plant.commissioning_date)}</dd>
        <dt>Facteur de charge</dt>
        <dd>{snapshot.output === null ? '–' : formatPercent(snapshot.output / plant.capacity_mw)}</dd>
        <dt>En marche</dt>
        <dd>
          {snapshot.output === null ? '–' : `${snapshot.running} réacteur${snapshot.running > 1 ? 's' : ''} sur ${snapshot.reactors}`}
        </dd>
        <dt>Sources</dt>
        <dd>
          {plant.wikidata_id && (
            <a href={`https://www.wikidata.org/wiki/${plant.wikidata_id}`} target="_blank" rel="noreferrer">
              Wikidata
            </a>
          )}
          {plant.wikidata_id && plant.osm_id && ' · '}
          {plant.osm_id && (
            <a href={`https://www.openstreetmap.org/${plant.osm_id}`} target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>
          )}
        </dd>
      </dl>

      <h3 className={styles.sectionTitle}>Réacteurs</h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Réacteur</th>
            <th title="Année de mise en service">Depuis</th>
            <th className={styles.numeric}>Prod. (MW)</th>
            <th className={styles.numeric}>Cap. (MW)</th>
          </tr>
        </thead>
        <tbody>
          {plant.reactors.map((reactor, i) => {
            const output = reactorOutput(generation, reactor.eic_code, index);
            return (
              <tr key={reactor.eic_code}>
                <td className={styles.nowrap} title={`Code EIC ${reactor.eic_code}`}>
                  <span
                    className={output ? styles.statusDotOn : styles.statusDot}
                    title={output === null ? 'Pas de donnée' : output > 0 ? 'En marche' : "À l'arrêt"}
                  />
                  <span className={styles.swatch} style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 6, background: PASTEL[i % PASTEL.length] }} />
                  {reactorLabel(reactor.name)}
                </td>
                <td>{reactor.commissioning_date ? new Date(reactor.commissioning_date).getFullYear() : '–'}</td>
                <td className={styles.numeric}>{formatMW(output)}</td>
                <td className={styles.numeric}>{formatMW(reactor.capacity_mw)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
