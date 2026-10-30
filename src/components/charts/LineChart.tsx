'use client';

import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDayTick, formatSlot, midnightTicks } from '@/lib/generationUtils';
import styles from '@/components/sidebar/Sidebar.module.css';

export interface LineSeries {
  key: string;
  label: string;
  color: string;
}

interface LineChartProps {
  rows: Record<string, number | null>[];
  series: LineSeries[];
  from: number;
  to: number;
  cursor: number | null;
  unit: string; // ex. « €/MWh »
  height: number;
}

const AXIS_COLOR = '#2d3748';
const TICK_STYLE = { fontSize: 11, fill: AXIS_COLOR, fontFamily: "'Helvetica Neue', Arial, Helvetica, sans-serif" };
const valueFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** Courbes en escalier (créneaux horaires), curseur sur l'instant affiché (mêmes axes que StackedChart). */
export default function LineChart({ rows, series, from, to, cursor, unit, height }: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={rows} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="#718096" strokeDasharray="1 3" />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={[from, to]}
          ticks={midnightTicks(from, to)}
          tickFormatter={formatDayTick}
          tick={TICK_STYLE}
          tickLine={{ stroke: AXIS_COLOR }}
          axisLine={{ stroke: AXIS_COLOR }}
          allowDataOverflow
        />
        <YAxis
          tickFormatter={(v: number) => valueFormat.format(v)}
          tick={TICK_STYLE}
          tickLine={{ stroke: AXIS_COLOR }}
          axisLine={{ stroke: AXIS_COLOR }}
          width={40}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="stepAfter"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
        {cursor !== null && <ReferenceLine x={cursor} stroke="#e53e3e" strokeWidth={1.5} />}
        <Tooltip
          isAnimationActive={false}
          cursor={{ stroke: '#a0aec0' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className={styles.chartTooltip}>
                <strong>{formatSlot(Number(label))}</strong>
                {payload.map((p) => (
                  <div key={String(p.dataKey)} className={styles.tooltipRow}>
                    <span style={{ color: p.color }}>{p.name}</span>
                    <span>
                      {typeof p.value === 'number' ? valueFormat.format(p.value) : '–'} {unit}
                    </span>
                  </div>
                ))}
              </div>
            );
          }}
        />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}
