import { NextRequest, NextResponse } from 'next/server';
import { getGenerationSeries } from '@/lib/energy';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SPAN_MS = 7 * DAY_MS;
const MAX_SPAN_MS = 31 * DAY_MS;

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// GET /api/generation?from=ISO&to=ISO
// Production horaire par réacteur (matrice compacte, voir GenerationSeries).
// Par défaut : les 7 derniers jours. Fenêtre limitée à 31 jours.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const to = parseDate(searchParams.get('to')) ?? new Date();
  const from = parseDate(searchParams.get('from')) ?? new Date(to.getTime() - DEFAULT_SPAN_MS);

  if (from >= to || to.getTime() - from.getTime() > MAX_SPAN_MS) {
    return NextResponse.json({ error: 'Fenêtre invalide (from < to, 31 jours maximum)' }, { status: 400 });
  }

  try {
    const data = await getGenerationSeries(from, to);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  } catch (err) {
    console.error('[api/generation]', err);
    return NextResponse.json({ error: 'Production indisponible' }, { status: 503 });
  }
}
