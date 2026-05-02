import { NextRequest, NextResponse } from 'next/server';
import { getWindData } from '@/lib/wind/cache';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { imageUnscale, speedMax, etag, expiresAt } = await getWindData();

    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304 });
    }

    const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

    return NextResponse.json(
      { imageUnscale, speedMax, imageUrl: '/api/wind/image' },
      {
        headers: {
          'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=60`,
          'ETag': etag,
        },
      }
    );
  } catch {
    return NextResponse.json({ error: 'Wind data unavailable' }, { status: 503 });
  }
}