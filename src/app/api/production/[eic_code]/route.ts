import { NextRequest, NextResponse } from 'next/server';
import { getReadingsByReactor, deleteReading, upsertReading } from '@/lib/crud';
import type { Granularity } from '@prisma/client';

// GET /api/production/17W100P100P0135M?from=...&to=...&granularity=HOUR|DAY
export async function GET(req: NextRequest, { params }: { params: Promise<{ eic_code: string }> }) {
  const { eic_code } = await params;
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const granularity = searchParams.get('granularity') as Granularity | null;

  const data = await getReadingsByReactor(eic_code, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    granularity: granularity ?? undefined,
  });

  return NextResponse.json(data);
}

// PATCH /api/production/17W100P100P0135M
// Body : { start_date, value, name, production_type, granularity? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eic_code: string }> }) {
  const { eic_code } = await params;
  const body = await req.json();
  const result = await upsertReading({ ...body, eic_code });
  return NextResponse.json(result);
}

// DELETE /api/production/17W100P100P0135M?start_date=...&granularity=HOUR
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eic_code: string }> }) {
  const { eic_code } = await params;
  const { searchParams } = new URL(req.url);
  const start_date = searchParams.get('start_date');
  const granularity = (searchParams.get('granularity') as Granularity) ?? 'HOUR';

  if (!start_date) {
    return NextResponse.json({ error: 'Le paramètre start_date est requis' }, { status: 400 });
  }

  await deleteReading(eic_code, new Date(start_date), granularity);
  return NextResponse.json({ success: true });
}
