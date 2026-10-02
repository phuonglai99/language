import { NextRequest, NextResponse } from 'next/server';
import { getCharacterDetail } from '@/server';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ char: string }> }) {
  const { char } = await params;
  let decoded = char;
  try { decoded = decodeURIComponent(char); } catch { /* already decoded */ }
  const detail = await getCharacterDetail(decoded);
  if (!detail) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(detail);
}
