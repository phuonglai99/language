import { NextRequest, NextResponse } from 'next/server';
import { listVocabByLevel } from '@/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const level = req.nextUrl.searchParams.get('level')?.trim() ?? '';
  if (!level) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: await listVocabByLevel(level) });
}
