import { NextRequest, NextResponse } from 'next/server';
import { getPassage } from '@/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lesson = await getPassage(slug);
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ lesson });
}
