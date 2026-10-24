import { NextRequest, NextResponse } from 'next/server';
import { getWindLayers } from '@/lib/wind/cache';

export const dynamic = 'force-dynamic';

// GET /api/wind/image?layer=europe|france -> texture WebP (R/G = u/v, alpha = donnée présente)
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('layer') ?? 'europe';
    const layer = (await getWindLayers()).find((l) => l.id === id);
    if (!layer) return new NextResponse(null, { status: 404 });

    if (request.headers.get('if-none-match') === layer.etag) {
      return new NextResponse(null, { status: 304 });
    }
    return new NextResponse(new Uint8Array(layer.webp), {
      headers: {
        'Content-Type': 'image/webp',
        // L'URL change avec l'échéance (paramètre v) : la texture peut être gardée longtemps
        'Cache-Control': 'public, max-age=86400, immutable',
        ETag: layer.etag,
      },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
