import { NextRequest, NextResponse } from 'next/server';
import { searchVocab } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 1) return NextResponse.json({ results: [] });
  const results = searchVocab(q);
  return NextResponse.json({ results });
}
