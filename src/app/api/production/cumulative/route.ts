import { NextRequest, NextResponse } from 'next/server';
import { getCumulativeProduction } from '@/lib/crud';

// GET /api/production/cumulative?from=2026-04-01T00:00:00Z&to=2026-04-08T00:00:00Z&bucket=day
// bucket = 'hour' | 'day' (défaut 'day'). Pour un range > 7 jours, préférez 'day'
// puisque les données horaires converties n'existent plus au-delà de la rétention.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const bucket = (searchParams.get('bucket') as 'hour' | 'day') ?? 'day';

  if (!from || !to) {
    return NextResponse.json({ error: 'Les paramètres from et to (ISO 8601) sont requis' }, { status: 400 });
  }

  const data = await getCumulativeProduction(new Date(from), new Date(to), bucket);

  // SUM() sur une colonne float reste un number, mais on force le typage
  // proprement pour la sérialisation JSON côté client (chart).
  const serializable = data.map((row) => ({
    bucket: row.bucket,
    total_value: Number(row.total_value),
  }));

  return NextResponse.json(serializable);
}
