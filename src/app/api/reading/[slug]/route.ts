import { NextRequest, NextResponse } from 'next/server';
import { getMBLesson } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lesson = getMBLesson(slug);
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ lesson });
}
