import { NextRequest, NextResponse } from 'next/server';
import { listGrammarByLevel, listGrammarCounts } from '@/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const level = req.nextUrl.searchParams.get('level')?.trim() ?? '';
  if (!level) {
    return NextResponse.json({ counts: await listGrammarCounts() });
  }
  return NextResponse.json({ items: await listGrammarByLevel(level) });
}
