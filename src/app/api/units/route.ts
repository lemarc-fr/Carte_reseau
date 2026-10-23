import { NextRequest, NextResponse } from 'next/server';
import { listUnits, upsertUnit } from '@/lib/crud';

// GET /api/units -> groupes publiés par RTE (réacteurs, groupes hydrauliques, éolien en mer)
export async function GET() {
  const data = await listUnits();
  return NextResponse.json(data);
}

// POST /api/units  { eic_code, name, production_type? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await upsertUnit(body);
  return NextResponse.json(result, { status: 201 });
}
