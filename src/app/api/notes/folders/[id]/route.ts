import { NextRequest, NextResponse } from 'next/server';
import { renameNoteFolder, deleteNoteFolder } from '@/lib/db';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  renameNoteFolder(id, name);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteNoteFolder(id);
  return NextResponse.json({ ok: true });
}
