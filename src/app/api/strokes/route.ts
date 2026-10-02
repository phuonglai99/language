import { NextRequest, NextResponse } from 'next/server';
import { getStrokes } from '@/server';

export const runtime = 'nodejs';

/** GET /api/strokes?chars=互联网 → { strokes: { 互: {...}, 联: {...}, 网: null } } */
export async function GET(req: NextRequest) {
  const chars = [...(req.nextUrl.searchParams.get('chars') ?? '')].filter(c => /\p{Script=Han}/u.test(c));
  if (!chars.length) return NextResponse.json({ error: 'chars required' }, { status: 400 });
  return NextResponse.json(
    { strokes: await getStrokes(chars) },
    // Stroke data never changes once crawled.
    { headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' } },
  );
}
