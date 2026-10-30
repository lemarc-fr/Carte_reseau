'use client';

import { useMemo } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { useCurrentSlot } from '@/hooks/useCurrentSlot';
import { buildRows, exchangeFlow, exchangeTotals, formatEuros, formatMW, price } from '@/lib/generationUtils';
import type { Interconnection } from '@/config/interconnections';
import StackedChart, { type ChartSeries } from '@/components/charts/StackedChart';
import LineChart, { type LineSeries } from '@/components/charts/LineChart';
import styles from './Sidebar.module.css';

// Import (achat) en orange, export (vente) en vert, comme les arcs de la carte
export const EXCHANGE_COLORS = {
  import: { fill: '#fbd3b0', stroke: '#d6602a' },
  export: { fill: '#bfe3c6', stroke: '#2e9e4a' },
};
const PRICE_COLORS = { FR: '#2b6cb0', neighbour: '#b7791f' };

const gwh = (mwh: number) => `${formatMW(mwh / 1000)} GWh`;

export default function LinkDetail({ link }: { link: Interconnection }) {
  const selectLink = useMapStore((s) => s.selectLink);
  const setSelectedTime = useMapStore((s) => s.setSelectedTime);
  const { generation, index, slotStart } = useCurrentSlot();

  const flow = exchangeFlow(generation, link, index);
  const frPrice = price(generation, ['FR'], index);
  const neighbourPrice = price(generation, link.priceCountries, index);

  const flowSeries: ChartSeries[] = [
    { key: 'import', label: 'Import (achat)', ...EXCHANGE_COLORS.import },
    { key: 'export', label: 'Export (vente)', ...EXCHANGE_COLORS.export },
  ];
  const priceSeries: LineSeries[] = [
    { key: 'FR', label: 'France', color: PRICE_COLORS.FR },
    ...(link.priceCountries.length ? [{ key: 'neighbour', label: link.label, color: PRICE_COLORS.neighbour }] : []),
  ];

  const rows = useMemo(() => {
    if (!generation) return { flow: [], price: [] };
    const value = (i: number) => exchangeFlow(generation, link, i);
    return {
      flow: buildRows(generation, [
        { key: 'import', value: (i) => (value(i) === null ? null : Math.max(0, value(i)!)) },
        { key: 'export', value: (i) => (value(i) === null ? null : Math.min(0, value(i)!)) },
      ]),
      price: buildRows(generation, [
        { key: 'FR', value: (i) => price(generation, ['FR'], i) },
        { key: 'neighbour', value: (i) => price(generation, link.priceCountries, i) },
      ]),
    };
  }, [generation, link]);
  const totals = useMemo(() => (generation ? exchangeTotals(generation, link) : null), [generation, link]);
  const hasPrices = rows.price.some((row) => row.FR !== null);

  return (
    <section>
      <button type="button" className={styles.buttonBlock} onClick={() => selectLink(null)}>
        Retour à la liste
      </button>

      <div className={styles.detailHeader}>
        <h2 className={styles.detailTitle}>France ⇄ {link.label}</h2>
        <span className={styles.outputBadge} title="Échange commercial sur le créneau affiché">
          {flow === null ? '– MW' : `${flow > 0 ? 'Import' : 'Export'} ${formatMW(Math.abs(flow))} MW`}
        </span>
      </div>
      <p className={styles.muted}>
        Échanges commerciaux publiés par RTE (éCO2mix) : positif, la France achète (import) ; négatif, elle vend
        (export).
      </p>

      <div className={styles.chartSection}>
        <div className={styles.chartLabel}>↑ Échange (MW) · négatif : export</div>
        <div className={styles.chartBox}>
          {generation && rows.flow.some((r) => r.import !== null) ? (
            <StackedChart
              rows={rows.flow}
              series={flowSeries}
              from={generation.from}
              to={generation.to}
              cursor={slotStart}
              unit="MW"
              height={160}
              onSelectTime={setSelectedTime}
            />
          ) : (
            <div className={styles.chartPlaceholder}>{generation ? 'Aucune donnée sur cette période' : 'Chargement…'}</div>
          )}
        </div>
      </div>

      <div className={styles.chartSection}>
        <div className={styles.chartLabel}>↑ Prix day-ahead (€/MWh)</div>
        <div className={styles.chartBox}>
          {generation && hasPrices ? (
            <LineChart
              rows={rows.price}
              series={priceSeries}
              from={generation.from}
              to={generation.to}
              cursor={slotStart}
              unit="€/MWh"
              height={140}
            />
          ) : (
            <div className={styles.chartPlaceholder}>{generation ? 'Aucun prix sur cette période' : 'Chargement…'}</div>
          )}
        </div>
      </div>

      <dl className={styles.facts}>
        <dt>Prix France</dt>
        <dd>{frPrice === null ? '–' : `${Math.round(frPrice)} €/MWh`}</dd>
        <dt>Prix {link.label}</dt>
        <dd>{neighbourPrice === null ? (link.priceCountries.length ? '–' : 'non publié') : `${Math.round(neighbourPrice)} €/MWh`}</dd>
        <dt>Valeur du créneau</dt>
        <dd>
          {flow === null || frPrice === null
            ? '–'
            : `${formatEuros(Math.abs(flow) * frPrice)} par heure (${flow > 0 ? 'achat' : 'vente'})`}
        </dd>
        {totals && (
          <>
            <dt>Vendu sur la période</dt>
            <dd>
              {gwh(totals.exportMWh)} · {formatEuros(totals.exportEur)}
            </dd>
            <dt>Acheté sur la période</dt>
            <dd>
              {gwh(totals.importMWh)} · {formatEuros(totals.importEur)}
            </dd>
            <dt>Solde</dt>
            <dd>{formatEuros(totals.exportEur - totals.importEur)}</dd>
          </>
        )}
      </dl>
      <p className={styles.note}>
        Valeurs au prix day-ahead français (EPEX Spot, via Energy-Charts / SMARD) : estimation de ce que rapportent les
        ventes et coûtent les achats, hors rente de congestion.
      </p>
    </section>
  );
}
