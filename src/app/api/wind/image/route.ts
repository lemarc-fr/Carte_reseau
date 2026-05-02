import { NextRequest, NextResponse } from 'next/server';
import { getWindData } from '@/lib/wind/cache';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { webp, etag, expiresAt } = await getWindData();

    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304 });
    }

    const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

    return new NextResponse(new Uint8Array(webp), {  // ← Buffer → Uint8Array
    headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=60`,
        'ETag': etag,
    },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}