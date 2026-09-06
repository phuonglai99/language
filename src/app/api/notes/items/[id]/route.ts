import { NextRequest, NextResponse } from 'next/server';
import { deleteNoteItem } from '@/lib/db';

export const runtime = 'nodejs';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteNoteItem(id);
  return NextResponse.json({ ok: true });
}
