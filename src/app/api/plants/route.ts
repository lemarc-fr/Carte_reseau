import { NextRequest, NextResponse } from 'next/server';
import { cachedPlants } from '@/lib/energy';

export const dynamic = 'force-dynamic';

// GET /api/plants -> sites avec leurs groupes, position et emprise (ETag : 304 si inchangé)
export async function GET(req: NextRequest) {
  try {
    const { json, etag } = await cachedPlants();
    const headers = {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      ETag: etag,
    };
    if (req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers });
    return new NextResponse(json, { headers: { ...headers, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[api/plants]', err);
    return NextResponse.json({ error: 'Centrales indisponibles' }, { status: 503 });
  }
}
