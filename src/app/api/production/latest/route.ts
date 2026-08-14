import { NextRequest, NextResponse } from 'next/server';
import { getLatestForAllReactors, getLatestForReactor } from '@/lib/crud';

// GET /api/production/latest            -> dernière valeur de CHAQUE centrale (57 lignes)
// GET /api/production/latest?eic_code=... -> dernière valeur d'une seule centrale
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eic_code = searchParams.get('eic_code');

  if (eic_code) {
    const data = await getLatestForReactor(eic_code);
    if (!data) return NextResponse.json({ error: 'Aucun relevé trouvé' }, { status: 404 });
    return NextResponse.json(data);
  }

  const data = await getLatestForAllReactors();
  return NextResponse.json(data);
}
