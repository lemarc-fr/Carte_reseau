import { NextRequest, NextResponse } from 'next/server';
import { listReactors, upsertReactor } from '@/lib/crud';

// GET /api/reactors -> liste des 57 réacteurs
export async function GET() {
  const data = await listReactors();
  return NextResponse.json(data);
}

// POST /api/reactors  { eic_code, name, production_type? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await upsertReactor(body);
  return NextResponse.json(result, { status: 201 });
}
