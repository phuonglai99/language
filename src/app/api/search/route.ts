import { NextRequest, NextResponse } from 'next/server';
import { lookupDictionary } from '@/server/services/dictionarySearch';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 1) return NextResponse.json({ results: [] });
  return NextResponse.json({ results: await lookupDictionary(q) });
}
