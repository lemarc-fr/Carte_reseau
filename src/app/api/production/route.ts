import { NextRequest, NextResponse } from 'next/server';
import { upsertReading, upsertReadingsBulk, getReadingsByReactor } from '@/lib/crud';
import type { Granularity } from '@prisma/client';

// GET /api/production?eic_code=...&from=...&to=...&granularity=HOUR|DAY
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eic_code = searchParams.get('eic_code');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const granularity = searchParams.get('granularity') as Granularity | null;

  if (!eic_code) {
    return NextResponse.json(
      { error: "Le paramètre eic_code est requis (utilisez /api/production/cumulative pour l'agrégat toutes centrales)" },
      { status: 400 }
    );
  }

  const data = await getReadingsByReactor(eic_code, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    granularity: granularity ?? undefined,
  });

  return NextResponse.json(data);
}

// POST /api/production
// Body : un seul relevé { eic_code, name, production_type, start_date, value, ... }
// ou un lot : { readings: [ {...}, {...} ] } (ex. les 57 centrales d'un même créneau)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (Array.isArray(body?.readings)) {
      const result = await upsertReadingsBulk(body.readings);
      return NextResponse.json({ count: result.length }, { status: 201 });
    }
    if (Array.isArray(body)) {
      const result = await upsertReadingsBulk(body);
      return NextResponse.json({ count: result.length }, { status: 201 });
    }

    const result = await upsertReading(body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Échec de l'enregistrement" }, { status: 500 });
  }
}
