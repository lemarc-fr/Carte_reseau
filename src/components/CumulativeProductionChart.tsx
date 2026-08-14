'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface Point {
  bucket: string;
  total_value: number;
}

export default function CumulativeProductionChart({
  from,
  to,
  bucket = 'day',
}: {
  from: string; // ISO 8601
  to: string; // ISO 8601
  bucket?: 'hour' | 'day';
}) {
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/production/cumulative?from=${from}&to=${to}&bucket=${bucket}`)
      .then((res) => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [from, to, bucket]);

  if (loading) return <p>Chargement du graphique…</p>;

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="bucket"
          tickFormatter={(v) =>
            bucket === 'hour'
              ? new Date(v).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit' })
              : new Date(v).toLocaleDateString('fr-FR')
          }
        />
        <YAxis unit=" MW" />
        <Tooltip labelFormatter={(v) => new Date(v as string).toLocaleString('fr-FR')} />
        <Line
          type="monotone"
          dataKey="total_value"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
          name="Production cumulée (toutes centrales)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
