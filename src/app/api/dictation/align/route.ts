import { NextRequest, NextResponse } from 'next/server';
import { getMBAlignSummaries } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const unmatchedOnly = searchParams.get('unmatched') === '1';
  const hsk = searchParams.get('hsk');
  const q = searchParams.get('q')?.toLowerCase() ?? '';
  const status = searchParams.get('status')?.toLowerCase() ?? '';

  let lessons = getMBAlignSummaries();
  if (hsk) lessons = lessons.filter(l => l.hsk_level === Number(hsk));
  if (unmatchedOnly) lessons = lessons.filter(l => l.unmatchedCount > 0);
  if (status === 'checked') lessons = lessons.filter(l => l.unmatchedCount === 0);
  else if (status === 'uncheck' || status === 'unchecked') lessons = lessons.filter(l => l.unmatchedCount > 0);
  if (q) {
    lessons = lessons.filter(
      l =>
        l.title_en.toLowerCase().includes(q) ||
        l.title_zh_simplified.includes(q) ||
        l.slug.includes(q),
    );
  }

  return NextResponse.json({ lessons });
}
