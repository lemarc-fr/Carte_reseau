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
import { formatDayTick, formatMW, formatSlot, HOUR_MS, midnightTicks } from '@/lib/generationUtils';
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
const MARGIN = { top: 6, right: 6, bottom: 0, left: 0 };
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
  // Les valeurs négatives (pompage des STEP) s'empilent sous zéro (stackOffset="sign")
  let maxStack = 0;
  let minStack = 0;
  for (const row of rows) {
    let positive = 0;
    let negative = 0;
    for (const s of series) {
      const value = row[s.key] ?? 0;
      if (value > 0) positive += value;
      else negative += value;
    }
    maxStack = Math.max(maxStack, positive);
    minStack = Math.min(minStack, negative);
  }
  const yMax = Math.max(maxStack, capacity ?? 0) * 1.08 || 1;
  const step = niceStep((yMax - minStack) / divisor) * divisor;
  const yMin = minStack < 0 ? -Math.ceil(-minStack / step) * step : 0;
  const yTicks = Array.from({ length: Math.floor((yMax - yMin) / step) + 1 }, (_, i) => yMin + i * step);
  const yAxisWidth = unit === 'GW' ? 30 : 40;

  // L'instant cliqué se déduit de la position horizontale dans la zone de tracé
  // (fonctionne aussi au toucher, sans survol préalable)
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSelectTime) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const plotLeft = MARGIN.left + yAxisWidth;
    const plotWidth = rect.width - plotLeft - MARGIN.right;
    const x = e.clientX - rect.left - plotLeft;
    if (plotWidth <= 0 || x < 0 || x > plotWidth) return;
    const t = from + (x / plotWidth) * (to - from);
    onSelectTime(Math.floor(t / HOUR_MS) * HOUR_MS);
  };

  return (
    <div onClick={handleClick} style={{ cursor: onSelectTime ? 'pointer' : undefined }}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={rows} margin={MARGIN} stackOffset="sign">
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
            domain={[yMin, yMax]}
            ticks={yTicks}
            tickFormatter={(v: number) => formatMW(v / divisor)}
            tick={TICK_STYLE}
            tickLine={{ stroke: AXIS_COLOR }}
            axisLine={{ stroke: AXIS_COLOR }}
            width={yAxisWidth}
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
          {yMin < 0 && <ReferenceLine y={0} stroke="#2d3748" strokeWidth={1} />}
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
    </div>
  );
}
