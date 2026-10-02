import { NextRequest, NextResponse } from 'next/server';
import { deleteNoteItem } from '@/server';

export const runtime = 'nodejs';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteNoteItem(id);
  return NextResponse.json({ ok: true });
}
