import { NextRequest, NextResponse } from 'next/server';
import { getLesson, deleteLesson } from '@/server';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = await getLesson(id);
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ lesson });
}

/** Only uploaded topics can be removed (their words stay in the dictionary); HSK lists cannot. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await deleteLesson(id))) return NextResponse.json({ error: 'Không xoá được bài này' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
