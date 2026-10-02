import { NextRequest, NextResponse } from 'next/server';
import { listNoteFolders, createNoteFolder } from '@/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ folders: await listNoteFolders() });
}

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  return NextResponse.json({ folder: await createNoteFolder(name) });
}
