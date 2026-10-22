import { NextRequest, NextResponse } from 'next/server';
import { getReactor, upsertReactor, deleteReactor } from '@/lib/crud';

export async function GET(req: NextRequest, { params }: { params: Promise<{ eic_code: string }> }) {
  const { eic_code } = await params;
  const data = await getReactor(eic_code);
  if (!data) return NextResponse.json({ error: 'Réacteur introuvable' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eic_code: string }> }) {
  const { eic_code } = await params;
  const body = await req.json();
  const result = await upsertReactor({ ...body, eic_code });
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eic_code: string }> }) {
  const { eic_code } = await params;
  await deleteReactor(eic_code);
  return NextResponse.json({ success: true });
}
