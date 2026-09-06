import { NextRequest, NextResponse } from 'next/server';
import { getNoteItems, addNoteItem } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const folderId = req.nextUrl.searchParams.get('folderId');
  if (!folderId) return NextResponse.json({ error: 'folderId required' }, { status: 400 });
  return NextResponse.json({ items: getNoteItems(folderId) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { folderId, zh, py, vn, pos, sourceLessonId } = body;
  if (!folderId || !zh) return NextResponse.json({ error: 'folderId and zh required' }, { status: 400 });
  const item = addNoteItem({ folderId, zh, py: py ?? '', vn: vn ?? '', pos: pos ?? '', sourceLessonId: sourceLessonId ?? null });
  return NextResponse.json({ item });
}
