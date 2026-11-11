'use client';

import { usePlotArea } from 'recharts';

/** Cadre de la zone de tracé : les axes n'en dessinent que la gauche et le bas. */
export default function PlotFrame({ stroke }: { stroke: string }) {
  const area = usePlotArea();
  if (!area) return null;
  return (
    <rect x={area.x} y={area.y} width={area.width} height={area.height} fill="none" stroke={stroke} pointerEvents="none" />
  );
}
