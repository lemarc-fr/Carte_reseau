'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDayTick, formatMW, formatSlot, midnightTicks } from '@/lib/generationUtils';
import styles from '@/components/sidebar/Sidebar.module.css';

export interface ChartSeries {
  key: string;
  label: string;
  fill: string;
  stroke: string;
}

// Palette ColorBrewer Pastel1, comme la carte de référence
export const PASTEL = ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6', '#ffffcc', '#e5d8bd', '#fddaec', '#f2f2f2'];
export const PASTEL_STROKE = ['#e8867d', '#7ea6c8', '#93c98a', '#b496bd', '#e9a964', '#d8d87a', '#bba67e', '#e3a3c4', '#bdbdbd'];

const AXIS_COLOR = '#2d3748';
const TICK_STYLE = { fontSize: 11, fill: AXIS_COLOR, fontFamily: "'Helvetica Neue', Arial, Helvetica, sans-serif" };

function niceStep(max: number, targetTicks = 4): number {
  const raw = max / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw);
  return step ?? 10 * magnitude;
}

interface StackedChartProps {
  rows: Record<string, number | null>[];
  series: ChartSeries[];
  from: number;
  to: number;
  cursor: number | null;
  capacity?: number;
  capacityLabel?: string;
  unit: 'GW' | 'MW';
  height: number;
  onSelectTime?: (time: number) => void;
}

/** Aires empilées en escalier (créneaux horaires), curseur sur l'instant affiché. */
export default function StackedChart({
  rows,
  series,
  from,
  to,
  cursor,
  capacity,
  capacityLabel,
  unit,
  height,
  onSelectTime,
}: StackedChartProps) {
  const divisor = unit === 'GW' ? 1000 : 1;
  const maxStack = rows.reduce((max, row) => {
    const total = series.reduce((sum, s) => sum + (row[s.key] ?? 0), 0);
    return Math.max(max, total);
  }, 0);
  const yMax = Math.max(maxStack, capacity ?? 0) * 1.08 || 1;
  const step = niceStep(yMax / divisor) * divisor;
  const yTicks = Array.from({ length: Math.floor(yMax / step) + 1 }, (_, i) => i * step);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={rows}
        margin={{ top: 6, right: 6, bottom: 0, left: 0 }}
        style={{ cursor: onSelectTime ? 'pointer' : undefined }}
        onClick={(state) => {
          const index = state?.activeTooltipIndex;
          if (index === null || index === undefined || !onSelectTime) return;
          const t = rows[Number(index)]?.t;
          if (typeof t === 'number') onSelectTime(t);
        }}
      >
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
          domain={[0, yMax]}
          ticks={yTicks}
          tickFormatter={(v: number) => formatMW(v / divisor)}
          tick={TICK_STYLE}
          tickLine={{ stroke: AXIS_COLOR }}
          axisLine={{ stroke: AXIS_COLOR }}
          width={unit === 'GW' ? 30 : 40}
          allowDataOverflow
        />
        {series.map((s) => (
          <Area
            key={s.key}
            type="stepAfter"
            dataKey={s.key}
            name={s.label}
            stackId="stack"
            fill={s.fill}
            fillOpacity={1}
            stroke={s.stroke}
            strokeWidth={1}
            isAnimationActive={false}
          />
        ))}
        {capacity !== undefined && (
          <ReferenceLine
            y={capacity}
            stroke="#4a5568"
            strokeDasharray="4 3"
            label={capacityLabel ? { value: capacityLabel, position: 'insideTopRight', fontSize: 10, fill: '#718096' } : undefined}
          />
        )}
        {cursor !== null && <ReferenceLine x={cursor} stroke="#e53e3e" strokeWidth={1.5} />}
        <Tooltip
          isAnimationActive={false}
          cursor={{ stroke: '#a0aec0' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const total = payload.reduce((sum, p) => sum + (typeof p.value === 'number' ? p.value : 0), 0);
            return (
              <div className={styles.chartTooltip}>
                <strong>{formatSlot(Number(label))}</strong>
                {payload.length > 1 &&
                  [...payload].reverse().map((p) => (
                    <div key={String(p.dataKey)} className={styles.tooltipRow}>
                      <span>{p.name}</span>
                      <span>{formatMW(typeof p.value === 'number' ? p.value : null)} MW</span>
                    </div>
                  ))}
                <div className={styles.tooltipRow}>
                  <span>Total</span>
                  <span>{formatMW(total)} MW</span>
                </div>
              </div>
            );
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
