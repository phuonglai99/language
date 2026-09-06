import { NextRequest, NextResponse } from 'next/server';
import { getVocabByLevel } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const level = req.nextUrl.searchParams.get('level')?.trim() ?? '';
  if (!level) return NextResponse.json({ items: [] });
  const items = getVocabByLevel(level);
  return NextResponse.json({ items });
}
