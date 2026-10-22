import { NextResponse } from 'next/server';
import { listPlants } from '@/lib/energy';

export const dynamic = 'force-dynamic';

// GET /api/plants -> centrales (sites) avec leurs réacteurs, position et emprise
export async function GET() {
  try {
    const plants = await listPlants();
    return NextResponse.json(plants, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error('[api/plants]', err);
    return NextResponse.json({ error: 'Centrales indisponibles' }, { status: 503 });
  }
}
