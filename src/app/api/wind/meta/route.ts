import { NextResponse } from 'next/server';
import { getWindLayers } from '@/lib/wind/cache';

export const dynamic = 'force-dynamic';

// GET /api/wind/meta -> couches de vent disponibles (zone, échelle, modèle, run, échéance)
export async function GET() {
  try {
    const layers = await getWindLayers();
    return NextResponse.json(
      {
        layers: layers.map((layer) => ({
          id: layer.id,
          model: layer.model,
          bounds: layer.bounds,
          imageUnscale: layer.imageUnscale,
          runTime: layer.runTime,
          validTime: layer.validTime,
          imageUrl: `/api/wind/image?layer=${layer.id}&v=${encodeURIComponent(layer.etag.replace(/"/g, ''))}`,
        })),
      },
      { headers: { 'Cache-Control': 'public, max-age=300' } }
    );
  } catch {
    return NextResponse.json({ error: 'Vent indisponible' }, { status: 503 });
  }
}
