import { NextRequest, NextResponse } from 'next/server';
import { getNoteFolders, createNoteFolder } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ folders: getNoteFolders() });
}

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  return NextResponse.json({ folder: createNoteFolder(name) });
}
